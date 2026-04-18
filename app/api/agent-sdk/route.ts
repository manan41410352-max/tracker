import { NextRequest, NextResponse } from "next/server";
import { fetchMutation, fetchQuery } from "convex/nextjs";

import { api } from "@/convex/_generated/api";
import { LOCAL_USER_EMAIL, LOCAL_USER_NAME } from "@/lib/local-user";
import { normalizeAgentToolConfig } from "@/lib/agent-runtime-config";
import { applyWorkflowEvolutionToAgent } from "@/lib/server/workflow-evolution";
import { runWorkflowConversation } from "@/lib/server/workflow-executor";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const {
      agentId,
      userInput,
      conversationId,
      resumeAction,
      prefilledQuestionAnswers,
      runSetupAnswers,
      reusableMemoryBootstrap,
    } =
      await req.json();

    const agentDetail = await fetchQuery(api.agent.GetAgentById, {
      agentId,
    });

    if (!agentDetail) {
      return NextResponse.json({ error: "Agent not found." }, { status: 404 });
    }

    const config = normalizeAgentToolConfig(agentDetail.agentToolConfig);
    const user = await fetchMutation(api.user.CreateNewUser, {
      name: LOCAL_USER_NAME,
      email: LOCAL_USER_EMAIL,
    });
    const persistedRun = conversationId
      ? await fetchQuery(api.workflow.GetWorkflowRunByConversation, {
          conversationId,
        })
      : null;
    const memoryRecords = await fetchQuery(api.workflow.GetAgentMemory, {
      agentId: agentDetail._id,
      userId: user!._id,
    });
    const memoryTimeline = await fetchQuery(
      api.workflow.GetAgentMemoryTimelineByAgent,
      {
        agentId: agentDetail._id,
        limit: 40,
      }
    );

    const result = await runWorkflowConversation({
      agentName: agentDetail.name,
      agentConfig: agentDetail.agentToolConfig,
      input: userInput,
      conversationId,
      persistedRun,
      memoryRecords: memoryRecords ?? [],
      memoryTimeline: memoryTimeline ?? [],
      resumeAction,
      prefilledQuestionAnswers,
      runSetupAnswers,
      reusableMemoryBootstrap,
    });

    await fetchMutation(api.workflow.EnsureConversation, {
      conversationId: result.envelope.conversationId,
      agentId: agentDetail._id,
      userId: user!._id,
    });

    await fetchMutation(api.workflow.UpsertWorkflowRun, {
      conversationId: result.envelope.conversationId,
      agentId: agentDetail._id,
      userId: user!._id,
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
        userId: user!._id,
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

    return NextResponse.json(result.envelope);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The local model runtime is unavailable.";

    return NextResponse.json({ error: message }, { status: 503 });
  }
}
