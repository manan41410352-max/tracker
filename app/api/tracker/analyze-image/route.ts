import { NextRequest, NextResponse } from "next/server";

import { ollamaGenerateJson, ollamaGenerateJsonFromImages } from "@/lib/ollama";
import { tryParseJson } from "@/lib/server/runtime-utils";

export const runtime = "nodejs";

type TrackerFieldPayload = {
  id: string;
  label: string;
  type: string;
  options?: string[];
  memoryKey?: string;
};

function parseJsonField<T>(value: FormDataEntryValue | null, fallback: T): T {
  if (typeof value !== "string") {
    return fallback;
  }

  const parsed = tryParseJson(value);
  return parsed === null ? fallback : (parsed as T);
}

async function toBase64(file: File | null) {
  if (!file) {
    return "";
  }

  return Buffer.from(await file.arrayBuffer()).toString("base64");
}

async function analyzeTimetableImage(imageBase64: string) {
  if (!imageBase64) {
    return null;
  }

  const raw = await ollamaGenerateJsonFromImages({
    preferredModel: "qwen2.5vl:7b",
    images: [imageBase64],
    prompt: `You are analyzing a user's existing timetable or schedule screenshot.
Return only valid JSON:
{
  "summary": "",
  "scheduleStyle": "",
  "preferredDayStart": "",
  "preferredDayEnd": "",
  "deepWorkBlockMinutes": "",
  "keyBlocks": [
    {
      "start": "",
      "end": "",
      "title": ""
    }
  ]
}

Focus on extracting:
- visible time ranges
- recurring patterns
- whether the schedule looks structured, balanced, or flexible
- likely deep-work block length
- anything the future timetable should preserve.`,
  });

  return tryParseJson(raw || "");
}

async function analyzeFitbitImage(imageBase64: string) {
  if (!imageBase64) {
    return null;
  }

  const raw = await ollamaGenerateJsonFromImages({
    preferredModel: "qwen2.5vl:7b",
    images: [imageBase64],
    prompt: `You are analyzing a Fitbit or health dashboard screenshot.
Return only valid JSON:
{
  "summary": "",
  "sleepHours": "",
  "energyLevelHint": "",
  "healthStateHint": "",
  "focusLevelHint": "",
  "signals": [""]
}

Extract only what is reasonably visible.
If a value is unclear, return an empty string for that field.
Use 1-10 hints only when the screenshot strongly supports it.`,
  });

  return tryParseJson(raw || "");
}

function buildFallbackMerge({
  timetable,
  fitbit,
  answers,
}: {
  timetable: any;
  fitbit: any;
  answers: Record<string, string>;
}) {
  const fills: Record<string, string> = {};

  if (!answers.existing_timetable_notes && timetable?.summary) {
    fills.existing_timetable_notes = String(timetable.summary);
  }

  if (!answers.schedule_style && timetable?.scheduleStyle) {
    fills.schedule_style = String(timetable.scheduleStyle);
  }

  if (!answers.preferred_day_start && timetable?.preferredDayStart) {
    fills.preferred_day_start = String(timetable.preferredDayStart);
  }

  if (!answers.preferred_day_end && timetable?.preferredDayEnd) {
    fills.preferred_day_end = String(timetable.preferredDayEnd);
  }

  if (!answers.deep_work_block_minutes && timetable?.deepWorkBlockMinutes) {
    fills.deep_work_block_minutes = String(timetable.deepWorkBlockMinutes);
  }

  if (!answers.fitbit_health_notes && fitbit?.summary) {
    fills.fitbit_health_notes = String(fitbit.summary);
  }

  if (!answers.sleep_hours && fitbit?.sleepHours) {
    fills.sleep_hours = String(fitbit.sleepHours);
  }

  if (!answers.energy_level && fitbit?.energyLevelHint) {
    fills.energy_level = String(fitbit.energyLevelHint);
  }

  if (!answers.health_state && fitbit?.healthStateHint) {
    fills.health_state = String(fitbit.healthStateHint);
  }

  if (!answers.focus_level && fitbit?.focusLevelHint) {
    fills.focus_level = String(fitbit.focusLevelHint);
  }

  return {
    fills,
    notes: [
      timetable?.summary ? "Used the timetable image to suggest scheduling preferences." : "",
      fitbit?.summary ? "Used the Fitbit image to suggest health and sleep context." : "",
    ].filter(Boolean),
    reusableMemoryBootstrap: {
      ...(timetable?.summary ? { existing_timetable_notes: String(timetable.summary) } : {}),
      ...(fitbit?.summary ? { fitbit_health_notes: String(fitbit.summary) } : {}),
    },
    extracted: {
      timetable,
      fitbit,
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const timetableImage = formData.get("timetableImage");
    const fitbitImage = formData.get("fitbitImage");
    const fields = parseJsonField<TrackerFieldPayload[]>(formData.get("fields"), []);
    const answers = parseJsonField<Record<string, string>>(formData.get("answers"), {});
    const task = typeof formData.get("task") === "string" ? String(formData.get("task")) : "";

    const [timetable, fitbit] = await Promise.all([
      timetableImage instanceof File ? analyzeTimetableImage(await toBase64(timetableImage)) : null,
      fitbitImage instanceof File ? analyzeFitbitImage(await toBase64(fitbitImage)) : null,
    ]);

    const fallback = buildFallbackMerge({
      timetable,
      fitbit,
      answers,
    });

    if (!timetable && !fitbit) {
      return NextResponse.json(fallback);
    }

    try {
      const raw = await ollamaGenerateJson(
        `You are mapping extracted tracker image data into run-setup answers for a daily planner.
Return only valid JSON:
{
  "fills": {
    "field_id": "value"
  },
  "reusableMemoryBootstrap": {
    "memory_key": "value"
  },
  "notes": [""]
}

Current task:
${task || "No task provided."}

Current run-setup fields:
${JSON.stringify(fields, null, 2)}

Existing user answers:
${JSON.stringify(answers, null, 2)}

Extracted timetable image data:
${JSON.stringify(timetable, null, 2)}

Extracted Fitbit image data:
${JSON.stringify(fitbit, null, 2)}

Rules:
- Prefer filling only blank or weakly informed fields.
- Use the extracted timetable to fill schedule preference fields when confident.
- Use the Fitbit image to fill sleep, energy, focus, or health fields only when reasonably supported.
- Store concise summaries in reusableMemoryBootstrap under existing_timetable_notes and fitbit_health_notes when useful.
- Keep values plain strings.
- Do not invent data that is not visible or strongly implied.
- Return JSON only.`,
        "qwen3:14b-q4_K_M"
      );
      const parsed = tryParseJson(raw || "");

      if (!parsed || typeof parsed !== "object") {
        return NextResponse.json(fallback);
      }

      return NextResponse.json({
        fills:
          parsed.fills && typeof parsed.fills === "object"
            ? { ...fallback.fills, ...parsed.fills }
            : fallback.fills,
        reusableMemoryBootstrap:
          parsed.reusableMemoryBootstrap &&
          typeof parsed.reusableMemoryBootstrap === "object"
            ? {
                ...fallback.reusableMemoryBootstrap,
                ...parsed.reusableMemoryBootstrap,
              }
            : fallback.reusableMemoryBootstrap,
        notes: Array.isArray(parsed.notes)
          ? [...fallback.notes, ...parsed.notes.map((item: unknown) => String(item || ""))].filter(Boolean)
          : fallback.notes,
        extracted: fallback.extracted,
      });
    } catch (error) {
      console.warn("Tracker image fill mapping fell back to deterministic extraction.", error);
      return NextResponse.json(fallback);
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to analyze tracker images.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
