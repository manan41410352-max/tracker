import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  buildTrackerMemoryContext,
  buildTrackerMemoryTimelineContext,
} from "@/lib/tracker-workflow";
import {
  buildTrackerTopicFallbackPack,
  isTrackerTopicDomainId,
} from "@/lib/tracker-topic-intake";
import { requestChatGptBuilderJson } from "@/lib/server/chatgpt-builder";

export const runtime = "nodejs";

const TopicQuestionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  question: z.string().min(1),
  responseType: z.enum(["short-answer", "mcq"]),
  options: z.array(z.string().min(1)).max(6).optional(),
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
  memoryKey: z.string().min(1).optional(),
});

const TopicPackSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  questions: z.array(TopicQuestionSchema).min(2).max(5),
});

const RequestSchema = z.object({
  domainId: z.string().min(1),
  domainName: z.string().min(1),
  builderPrompt: z.string().optional(),
  builderMemory: z.array(z.object({
    key: z.string(),
    label: z.string().optional(),
    value: z.string().optional(),
    updatedAt: z.string().optional(),
  })).optional(),
  agentMemory: z.array(z.object({
    memoryKey: z.string(),
    value: z.any(),
    updatedAt: z.string().optional(),
  })).optional(),
  agentMemoryTimeline: z.array(z.object({
    memoryKey: z.string(),
    value: z.any(),
    updatedAt: z.string().optional(),
  })).optional(),
});

function normalizeDomainLabel(domainName: string) {
  return domainName.trim() || "Tracker topic";
}

export async function POST(req: NextRequest) {
  try {
    const payload = RequestSchema.parse(await req.json());
    const fallback = buildTrackerTopicFallbackPack(payload.domainId, payload.domainName);

    if (!isTrackerTopicDomainId(payload.domainId)) {
      return NextResponse.json(fallback);
    }

    const memoryContext = buildTrackerMemoryContext((payload.agentMemory || []) as any[]);
    const builderMemoryContext = (payload.builderMemory || [])
      .map(
        (entry) =>
          `${String(entry.label || entry.key)}: ${String(entry.value || "").trim()}`
      )
      .filter(Boolean)
      .join("\n");
    const timelineContext = buildTrackerMemoryTimelineContext(
      (payload.agentMemoryTimeline || []) as any[]
    );

    const prompt = `You are generating a popup intake for a tracker workflow builder.
Return only valid JSON in this exact shape:
{
  "title": "",
  "description": "",
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

Topic:
- domainId: ${payload.domainId}
- domainName: ${normalizeDomainLabel(payload.domainName)}

Workflow builder prompt:
${payload.builderPrompt?.trim() || "No builder prompt provided yet."}

Saved reusable memory:
${memoryContext}

Saved builder memory:
${builderMemoryContext || "No saved builder memory yet."}

Recent memory timeline:
${timelineContext}

Rules:
- Create a large popup intake that will appear before adding the ${normalizeDomainLabel(payload.domainName)} block.
- Ask 2 to 5 concise questions that make the ${normalizeDomainLabel(payload.domainName)} block genuinely more useful for daily planning.
- Favor questions that shape today's timetable, constraints, and personalized planning.
- Use "mcq" only when there are clear bounded choices.
- Make the title and description feel specific to ${normalizeDomainLabel(payload.domainName)}.
- Every memoryKey must be stable and topic-specific.
- Avoid duplicates, generic onboarding, or implementation details.
- Return JSON only.`;

    try {
      const generated = await requestChatGptBuilderJson<unknown>({
        prompt,
        action: `generate ${payload.domainName} popup questions`,
      });
      const parsed = TopicPackSchema.parse(generated);

      return NextResponse.json({
        title: parsed.title,
        description: parsed.description,
        questions: parsed.questions.map((question) => ({
          ...question,
          options: question.options || [],
          required: question.required ?? true,
        })),
      });
    } catch (error) {
      console.warn(
        "Tracker topic question generation failed, using local fallback.",
        error
      );

      return NextResponse.json(fallback);
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to build topic questions.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
