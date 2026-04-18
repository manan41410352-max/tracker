import { randomUUID } from "crypto";

import { NextRequest, NextResponse } from "next/server";
import { fetchMutation, fetchQuery } from "convex/nextjs";

import { api } from "@/convex/_generated/api";
import { normalizeAgentToolConfig } from "@/lib/agent-runtime-config";
import { LOCAL_USER_EMAIL, LOCAL_USER_NAME } from "@/lib/local-user";
import { applyWorkflowEvolutionToAgent } from "@/lib/server/workflow-evolution";
import { runWorkflowConversation } from "@/lib/server/workflow-executor";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const {
      input,
      tools,
      agents,
      agentConfig,
      conversationId,
      agentName,
      agentId,
      resumeAction,
      prefilledQuestionAnswers,
      runSetupAnswers,
      reusableMemoryBootstrap,
    } =
      await req.json();

    const user = await fetchMutation(api.user.CreateNewUser, {
      name: LOCAL_USER_NAME,
      email: LOCAL_USER_EMAIL,
    });

    const agentDetail = agentId
      ? await fetchQuery(api.agent.GetAgentById, {
          agentId: String(agentId),
        })
      : null;

    const config = normalizeAgentToolConfig(
      agentDetail?.agentToolConfig ??
        agentConfig ?? {
          primaryAgentName: agentName,
          agents,
          tools,
        }
    );

    const persistedRun =
      conversationId && agentDetail?._id
        ? await fetchQuery(api.workflow.GetWorkflowRunByConversation, {
            conversationId: String(conversationId),
          })
        : null;
    const memoryRecords = agentDetail?._id
      ? await fetchQuery(api.workflow.GetAgentMemory, {
          agentId: agentDetail._id,
          userId: user!._id,
        })
      : [];
    const memoryTimeline = agentDetail?._id
      ? await fetchQuery(api.workflow.GetAgentMemoryTimelineByAgent, {
          agentId: agentDetail._id,
          limit: 40,
        })
      : [];

    const result = await runWorkflowConversation({
      agentName:
        agentDetail?.name ||
        agentName ||
        config.primaryAgentName ||
        "Systematic Tracker",
      agentConfig: config,
      input,
      conversationId,
      persistedRun,
      memoryRecords: memoryRecords ?? [],
      memoryTimeline: memoryTimeline ?? [],
      resumeAction,
      prefilledQuestionAnswers,
      runSetupAnswers,
      reusableMemoryBootstrap,
    });

    if (agentDetail?._id && user?._id) {
      await fetchMutation(api.workflow.EnsureConversation, {
        conversationId: result.envelope.conversationId,
        agentId: agentDetail._id,
        userId: user._id,
      });

      await fetchMutation(api.workflow.UpsertWorkflowRun, {
        conversationId: result.envelope.conversationId,
        agentId: agentDetail._id,
        userId: user._id,
        status: result.persistedRun.status || result.envelope.status,
        currentNodeId: result.persistedRun.currentNodeId || undefined,
        pendingAction: result.persistedRun.pendingAction,
        state: result.persistedRun.state,
        nodeHistory: result.persistedRun.nodeHistory,
        messages: result.persistedRun.messages,
        browserSession: result.persistedRun.browserSession,
        updatedAt: new Date().toISOString(),
      });

      for (const memoryUpdate of result.memoryUpdates) {
        await fetchMutation(api.workflow.UpsertAgentMemory, {
          agentId: agentDetail._id,
          userId: user._id,
          memoryKey: memoryUpdate.memoryKey,
          value: memoryUpdate.value,
          source: memoryUpdate.source,
          updatedAt: new Date().toISOString(),
        });
      }

      if (result.workflowRewrite?.nodeId) {
        const evolution = await applyWorkflowEvolutionToAgent({
          agentDetail,
          config,
          runState: result.persistedRun,
          rewrite: result.workflowRewrite,
        });

        if (evolution.applied && evolution.patchedConfig) {
          await fetchMutation(api.agent.UpdateAgentDetail, {
            agentId: agentDetail.agentId,
            ...(evolution.patchedNodes ? { nodes: evolution.patchedNodes } : {}),
            ...(evolution.patchedEdges ? { edges: evolution.patchedEdges } : {}),
          });

          await fetchMutation(api.agent.UpdateAgentToolConfig, {
            id: agentDetail._id,
            agentToolConfig: evolution.patchedConfig,
          });
        }
      }
    }

    return NextResponse.json(result.envelope);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The local agent runtime is unavailable.";

    return NextResponse.json({ error: message }, { status: 503 });
  }
}

export async function GET() {
  return NextResponse.json({
    conversationId: randomUUID(),
  });
}
