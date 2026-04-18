import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  normalizeClarificationQuestions,
  toNormalizedLookupKey,
} from "@/lib/agent-builder";
import {
  buildTrackerMemoryContext,
  buildTrackerMemoryTimelineContext,
  isTrackerWorkflowRequest,
} from "@/lib/tracker-workflow";
import {
  analyzeAssistantUploads,
  parseJsonFormValue,
} from "@/lib/server/tracker-assistant-intelligence";
import { requestChatGptBuilderJson } from "@/lib/server/chatgpt-builder";

export const runtime = "nodejs";

const ClarificationQuestionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  question: z.string().min(1),
  responseType: z.enum(["short-answer", "mcq"]),
  options: z.array(z.string().min(1)).max(6).optional(),
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
  memoryKey: z.string().min(1).optional(),
});

const ClarificationPayloadSchema = z.object({
  assistantMessage: z.string().min(1),
  questions: z.array(ClarificationQuestionSchema).min(2).max(6),
});

const PROMPT = `You are helping a user design an AI workflow builder experience.
Your job is to ask one concise, task-specific requirement form before generating the workflow.

Return only valid JSON in this exact shape:
{
  "assistantMessage": "",
  "questions": [
    {
      "id": "",
      "label": "",
      "question": "",
      "responseType": "short-answer",
      "options": [],
      "required": true,
      "placeholder": "",
      "memoryKey": ""
    }
  ]
}

Rules:
- Ask concise, high-value questions that help the workflow builder create a better agent.
- Prefer concrete task inputs over abstract meta questions.
- For example, a movie ticket booking workflow should ask for the movie, city, date, and number of tickets before asking about automation level or tooling.
- Ask only the fields that materially unblock the workflow.
- Treat uploaded raw files and extracted file intelligence as first-class inputs. If the files already reveal commitments, categories, formats, or constraints, ask about those specifically instead of falling back to generic questions.
- If the task sounds like browser or website automation, ask for the end result plus any important site or app context.
- If the task is about daily planning, sleep, energy, focus, errands, or a personal tracker workflow, bias toward questions that sharpen today's outcome and constraints instead of generic automation questions.
- Prefer a systematic mix of "mcq" and "short-answer" questions when both help the workflow design. Use "mcq" when there are 2 to 5 clear choices. Use "short-answer" otherwise.
- Each question should be answerable in a popup dialog.
- Keep the assistantMessage conversational and short, like a chatbot asking for missing details.
- memoryKey should be a stable reusable key derived from the actual field, such as "movie_name", "travel_date", or "ticket_count".
- Do not ask irrelevant onboarding questions.
- Do not ask duplicate questions.
- Avoid generic questions like "How autonomous should the agent be?" unless the task truly cannot be executed without that choice.
- Every question should directly improve how the workflow canvas will be designed later.
- Return JSON only.`;

function buildMovieTicketQuestions(prompt: string) {
  const shortenedPrompt = prompt.trim().slice(0, 120);

  return {
    assistantMessage:
      "I can build the booking workflow. I just need the core ticket details first.",
    questions: [
      {
        id: "movie_name",
        label: "Movie",
        question: `Which movie should the ticket booking workflow search for in "${shortenedPrompt || "this booking flow"}"?`,
        responseType: "short-answer" as const,
        options: [],
        required: true,
        placeholder: "Example: Interstellar",
        memoryKey: "movie_name",
      },
      {
        id: "city",
        label: "City",
        question: "Which city should the workflow look in?",
        responseType: "short-answer" as const,
        options: [],
        required: true,
        placeholder: "Example: Mumbai",
        memoryKey: "city",
      },
      {
        id: "show_date",
        label: "Date",
        question: "What show date should the workflow use?",
        responseType: "short-answer" as const,
        options: [],
        required: true,
        placeholder: "Example: Friday evening or 2026-04-18",
        memoryKey: "show_date",
      },
      {
        id: "ticket_count",
        label: "Number of tickets",
        question: "How many tickets should it try to book?",
        responseType: "short-answer" as const,
        options: [],
        required: true,
        placeholder: "Example: 2",
        memoryKey: "ticket_count",
      },
    ],
  };
}

function buildGenericFallbackQuestions(prompt: string) {
  const shortenedPrompt = prompt.trim().slice(0, 120);

  return {
    assistantMessage:
      "I have the rough brief. Before I research and build the workflow, I need the exact outcome and any site or app context.",
    questions: [
      {
        id: "primary_goal",
        label: "Primary goal",
        question: `What exact result should this workflow deliver for "${shortenedPrompt || "this task"}"?`,
        responseType: "short-answer" as const,
        options: [],
        required: true,
        placeholder: "Describe the final result you want",
        memoryKey: "primary_goal",
      },
      {
        id: "key_inputs",
        label: "Site or app context",
        question: "Which website, web app, inbox, dashboard, or system does this workflow need to start from, if any?",
        responseType: "short-answer" as const,
        options: [],
        required: true,
        placeholder: "Examples: Gmail inbox, Amazon seller dashboard, company portal, or public website",
        memoryKey: "site_or_app_context",
      },
      {
        id: "constraints",
        label: "Constraints",
        question: "Are there any inputs, sites, tools, formats, or guardrails the agent should respect?",
        responseType: "short-answer" as const,
        options: [],
        required: false,
        placeholder: "Examples: keep it local, avoid paid APIs, ask before checkout",
        memoryKey: "constraints",
      },
    ],
  };
}

function buildTrackerFallbackQuestions(prompt: string) {
  const shortenedPrompt = prompt.trim().slice(0, 120);

  return {
    assistantMessage:
      "I can turn this into a tracker workflow. I just need the planning target and today's hard constraints first.",
    questions: [
      {
        id: "daily_goal",
        label: "Main outcome",
        question: `What should today's workflow optimize for in "${shortenedPrompt || "this tracker plan"}"?`,
        responseType: "short-answer" as const,
        options: [],
        required: true,
        placeholder: "Example: finish the proposal without burning out",
        memoryKey: "daily_goal",
      },
      {
        id: "must_do_tasks",
        label: "Must-do tasks",
        question: "What absolutely needs to happen today?",
        responseType: "short-answer" as const,
        options: [],
        required: true,
        placeholder: "Example: proposal draft, doctor call, groceries",
        memoryKey: "must_do_tasks",
      },
      {
        id: "fixed_constraints",
        label: "Fixed constraints",
        question: "What fixed commitments, time limits, or guardrails should shape the timetable?",
        responseType: "short-answer" as const,
        options: [],
        required: false,
        placeholder: "Example: 2 meetings, gym at 7pm, no late-night work",
        memoryKey: "fixed_constraints",
      },
    ],
  };
}

function buildFallbackQuestions(prompt: string) {
  const normalizedPrompt = prompt.toLowerCase();

  if (isTrackerWorkflowRequest(prompt)) {
    return buildTrackerFallbackQuestions(prompt);
  }

  if (
    /(movie|cinema|showtime).*(ticket|booking|book)/i.test(normalizedPrompt) ||
    /(ticket|booking|book).*(movie|cinema|showtime)/i.test(normalizedPrompt)
  ) {
    return buildMovieTicketQuestions(prompt);
  }

  return buildGenericFallbackQuestions(prompt);
}

async function readClarifyRequest(req: NextRequest) {
  const contentType = String(req.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();

    return {
      prompt: String(formData.get("prompt") || ""),
      agentName: String(formData.get("agentName") || ""),
      builderMemory: parseJsonFormValue<any[]>(formData.get("builderMemory"), []),
      agentMemory: parseJsonFormValue<any[]>(formData.get("agentMemory"), []),
      agentMemoryTimeline: parseJsonFormValue<any[]>(
        formData.get("agentMemoryTimeline"),
        []
      ),
      existingResearch: parseJsonFormValue<any[]>(formData.get("existingResearch"), []),
      existingFlowConfig: parseJsonFormValue<any>(formData.get("existingFlowConfig"), null),
      assistantFiles: formData
        .getAll("assistantFiles")
        .filter((entry): entry is File => entry instanceof File),
    };
  }

  const json = await req.json();
  return {
    ...json,
    assistantFiles: [],
  };
}

export async function POST(req: NextRequest) {
  console.log("CLARIFY API POST CALLED!");
  try {
    const {
      prompt,
      agentName,
      builderMemory,
      agentMemory,
      agentMemoryTimeline,
      existingResearch,
      existingFlowConfig,
      assistantFiles,
    } = await readClarifyRequest(req);

    if (!prompt || !String(prompt).trim()) {
      return NextResponse.json(
        { error: "Add a rough prompt before asking the builder to clarify it." },
        { status: 400 }
      );
    }

    const assistantUploadIntelligence = await analyzeAssistantUploads({
      prompt: String(prompt).trim(),
      files: Array.isArray(assistantFiles) ? assistantFiles : [],
    });
    const mergedBuilderMemory = [
      ...(Array.isArray(builderMemory) ? builderMemory : []),
      ...assistantUploadIntelligence.builderMemoryEntries,
    ];

    const memoryText = Array.isArray(mergedBuilderMemory)
      ? mergedBuilderMemory
          .map((entry: any) => `${entry?.label || entry?.key || "Memory"}: ${entry?.value || ""}`)
          .filter(Boolean)
          .join("\n")
      : "No saved builder memory yet.";

    const researchText = Array.isArray(existingResearch)
      ? existingResearch
          .map(
            (item: any, index: number) =>
              `${index + 1}. ${item?.title || "Point"}: ${item?.point || ""}`
          )
          .join("\n")
      : "No saved research notes yet.";
    const agentMemoryText = buildTrackerMemoryContext(
      Array.isArray(agentMemory) ? agentMemory : []
    );
    const agentMemoryTimelineText = buildTrackerMemoryTimelineContext(
      Array.isArray(agentMemoryTimeline) ? agentMemoryTimeline : []
    );
    const trackerHint = isTrackerWorkflowRequest(String(prompt).trim())
      ? "\nTracker workflow hint:\nThe user is asking for a personal planning workflow. Favor a Daily Check-in, life-area analysis, and timetable-shaped planning structure."
      : "";
    const fileIntelligenceText = assistantUploadIntelligence.assistantContext
      ? `\nUploaded file intelligence:\n${assistantUploadIntelligence.assistantContext}\n\nPer-file notes:\n${assistantUploadIntelligence.fileSummaries
          .map(
            (item, index) =>
              `${index + 1}. ${item.fileName}: ${item.summary}${
                item.usefulFacts.length ? `\nFacts: ${item.usefulFacts.join("; ")}` : ""
              }`
          )
          .join("\n")}`
      : "\nNo uploaded files were provided.";

    const flowText = existingFlowConfig
      ? JSON.stringify(existingFlowConfig, null, 2)
      : "No existing workflow yet.";

    try {
      const rawPayload = await requestChatGptBuilderJson<any>({
        action: "prepare builder clarification questions",
        prompt: `${PROMPT}

Agent name: ${String(agentName || "New workflow agent")}

User rough prompt:
${String(prompt).trim()}

Saved builder memory:
${memoryText}

Persisted agent memory:
${agentMemoryText}

Recent agent memory timeline:
${agentMemoryTimelineText}

${fileIntelligenceText}

Raw uploaded files are attached to this request. Inspect both the attachments and the extracted file intelligence before deciding which popup questions to ask.

Existing research notes:
${researchText}

Existing workflow:
${flowText}${trackerHint}`,
        attachments: assistantUploadIntelligence.attachmentPaths,
      });
      const parsed = ClarificationPayloadSchema.parse(rawPayload);
      const normalizedQuestions = normalizeClarificationQuestions(parsed.questions);

      return NextResponse.json({
        assistantMessage: parsed.assistantMessage,
        autoMemoryEntries: assistantUploadIntelligence.builderMemoryEntries,
        fileSummaries: assistantUploadIntelligence.fileSummaries,
        fileWarnings: assistantUploadIntelligence.warnings,
        questions: normalizedQuestions.map((question, index) => ({
          ...question,
          id: question.id || toNormalizedLookupKey(question.memoryKey || question.label, `question_${index + 1}`),
          options: question.options ?? [],
          required: question.required ?? true,
        })),
      });
    } catch (error) {
      console.warn("ChatGPT builder clarify failed, using deterministic fallback.", error);
      return NextResponse.json({
        ...buildFallbackQuestions(String(prompt)),
        autoMemoryEntries: assistantUploadIntelligence.builderMemoryEntries,
        fileSummaries: assistantUploadIntelligence.fileSummaries,
        fileWarnings: assistantUploadIntelligence.warnings,
      });
    }
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        error: "Unable to prepare builder questions right now.",
        details,
      },
      { status: 500 }
    );
  }
}
