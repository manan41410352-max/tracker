import "server-only";

import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import os from "os";
import path from "path";

import type { BuilderMemoryEntry } from "@/lib/agent-builder";
import {
  ollamaGenerateJson,
  ollamaGenerateJsonFromImages,
} from "@/lib/ollama";
import { tryParseJson } from "@/lib/server/runtime-utils";

const ASSISTANT_UPLOAD_DIR = path.join(
  os.tmpdir(),
  "systematic-tracker-assistant-uploads"
);
const ASSISTANT_EXTRACTION_MODEL =
  process.env.OLLAMA_QWEN_EXTRACTOR_MODEL?.trim() || "qwen3:14b-q4_K_M";
const PREFERRED_MEMORY_KEYS = [
  "today_tasks",
  "fixed_commitments",
  "available_hours_today",
  "sleep_hours",
  "energy_level",
  "focus_level",
  "work_load",
  "money_state",
  "friends_family_state",
  "health_state",
  "little_jobs_state",
  "preferred_day_start",
  "preferred_day_end",
  "deep_work_block_minutes",
  "break_style",
  "schedule_style",
  "existing_timetable_notes",
  "fitbit_health_notes",
  "calendar_sync_notes",
  "money_concern",
  "work_priority",
  "focus_target",
  "energy_pattern",
  "health_goal",
  "health_signal",
  "little_jobs_top_item",
  "week_summary",
  "month_summary",
  "day_summary",
];
const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".ics",
  ".html",
  ".htm",
  ".xml",
  ".yaml",
  ".yml",
]);
const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".bmp",
]);

type StoredAssistantUpload = {
  originalName: string;
  storedPath: string;
  contentType: string;
  extension: string;
  size: number;
};

type FileIntelligence = {
  fileName: string;
  storedPath: string;
  contentType: string;
  summary: string;
  relevantDomains: string[];
  usefulFacts: string[];
};

type AssistantIntelligence = {
  attachmentPaths: string[];
  fileSummaries: FileIntelligence[];
  builderMemoryEntries: BuilderMemoryEntry[];
  assistantContext: string;
  warnings: string[];
};

function decodeTextBuffer(buffer: Buffer) {
  return buffer.toString("utf8").replace(/\u0000/g, "").trim();
}

function trimForPrompt(value: string, maxLength = 12_000) {
  const trimmed = value.trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}\n...[truncated]` : trimmed;
}

function normalizeMemoryEntries(entries: any[]): BuilderMemoryEntry[] {
  const updatedAt = new Date().toISOString();
  const deduped = new Map<string, BuilderMemoryEntry>();

  for (const entry of entries) {
    const key = String(entry?.key || entry?.memoryKey || "").trim();
    const label = String(entry?.label || key || "File insight").trim();
    const value = String(entry?.value || "").trim();

    if (!key || !value) {
      continue;
    }

    deduped.set(key, {
      key,
      label,
      value,
      updatedAt,
    });
  }

  return [...deduped.values()];
}

async function persistAssistantUploads(files: File[]) {
  await mkdir(ASSISTANT_UPLOAD_DIR, { recursive: true });

  const stored = await Promise.all(
    files.map(async (file) => {
      const safeName = path.basename(file.name || `upload-${randomUUID()}`);
      const extension = path.extname(safeName || "").toLowerCase();
      const storedPath = path.join(
        ASSISTANT_UPLOAD_DIR,
        `${Date.now()}-${randomUUID()}${extension || ".bin"}`
      );
      const buffer = Buffer.from(await file.arrayBuffer());

      await writeFile(storedPath, buffer);

      return {
        originalName: safeName,
        storedPath,
        contentType: file.type || "application/octet-stream",
        extension,
        size: buffer.length,
      } satisfies StoredAssistantUpload;
    })
  );

  return stored;
}

async function analyzeImageUpload(upload: StoredAssistantUpload) {
  const fileBuffer = await readFile(upload.storedPath).catch(() => null);
  if (!fileBuffer) {
    return {
      fileName: upload.originalName,
      storedPath: upload.storedPath,
      contentType: upload.contentType,
      summary: `Unable to read ${upload.originalName}.`,
      relevantDomains: [],
      usefulFacts: [],
    } satisfies FileIntelligence;
  }

  const raw = await ollamaGenerateJsonFromImages({
    preferredModel: "qwen2.5vl:7b",
    images: [Buffer.from(fileBuffer).toString("base64")],
    prompt: `You are extracting tracker-relevant information from an uploaded image.
Return only valid JSON:
{
  "summary": "",
  "relevantDomains": [""],
  "usefulFacts": [""]
}

Focus on schedules, class calendars, bank or finance screens, Fitbit or health dashboards, planners, and anything relevant to daily/weekly/monthly planning.`,
  });
  const parsed = tryParseJson(raw || "");

  return {
    fileName: upload.originalName,
    storedPath: upload.storedPath,
    contentType: upload.contentType,
    summary: String(parsed && typeof parsed === "object" ? parsed.summary || "" : ""),
    relevantDomains:
      parsed && typeof parsed === "object" && Array.isArray((parsed as any).relevantDomains)
        ? (parsed as any).relevantDomains.map((item: unknown) => String(item || "")).filter(Boolean)
        : [],
    usefulFacts:
      parsed && typeof parsed === "object" && Array.isArray((parsed as any).usefulFacts)
        ? (parsed as any).usefulFacts.map((item: unknown) => String(item || "")).filter(Boolean)
        : [],
  } satisfies FileIntelligence;
}

async function extractTextFromUpload(upload: StoredAssistantUpload) {
  const fileBuffer = await readFile(upload.storedPath);

  if (upload.contentType.includes("pdf") || upload.extension === ".pdf") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
      const pdfParseMod = require("pdf-parse") as any;
      const parseFn: (buffer: Buffer) => Promise<{ text: string }> =
        typeof pdfParseMod === "function" ? pdfParseMod : pdfParseMod.default;
      const parsed = await parseFn(fileBuffer);
      return trimForPrompt(String(parsed.text || ""));
    } catch (error) {
      return "";
    }
  }

  if (
    upload.contentType.startsWith("text/") ||
    TEXT_EXTENSIONS.has(upload.extension) ||
    upload.contentType.includes("json") ||
    upload.contentType.includes("xml")
  ) {
    return trimForPrompt(decodeTextBuffer(fileBuffer));
  }

  return trimForPrompt(decodeTextBuffer(fileBuffer));
}

async function analyzeTextUpload(upload: StoredAssistantUpload) {
  const extractedText = await extractTextFromUpload(upload);

  if (!extractedText) {
    return {
      fileName: upload.originalName,
      storedPath: upload.storedPath,
      contentType: upload.contentType,
      summary: `No readable text could be extracted from ${upload.originalName}.`,
      relevantDomains: [],
      usefulFacts: [],
    } satisfies FileIntelligence;
  }

  const raw = await ollamaGenerateJson(
    `You are extracting tracker-relevant information from an uploaded file.
Return only valid JSON:
{
  "summary": "",
  "relevantDomains": [""],
  "usefulFacts": [""]
}

File name: ${upload.originalName}
Content type: ${upload.contentType}

Extracted content:
${extractedText}

Focus on schedule commitments, tasks, money pressure, health or sleep signals, calendar blocks, class schedules, recurring constraints, and any details that can prefill a daily/weekly/monthly planning workflow.`,
    ASSISTANT_EXTRACTION_MODEL
  );
  const parsed = tryParseJson(raw || "");

  return {
    fileName: upload.originalName,
    storedPath: upload.storedPath,
    contentType: upload.contentType,
    summary: String(parsed && typeof parsed === "object" ? parsed.summary || "" : ""),
    relevantDomains:
      parsed && typeof parsed === "object" && Array.isArray((parsed as any).relevantDomains)
        ? (parsed as any).relevantDomains.map((item: unknown) => String(item || "")).filter(Boolean)
        : [],
    usefulFacts:
      parsed && typeof parsed === "object" && Array.isArray((parsed as any).usefulFacts)
        ? (parsed as any).usefulFacts.map((item: unknown) => String(item || "")).filter(Boolean)
        : [],
  } satisfies FileIntelligence;
}

async function analyzeStoredUpload(upload: StoredAssistantUpload) {
  try {
    if (
      upload.contentType.startsWith("image/") ||
      IMAGE_EXTENSIONS.has(upload.extension)
    ) {
      return await analyzeImageUpload(upload);
    }

    return await analyzeTextUpload(upload);
  } catch (error) {
    return {
      fileName: upload.originalName,
      storedPath: upload.storedPath,
      contentType: upload.contentType,
      summary:
        error instanceof Error
          ? `Unable to fully analyze ${upload.originalName}: ${error.message}`
          : `Unable to fully analyze ${upload.originalName}.`,
      relevantDomains: [],
      usefulFacts: [],
    } satisfies FileIntelligence;
  }
}

export async function analyzeAssistantUploads({
  prompt,
  files,
}: {
  prompt: string;
  files: File[];
}): Promise<AssistantIntelligence> {
  if (!files.length) {
    return {
      attachmentPaths: [],
      fileSummaries: [],
      builderMemoryEntries: [],
      assistantContext: "",
      warnings: [],
    };
  }

  const limitedFiles = files.slice(0, 8);
  let storedUploads: StoredAssistantUpload[] = [];

  try {
    storedUploads = await persistAssistantUploads(limitedFiles);
  } catch (error) {
    return {
      attachmentPaths: [],
      fileSummaries: limitedFiles.map((file) => ({
        fileName: file.name || "Uploaded file",
        storedPath: "",
        contentType: file.type || "application/octet-stream",
        summary: `The file was uploaded but local analysis could not start for ${file.name || "this file"}.`,
        relevantDomains: [],
        usefulFacts: [],
      })),
      builderMemoryEntries: [],
      assistantContext: "",
      warnings: [
        error instanceof Error
          ? `Uploaded files are available, but local file analysis could not start: ${error.message}`
          : "Uploaded files are available, but local file analysis could not start.",
      ],
    };
  }

  const fileSummaries = await Promise.all(
    storedUploads.map((upload) => analyzeStoredUpload(upload))
  );
  const synthesisPrompt = `You are synthesizing multiple uploaded files into reusable workflow answers for a tracker assistant.
Return only valid JSON:
{
  "assistantContext": "",
  "memoryEntries": [
    {
      "key": "",
      "label": "",
      "value": ""
    }
  ],
  "warnings": [""]
}

User summary:
${String(prompt || "").trim()}

Uploaded file analyses:
${JSON.stringify(fileSummaries, null, 2)}

Preferred reusable memory keys:
${PREFERRED_MEMORY_KEYS.join(", ")}

Rules:
- Convert the uploaded files into concrete reusable answers that can prefill workflow questions.
- If there is a bank statement, extract the money-related context into keys like money_state, money_concern, or useful finance notes.
- If there is a calendar or class schedule, extract fixed commitments, timetable notes, day start/end, or available hours.
- If there is a health schedule, Fitbit dashboard, or recovery plan, extract sleep, health, energy, and fitbit_health_notes where justified.
- If there is a work or class schedule, extract today_tasks, fixed_commitments, work_priority, or focus_target where justified.
- Keep every value as a concise string.
- assistantContext should summarize what the uploaded files reveal about the user's day, week, or month so the ChatGPT proxy can ask smarter questions.
- warnings should mention uncertainty or missing coverage if some files were hard to parse.
- Return JSON only.`;
  const fallbackAssistantContext = fileSummaries
    .map((item) => `${item.fileName}: ${item.summary}`)
    .filter(Boolean)
    .join("\n");
  let parsed: unknown = null;
  const warnings: string[] = [];

  try {
    const raw = await ollamaGenerateJson(
      synthesisPrompt,
      ASSISTANT_EXTRACTION_MODEL
    );
    parsed = tryParseJson(raw || "");
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? `Local Qwen file synthesis is temporarily unavailable: ${error.message}`
        : "Local Qwen file synthesis is temporarily unavailable."
    );
  }

  const normalizedEntries = normalizeMemoryEntries(
    parsed && typeof parsed === "object" && Array.isArray((parsed as any).memoryEntries)
      ? (parsed as any).memoryEntries
      : []
  );
  const assistantContext =
    parsed && typeof parsed === "object"
      ? String((parsed as any).assistantContext || fallbackAssistantContext)
      : fallbackAssistantContext;
  const builderMemoryEntries = normalizedEntries.length
    ? normalizedEntries
    : assistantContext
      ? [
          {
            key: "uploaded_file_intelligence",
            label: "Uploaded file intelligence",
            value: assistantContext,
            updatedAt: new Date().toISOString(),
          } satisfies BuilderMemoryEntry,
        ]
      : [];

  return {
    attachmentPaths: storedUploads.map((upload) => upload.storedPath),
    fileSummaries,
    builderMemoryEntries,
    assistantContext,
    warnings: [
      ...warnings,
      ...(parsed && typeof parsed === "object" && Array.isArray((parsed as any).warnings)
        ? (parsed as any).warnings.map((item: unknown) => String(item || "")).filter(Boolean)
        : []),
    ],
  };
}

export function parseJsonFormValue<T>(value: FormDataEntryValue | null, fallback: T): T {
  if (typeof value !== "string") {
    return fallback;
  }

  const parsed = tryParseJson(value);
  return parsed === null ? fallback : (parsed as T);
}
