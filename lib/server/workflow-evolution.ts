import "server-only";

import { randomUUID } from "crypto";

import { NODE_STYLE_MAP } from "@/lib/agent-builder";
import type {
  AgentRuntimeConfig,
  RuntimeFlowNode,
} from "@/lib/runtime-types";
import { requestChatGptBuilderJson } from "@/lib/server/chatgpt-builder";
import { deepClone, ensureObject, slugify } from "@/lib/server/runtime-utils";

export type WorkflowRewriteRequest = {
  nodeId: string;
  nodeType: string;
  failureReason: string;
  avoidanceRule: string;
  failurePattern?: string;
  fallbackMessage: string;
  currentInstruction?: string;
};

type WorkflowEvolutionPlan = {
  strategy?: "instruction_only" | "insert_recovery_node" | "none";
  reason?: string;
  updatedInstruction?: string;
  shouldInsertRecoveryNode?: boolean;
  recoveryNode?: {
    label?: string;
    instruction?: string;
    output?: "text" | "json";
    schema?: string;
    includeHistory?: boolean;
    allowedTools?: string[];
  };
};

type WorkflowEvolutionResult = {
  applied: boolean;
  summary: string;
  patchedConfig?: AgentRuntimeConfig;
  patchedNodes?: any[];
  patchedEdges?: any[];
};

function buildFlowSnapshot(flow: RuntimeFlowNode[], nodeId: string) {
  const targetIndex = flow.findIndex((node) => node.id === nodeId);
  if (targetIndex === -1) {
    return {
      target: null,
      previous: [],
      next: [],
    };
  }

  return {
    target: flow[targetIndex],
    previous: flow.slice(Math.max(0, targetIndex - 2), targetIndex),
    next: flow.slice(targetIndex + 1, Math.min(flow.length, targetIndex + 3)),
  };
}

function appendAvoidanceRule(instruction: string, avoidanceRule: string) {
  const trimmedInstruction = String(instruction || "").trim();
  const trimmedRule = String(avoidanceRule || "").trim();

  if (!trimmedRule) {
    return trimmedInstruction;
  }

  if (!trimmedInstruction) {
    return `Avoid this failure mode: ${trimmedRule}`;
  }

  if (trimmedInstruction.includes(trimmedRule)) {
    return trimmedInstruction;
  }

  return `${trimmedInstruction}\n\nRecovery rule: ${trimmedRule}`;
}

function buildEvolutionPrompt({
  config,
  rewrite,
  runState,
}: {
  config: AgentRuntimeConfig;
  rewrite: WorkflowRewriteRequest;
  runState: any;
}) {
  const flow = Array.isArray(config.flow?.flow) ? config.flow.flow : [];
  const snapshot = buildFlowSnapshot(flow, rewrite.nodeId);

  return `You are Hive Queen, the workflow evolution harness for a local agent builder.
Return only valid JSON in this exact shape:
{
  "strategy": "instruction_only",
  "reason": "",
  "updatedInstruction": "",
  "shouldInsertRecoveryNode": false,
  "recoveryNode": {
    "label": "",
    "instruction": "",
    "output": "text",
    "schema": "",
    "includeHistory": true,
    "allowedTools": ["browser_visit", "browser_task"]
  }
}

Goal:
- Permanently improve the workflow after a recovered failure.
- Prefer rewriting the current node instruction.
- Insert one recovery guard node only when the workflow clearly needs an additional durable step after this node.
- If you insert a node, it must be an AgentNode-compatible helper step.

Rules:
- Keep the original workflow intent.
- Do not invent secrets, credentials, or unsafe behavior.
- The updatedInstruction should replace the current instruction cleanly, not add commentary about being an AI.
- Use shouldInsertRecoveryNode only for durable verification, cleanup, or guardrail work that should happen after the repaired node.
- Keep labels short and operator-friendly.

Failure context:
${JSON.stringify(rewrite, null, 2)}

Current node neighborhood:
${JSON.stringify(snapshot, null, 2)}

Shared workflow memory:
${JSON.stringify(ensureObject(runState?.state?.reusableMemory), null, 2)}

Recent fallback history:
${JSON.stringify(
    Array.isArray(runState?.state?.fallbackHistory)
      ? runState.state.fallbackHistory.slice(-4)
      : [],
    null,
    2
  )}

Current browser state:
${JSON.stringify(runState?.browserSession || {}, null, 2)}`;
}

async function requestWorkflowEvolutionPlan({
  config,
  rewrite,
  runState,
}: {
  config: AgentRuntimeConfig;
  rewrite: WorkflowRewriteRequest;
  runState: any;
}) {
  try {
    const parsed = await requestChatGptBuilderJson<WorkflowEvolutionPlan>({
      action: "evolve the workflow after a recovered node failure",
      prompt: buildEvolutionPrompt({
        config,
        rewrite,
        runState,
      }),
    });

    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function createRecoveryNodeId(existingIds: Set<string>, label: string) {
  const base = slugify(label || "recovery_guard") || "recovery_guard";
  let nextId = `${base}_${randomUUID().slice(0, 6)}`;

  while (existingIds.has(nextId)) {
    nextId = `${base}_${randomUUID().slice(0, 6)}`;
  }

  return nextId;
}

function createEdgeId(source: string, target: string, sourceHandle?: string) {
  return `edge-${source}-${sourceHandle || "default"}-${target}`;
}

function buildRecoveryNodeSettings(plan: WorkflowEvolutionPlan, rewrite: WorkflowRewriteRequest) {
  const recoveryNode = ensureObject(plan.recoveryNode);
  const label = String(recoveryNode.label || "Recovery Guard").trim() || "Recovery Guard";
  const instruction =
    String(recoveryNode.instruction || "").trim() ||
    `Verify this step is safe to continue. Prevent this failure mode next time: ${rewrite.avoidanceRule}`;
  const output = recoveryNode.output === "json" ? "json" : "text";
  const allowedTools = Array.isArray(recoveryNode.allowedTools)
    ? recoveryNode.allowedTools.map((tool) => String(tool || "").trim()).filter(Boolean)
    : ["browser_visit", "browser_task"];

  return {
    label,
    settings: {
      name: label,
      instruction,
      output,
      ...(output === "json" && recoveryNode.schema
        ? { schema: String(recoveryNode.schema) }
        : {}),
      includeHistory:
        typeof recoveryNode.includeHistory === "boolean"
          ? recoveryNode.includeHistory
          : true,
      allowedTools,
    },
  };
}

export async function applyWorkflowEvolutionToAgent({
  agentDetail,
  config,
  runState,
  rewrite,
}: {
  agentDetail: any;
  config: AgentRuntimeConfig;
  runState: any;
  rewrite?: WorkflowRewriteRequest;
}): Promise<WorkflowEvolutionResult> {
  if (!rewrite?.nodeId) {
    return {
      applied: false,
      summary: "No workflow evolution request was generated.",
    };
  }

  const patchedConfig = deepClone(config);
  const flow = Array.isArray(patchedConfig.flow?.flow) ? patchedConfig.flow.flow : [];
  const targetNode = flow.find((node) => node.id === rewrite.nodeId);

  if (!targetNode) {
    return {
      applied: false,
      summary: `The recovered node ${rewrite.nodeId} was not found in the runtime flow.`,
    };
  }

  const plan =
    (await requestWorkflowEvolutionPlan({
      config,
      rewrite,
      runState,
    })) || null;

  const targetSettings = ensureObject(targetNode.settings);
  const currentInstruction = String(
    plan?.updatedInstruction ||
      rewrite.currentInstruction ||
      targetSettings.instruction ||
      ""
  ).trim();

  targetNode.settings = {
    ...targetSettings,
    instruction: appendAvoidanceRule(currentInstruction, rewrite.avoidanceRule),
  };

  const existingIds = new Set(flow.map((node) => node.id));
  const insertedNodeAllowed =
    Boolean(plan?.shouldInsertRecoveryNode) &&
    (typeof targetNode.next === "string" || targetNode.next === null || targetNode.next === undefined);

  let insertedNodeId: string | undefined;

  if (insertedNodeAllowed) {
    const recoveryNode = buildRecoveryNodeSettings(plan as WorkflowEvolutionPlan, rewrite);
    insertedNodeId = createRecoveryNodeId(existingIds, recoveryNode.label);
    const previousNext =
      typeof targetNode.next === "string" && targetNode.next.trim()
        ? targetNode.next
        : null;

    flow.push({
      id: insertedNodeId,
      type: "AgentNode",
      label: recoveryNode.label,
      settings: recoveryNode.settings,
      next: previousNext,
    });
    targetNode.next = insertedNodeId;
  }

  let patchedNodes = Array.isArray(agentDetail?.nodes)
    ? deepClone(agentDetail.nodes)
    : undefined;
  let patchedEdges = Array.isArray(agentDetail?.edges)
    ? deepClone(agentDetail.edges)
    : undefined;

  if (patchedNodes) {
    const builderNode = patchedNodes.find((node: any) => String(node.id) === rewrite.nodeId);
    if (builderNode?.data) {
      builderNode.data = {
        ...builderNode.data,
        settings: {
          ...ensureObject(builderNode.data.settings),
          instruction: targetNode.settings?.instruction,
        },
      };
    }

    if (insertedNodeId) {
      const recoveryNode = buildRecoveryNodeSettings(plan as WorkflowEvolutionPlan, rewrite);
      const sourceNode = patchedNodes.find((node: any) => String(node.id) === rewrite.nodeId);
      const oldNext =
        typeof flow.find((node) => node.id === insertedNodeId)?.next === "string"
          ? flow.find((node) => node.id === insertedNodeId)?.next
          : null;
      const nextNode = patchedNodes.find((node: any) => String(node.id) === String(oldNext || ""));
      const style = NODE_STYLE_MAP.AgentNode;
      const sourcePosition = sourceNode?.position || { x: 120, y: 120 };
      const nextPosition = nextNode?.position;

      patchedNodes.push({
        id: insertedNodeId,
        type: "AgentNode",
        position: {
          x:
            nextPosition && typeof nextPosition.x === "number"
              ? Math.round((sourcePosition.x + nextPosition.x) / 2)
              : sourcePosition.x + 280,
          y:
            nextPosition && typeof nextPosition.y === "number"
              ? Math.round((sourcePosition.y + nextPosition.y) / 2)
              : sourcePosition.y + 140,
        },
        data: {
          label: recoveryNode.label,
          bgColor: style.bgColor,
          id: style.paletteId,
          type: "AgentNode",
          settings: recoveryNode.settings,
        },
      });
    }
  }

  if (patchedEdges && insertedNodeId) {
    const insertedNode = flow.find((node) => node.id === insertedNodeId);
    const previousNext =
      typeof insertedNode?.next === "string" && insertedNode.next.trim()
        ? insertedNode.next
        : null;

    patchedEdges = patchedEdges.filter(
      (edge: any) =>
        !(
          String(edge.source) === rewrite.nodeId &&
          previousNext &&
          String(edge.target) === previousNext &&
          !edge.sourceHandle
        )
    );

    patchedEdges.push({
      id: createEdgeId(rewrite.nodeId, insertedNodeId),
      source: rewrite.nodeId,
      target: insertedNodeId,
      sourceHandle: undefined,
    });

    if (previousNext) {
      patchedEdges.push({
        id: createEdgeId(insertedNodeId, previousNext),
        source: insertedNodeId,
        target: previousNext,
        sourceHandle: undefined,
      });
    }
  }

  return {
    applied: true,
    summary:
      String(plan?.reason || "").trim() ||
      (insertedNodeId
        ? `Updated ${rewrite.nodeId} and inserted a recovery guard node.`
        : `Updated ${rewrite.nodeId} with a durable recovery rule.`),
    patchedConfig,
    patchedNodes,
    patchedEdges,
  };
}
