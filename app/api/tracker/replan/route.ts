import { NextRequest, NextResponse } from "next/server";
import { fetchMutation, fetchQuery } from "convex/nextjs";

import { api } from "@/convex/_generated/api";
import { replanTrackerForUnexpectedChange } from "@/lib/server/tracker-change-assistant";
import type {
  TrackerChangeAssistantRecord,
  TrackerUnexpectedChangeInput,
  TrackerUnexpectedChangeResponse,
} from "@/lib/runtime-types";
import {
  findTimetableOutputCandidate,
  isTrackerAgentDefinition,
} from "@/lib/tracker-workflow";

export const runtime = "nodejs";

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function isValidChangePayload(value: unknown): value is TrackerUnexpectedChangeInput {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      normalizeText((value as TrackerUnexpectedChangeInput).itemTitle) &&
      normalizeText((value as TrackerUnexpectedChangeInput).changeType)
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const agentId = normalizeText(body?.agentId);
    const conversationId = normalizeText(body?.conversationId);
    const change = body?.change;

    if (!agentId || !conversationId || !isValidChangePayload(change)) {
      return NextResponse.json(
        {
          error:
            "Add the agent id, conversation id, and a valid unexpected change before replanning.",
        },
        { status: 400 }
      );
    }

    const agentDetail = await fetchQuery(api.agent.GetAgentById, { agentId });
    if (!agentDetail) {
      return NextResponse.json({ error: "Agent not found." }, { status: 404 });
    }

    if (
      !isTrackerAgentDefinition({
        nodes: Array.isArray(agentDetail.nodes) ? agentDetail.nodes : [],
        runtimeConfig: agentDetail.agentToolConfig,
      })
    ) {
      return NextResponse.json(
        { error: "The unexpected-changes assistant is only available for tracker workflows." },
        { status: 400 }
      );
    }

    const workflowRun = await fetchQuery(api.workflow.GetWorkflowRunByConversation, {
      conversationId,
    });

    if (!workflowRun) {
      return NextResponse.json(
        { error: "Run the tracker workflow once before using the unexpected-changes assistant." },
        { status: 404 }
      );
    }

    if (String(workflowRun.agentId) !== String(agentDetail._id)) {
      return NextResponse.json(
        { error: "This conversation does not belong to the requested agent." },
        { status: 400 }
      );
    }

    const currentState =
      workflowRun.state && typeof workflowRun.state === "object" ? workflowRun.state : {};
    const currentPlan = findTimetableOutputCandidate(currentState);

    if (!currentPlan) {
      return NextResponse.json(
        {
          error:
            "Run the timetable planner first so the change assistant has a plan to update.",
        },
        { status: 409 }
      );
    }

    const [memoryEntries, memoryTimeline] = await Promise.all([
      fetchQuery(api.workflow.GetAgentMemory, {
        agentId: workflowRun.agentId,
        userId: workflowRun.userId,
      }),
      fetchQuery(api.workflow.GetAgentMemoryTimelineByAgent, {
        agentId: workflowRun.agentId,
        limit: 120,
      }),
    ]);

    const result = await replanTrackerForUnexpectedChange({
      task:
        normalizeText(currentState.task) ||
        normalizeText(currentState.runSetupTask) ||
        normalizeText(agentDetail.config?.builderPrompt),
      currentPlan: currentPlan as any,
      change,
      memoryEntries: Array.isArray(memoryEntries) ? memoryEntries : [],
      memoryTimeline: Array.isArray(memoryTimeline) ? memoryTimeline : [],
    });

    const updatedAt = new Date().toISOString();
    const previousAssistantState =
      currentState.trackerChangeAssistant &&
      typeof currentState.trackerChangeAssistant === "object" &&
      !Array.isArray(currentState.trackerChangeAssistant)
        ? (currentState.trackerChangeAssistant as TrackerChangeAssistantRecord)
        : null;
    const nextAssistantState: TrackerChangeAssistantRecord = {
      updatedAt,
      assistantMessage: result.assistantMessage,
      changeSummary: result.changeSummary,
      latestPlan: result.updatedPlan,
      lastChange: change,
      memoryUpdates: result.memoryUpdates,
      history: [
        {
          updatedAt,
          assistantMessage: result.assistantMessage,
          changeSummary: result.changeSummary,
          lastChange: change,
        },
        ...(Array.isArray(previousAssistantState?.history)
          ? previousAssistantState.history
          : []),
      ].slice(0, 12),
    };
    const nextReusableMemory = {
      ...(currentState.reusableMemory && typeof currentState.reusableMemory === "object"
        ? currentState.reusableMemory
        : {}),
      ...Object.fromEntries(
        result.memoryUpdates.map((update: { memoryKey: string; value: string }) => [
          update.memoryKey,
          update.value,
        ])
      ),
    };
    const nextState = {
      ...currentState,
      trackerChangeAssistant: nextAssistantState,
      replannedTrackerOutput: result.updatedPlan,
      latestOutput: result.updatedPlan,
      finalOutput: result.updatedPlan,
      reusableMemory: nextReusableMemory,
      lastTrackerPlanUpdatedAt: updatedAt,
    };

    await fetchMutation(api.workflow.UpsertWorkflowRun, {
      conversationId: workflowRun.conversationId,
      agentId: workflowRun.agentId,
      userId: workflowRun.userId,
      status: workflowRun.status || "completed",
      ...(workflowRun.currentNodeId ? { currentNodeId: workflowRun.currentNodeId } : {}),
      ...(workflowRun.pendingAction ? { pendingAction: workflowRun.pendingAction } : {}),
      state: nextState,
      ...(workflowRun.nodeHistory ? { nodeHistory: workflowRun.nodeHistory } : {}),
      ...(workflowRun.messages ? { messages: workflowRun.messages } : {}),
      ...(workflowRun.browserSession ? { browserSession: workflowRun.browserSession } : {}),
      updatedAt,
    });

    for (const memoryUpdate of result.memoryUpdates) {
      await fetchMutation(api.workflow.UpsertAgentMemory, {
        agentId: workflowRun.agentId,
        userId: workflowRun.userId,
        memoryKey: memoryUpdate.memoryKey,
        value: memoryUpdate.value,
        source: "tracker_change_assistant",
        updatedAt,
      });
    }

    const response: TrackerUnexpectedChangeResponse = {
      ok: true,
      assistantMessage: result.assistantMessage,
      changeSummary: result.changeSummary,
      updatedAt,
      updatedPlan: result.updatedPlan,
      memoryUpdates: result.memoryUpdates,
      planSource: "change_assistant",
    };

    return NextResponse.json(response);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to update the tracker plan for this change.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
