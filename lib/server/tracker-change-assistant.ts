import "server-only";

import { ollamaGenerateJson } from "@/lib/ollama";
import type {
  TrackerMemoryWrite,
  TrackerTimetableOutput,
  TrackerUnexpectedChangeInput,
} from "@/lib/runtime-types";
import {
  TRACKER_TIMETABLE_SCHEMA,
  buildTrackerMemoryContext,
  buildTrackerMemoryTimelineContext,
  formatTrackerUnexpectedChangeSummary,
} from "@/lib/tracker-workflow";
import { tryParseJson } from "@/lib/server/runtime-utils";

type TrackerMemoryEntry = {
  memoryKey: string;
  value: any;
  updatedAt?: string;
};

type TrackerMemoryEvent = {
  memoryKey: string;
  value: any;
  updatedAt?: string;
};

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function normalizePlan(rawPlan: any): TrackerTimetableOutput | null {
  if (!rawPlan || typeof rawPlan !== "object" || Array.isArray(rawPlan)) {
    return null;
  }

  return {
    scores:
      rawPlan.scores && typeof rawPlan.scores === "object" && !Array.isArray(rawPlan.scores)
        ? Object.fromEntries(
            Object.entries(rawPlan.scores).map(([key, value]) => [
              key,
              Number.isFinite(Number(value)) ? Number(value) : 0,
            ])
          )
        : {},
    suggestedAction: normalizeText(rawPlan.suggestedAction),
    reasoning: normalizeText(rawPlan.reasoning),
    insights: {
      progressBlocker: normalizeText(rawPlan.insights?.progressBlocker),
      stressHabits: normalizeText(rawPlan.insights?.stressHabits),
      timeLeaks: normalizeText(rawPlan.insights?.timeLeaks),
      automateDeferRemove: normalizeText(rawPlan.insights?.automateDeferRemove),
      unlockDecision: normalizeText(rawPlan.insights?.unlockDecision),
    },
    warnings: Array.isArray(rawPlan.warnings)
      ? rawPlan.warnings.map((item: unknown) => normalizeText(item)).filter(Boolean)
      : [],
    carryForward: Array.isArray(rawPlan.carryForward)
      ? rawPlan.carryForward.map((item: unknown) => normalizeText(item)).filter(Boolean)
      : [],
    todayPlan: Array.isArray(rawPlan.todayPlan)
      ? rawPlan.todayPlan
          .map((item: any) => ({
            start: normalizeText(item?.start),
            end: normalizeText(item?.end),
            title: normalizeText(item?.title),
            category: normalizeText(item?.category),
            reason: normalizeText(item?.reason),
          }))
          .filter((item: { title: string }) => item.title)
      : [],
  };
}

function buildFallbackMemoryUpdates({
  changeSummary,
  memoryEntries,
}: {
  changeSummary: string;
  memoryEntries: TrackerMemoryEntry[];
}) {
  const existingCommitments = normalizeText(
    memoryEntries.find((entry) => entry.memoryKey === "fixed_commitments")?.value
  );

  return [
    {
      memoryKey: "fixed_commitments",
      value: existingCommitments
        ? `${existingCommitments}\nUpdate: ${changeSummary}`
        : changeSummary,
    },
    {
      memoryKey: "day_summary",
      value: `Unexpected change handled: ${changeSummary}`,
    },
  ] satisfies TrackerMemoryWrite[];
}

export async function replanTrackerForUnexpectedChange({
  task,
  currentPlan,
  change,
  memoryEntries,
  memoryTimeline,
}: {
  task: string;
  currentPlan: TrackerTimetableOutput;
  change: TrackerUnexpectedChangeInput;
  memoryEntries: TrackerMemoryEntry[];
  memoryTimeline: TrackerMemoryEvent[];
}) {
  const changeSummary = formatTrackerUnexpectedChangeSummary(change);
  const prompt = `You are the unexpected-changes assistant for a personal tracker workflow.
Your job is to update the day plan after a real-world change without throwing away the useful structure that already exists.

Return only valid JSON in this exact shape:
{
  "assistantMessage": "",
  "changeSummary": "",
  "updatedPlan": ${TRACKER_TIMETABLE_SCHEMA},
  "memoryUpdates": [
    {
      "memoryKey": "",
      "value": ""
    }
  ]
}

Rules:
- Replan systematically. Preserve the best parts of the existing day unless the change makes them unrealistic.
- Update today's timetable, suggested action, warnings, and AI suggestions as one coherent replacement plan.
- Keep times realistic and ordered.
- Make sure the updated plan explicitly accounts for the unexpected change.
- memoryUpdates should contain concise reusable string values, mainly for changed commitments or summary notes.
- Return JSON only.

Current task:
${normalizeText(task) || "No task was provided."}

Unexpected change:
${JSON.stringify(change, null, 2)}

Human-readable change summary:
${changeSummary}

Current tracker plan:
${JSON.stringify(currentPlan, null, 2)}

Reusable tracker memory:
${buildTrackerMemoryContext(memoryEntries)}

Recent tracker memory timeline:
${buildTrackerMemoryTimelineContext(memoryTimeline)}`;

  const raw = await ollamaGenerateJson(prompt, "qwen3:14b-q4_K_M");
  const parsed = tryParseJson(raw || "");
  const updatedPlan = normalizePlan(
    parsed && typeof parsed === "object"
      ? (parsed as any).updatedPlan || (parsed as any).plan || parsed
      : null
  );

  if (!updatedPlan) {
    throw new Error("The change assistant could not return a valid updated tracker plan.");
  }

  const normalizedSummary =
    parsed && typeof parsed === "object"
      ? normalizeText((parsed as any).changeSummary) || changeSummary
      : changeSummary;
  const memoryUpdates =
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as any).memoryUpdates)
      ? (parsed as any).memoryUpdates
          .map((item: any) => ({
            memoryKey: normalizeText(item?.memoryKey),
            value: normalizeText(item?.value),
          }))
          .filter((item: TrackerMemoryWrite) => item.memoryKey && item.value)
      : buildFallbackMemoryUpdates({
          changeSummary: normalizedSummary,
          memoryEntries,
        });

  return {
    assistantMessage:
      parsed && typeof parsed === "object"
        ? normalizeText((parsed as any).assistantMessage) ||
          "I updated the timetable and suggestions around the new change."
        : "I updated the timetable and suggestions around the new change.",
    changeSummary: normalizedSummary,
    updatedPlan,
    memoryUpdates:
      memoryUpdates.length > 0
        ? memoryUpdates
        : buildFallbackMemoryUpdates({
            changeSummary: normalizedSummary,
            memoryEntries,
          }),
  };
}
