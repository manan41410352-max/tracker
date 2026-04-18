import "server-only";

import { randomUUID } from "crypto";

import {
  initializeConversation,
  runAgentConversation as runLegacyAgentConversation,
} from "@/lib/agent-runtime";
import { normalizeAgentToolConfig } from "@/lib/agent-runtime-config";
import { getBrowserWorkspaceSnapshot } from "@/lib/browser-runtime";
import { sendPromptViaChatGptBrowser } from "@/lib/chatgpt-browser-fallback";
import { ollamaGenerateJson } from "@/lib/ollama";
import type {
  AgentChatEnvelope,
  AgentRuntimeConfig,
  BrowserWorkspaceState,
  FormField,
  PendingApprovalPayload,
  PendingBrowserPayload,
  PendingFormPayload,
  PrefilledQuestionAnswer,
  RunSetupAnswer,
  ResumeAction,
  RuntimeFlowNode,
  WorkflowTraceItem,
} from "@/lib/runtime-types";
import {
  deepClone,
  ensureObject,
  nowIso,
  slugify,
  tryParseJson,
} from "@/lib/server/runtime-utils";
import {
  evaluateCondition,
  type PersistedRun,
  runAgentNode,
  runApiNode,
  runSpecializedAgentNode,
} from "@/lib/server/workflow-tools";

type MemoryRecord = {
  memoryKey: string;
  value: any;
  source?: string;
};

type MemoryUpdate = {
  memoryKey: string;
  value: any;
  source?: string;
};

type WorkflowExecutionResult = {
  envelope: AgentChatEnvelope;
  persistedRun: PersistedRun;
  memoryUpdates: MemoryUpdate[];
  workflowRewrite?: {
    nodeId: string;
    nodeType: string;
    failureReason: string;
    avoidanceRule: string;
    failurePattern?: string;
    fallbackMessage: string;
    currentInstruction?: string;
  };
};

const CAPTCHA_CHALLENGE_PATTERNS = [
  /captcha/i,
  /recaptcha/i,
  /hcaptcha/i,
  /turnstile/i,
  /cloudflare/i,
  /verify you are human/i,
  /human verification/i,
  /attention required/i,
  /checking your browser/i,
  /security check/i,
  /arkose/i,
  /arkoselabs/i,
  /data ?dome/i,
  /perimeterx/i,
] as const;

function getNodeName(node: RuntimeFlowNode) {
  return String(node.settings?.name || node.label || node.type);
}

function updateBrowserSessionFromSnapshot(runState: PersistedRun, snapshot: any) {
  if (!snapshot) {
    return;
  }

  runState.browserSession = {
    ...(runState.browserSession || {}),
    provider: snapshot.provider || runState.browserSession?.provider,
    profile: snapshot.profile || runState.browserSession?.profile,
    targetId: snapshot.targetId || runState.browserSession?.targetId,
    tabId: snapshot.tabId || runState.browserSession?.tabId,
    lastUrl: snapshot.currentUrl || runState.browserSession?.lastUrl,
    lastTitle: snapshot.title || runState.browserSession?.lastTitle,
    serviceStatus: "ready",
    availableRefs: Array.isArray(snapshot.refs)
      ? snapshot.refs
      : runState.browserSession?.availableRefs,
    lastError: snapshot.manualInterventionReason || "",
  };
}

function isCaptchaOrVerificationChallenge(
  snapshot: any,
  pauseOnAnyVerification: boolean
) {
  const haystack = [
    snapshot?.title || "",
    snapshot?.currentUrl || "",
    snapshot?.snapshotText || "",
    snapshot?.manualInterventionReason || "",
  ].join("\n");

  if (CAPTCHA_CHALLENGE_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return true;
  }

  return Boolean(pauseOnAnyVerification && snapshot?.requiresManualIntervention);
}

function buildCaptchaPauseReason(node: RuntimeFlowNode, snapshot: any) {
  const configuredMessage = String(node.settings?.message || "").trim();
  if (configuredMessage) {
    return configuredMessage;
  }

  if (snapshot?.manualInterventionReason) {
    return String(snapshot.manualInterventionReason);
  }

  return "A CAPTCHA or human verification page is open. Complete it manually in the browser workspace, then resume the workflow.";
}

function trackTrace(
  trace: WorkflowTraceItem[],
  node: RuntimeFlowNode,
  status: WorkflowTraceItem["status"],
  summary?: string
) {
  return [
    ...trace,
    {
      nodeId: node.id,
      nodeName: getNodeName(node),
      nodeType: node.type,
      status,
      summary,
      updatedAt: nowIso(),
    },
  ];
}

function getNodeMap(flow: RuntimeFlowNode[] = []) {
  return new Map(flow.map((node) => [node.id, node]));
}

function getNextNodeId(
  node: RuntimeFlowNode,
  branch?: "if" | "else" | "approve" | "reject" | "loop" | "done"
) {
  if (typeof node.next === "string") {
    return node.next;
  }

  if (Array.isArray(node.next)) {
    if (branch === "done") {
      return node.next[1] || null;
    }

    return node.next[0] || null;
  }

  if (node.next && typeof node.next === "object") {
    if (!branch) {
      return Object.values(node.next)[0] || null;
    }

    return node.next[branch] || null;
  }

  return null;
}

function buildReusableMemoryMap(memoryRecords: MemoryRecord[]) {
  return Object.fromEntries(
    memoryRecords.map((record) => [record.memoryKey, record.value])
  );
}

function isFilledValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return String(value ?? "").trim().length > 0;
}

function buildBootstrapPayload({
  config,
  prefilledQuestionAnswers = [],
  runSetupAnswers = [],
  reusableMemoryBootstrap = {},
}: {
  config: AgentRuntimeConfig;
  prefilledQuestionAnswers?: PrefilledQuestionAnswer[];
  runSetupAnswers?: RunSetupAnswer[];
  reusableMemoryBootstrap?: Record<string, any>;
}) {
  const questionBlocks = Array.isArray(config.questionBlocks)
    ? config.questionBlocks
    : [];
  const runSetupFields = Array.isArray(config.runSetup?.fields)
    ? config.runSetup.fields
    : [];
  const answerMap: Record<string, string | string[]> = {};
  const memoryMap = {
    ...ensureObject(reusableMemoryBootstrap),
  } as Record<string, any>;

  for (const answer of runSetupAnswers) {
    if (!answer?.id) {
      continue;
    }

    answerMap[String(answer.id)] = answer.value;

    const matchingField = runSetupFields.find((field) => field.id === answer.id);
    const memoryKey =
      answer.memoryKey ||
      matchingField?.memoryKey;

    if (memoryKey && isFilledValue(answer.value)) {
      memoryMap[memoryKey] = answer.value;
    }
  }

  prefilledQuestionAnswers.forEach((answer, index) => {
    const questionBlock =
      questionBlocks.find((question) => question.id === answer.id) ||
      questionBlocks[index];
    if (!questionBlock?.id) {
      return;
    }

    answerMap[questionBlock.id] = answer.answer;
    if (questionBlock.memoryKey && isFilledValue(answer.answer)) {
      memoryMap[questionBlock.memoryKey] = answer.answer;
    }
  });

  return {
    answerMap,
    memoryMap,
  };
}

function hydrateRunSetupState(
  state: Record<string, any>,
  config: AgentRuntimeConfig,
  input: string,
  bootstrap: {
    answerMap: Record<string, string | string[]>;
    memoryMap: Record<string, any>;
  }
) {
  const nextState = deepClone(state);
  const existingRunSetupAnswers = ensureObject(nextState.runSetupAnswers);

  nextState.runSetupAnswers = {
    ...existingRunSetupAnswers,
    ...bootstrap.answerMap,
  };
  nextState.reusableMemory = {
    ...ensureObject(nextState.reusableMemory),
    ...bootstrap.memoryMap,
  };
  nextState.setupMemory = {
    ...ensureObject(nextState.setupMemory),
    ...bootstrap.memoryMap,
  };

  if (input.trim()) {
    nextState.task = input.trim();
    nextState.runSetupTask = input.trim();
  } else if (!nextState.task && typeof nextState.runSetupTask === "string") {
    nextState.task = nextState.runSetupTask;
  }

  for (const field of config.runSetup?.fields ?? []) {
    const seededValue =
      bootstrap.answerMap[field.id] ??
      (field.memoryKey ? nextState.reusableMemory?.[field.memoryKey] : undefined);

    if (seededValue === undefined || !field.sourceNodeId) {
      continue;
    }

    if (field.sourceNodeType === "QuestionNode") {
      const questionResponses = ensureObject(nextState.formResponses?.[field.sourceNodeId]);
      nextState.formResponses = {
        ...(nextState.formResponses || {}),
        [field.sourceNodeId]: {
          ...questionResponses,
          answer: seededValue,
        },
      };
      continue;
    }

    const existingNodeValues = ensureObject(nextState.formResponses?.[field.sourceNodeId]);
    nextState.formResponses = {
      ...(nextState.formResponses || {}),
      [field.sourceNodeId]: {
        ...existingNodeValues,
        [field.id]: seededValue,
      },
    };
  }

  return nextState;
}

function collectBootstrapMemoryUpdates(memoryMap: Record<string, any>) {
  return Object.entries(memoryMap)
    .filter(([memoryKey, value]) => memoryKey && isFilledValue(value))
    .map(([memoryKey, value]) => ({
      memoryKey,
      value,
      source: "run_setup",
    }));
}

function defaultValueForField(field: FormField, reusableMemory: Record<string, any>) {
  if (field.memoryKey && reusableMemory[field.memoryKey] !== undefined) {
    return reusableMemory[field.memoryKey];
  }

  if (field.type === "multi-select") {
    return [];
  }

  return "";
}

function normalizeIncomingFieldValue(
  field: FormField,
  value: string | string[] | undefined
) {
  if (field.type === "multi-select") {
    if (Array.isArray(value)) {
      return value.map(String);
    }

    if (typeof value === "string" && value.trim()) {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return [];
  }

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return String(value || "");
}

function validateField(field: FormField, value: string | string[]) {
  if (
    field.required &&
    ((typeof value === "string" && !value.trim()) ||
      (Array.isArray(value) && !value.length))
  ) {
    return `${field.label} is required before the workflow can continue.`;
  }

  if (
    field.type === "single-select" &&
    typeof value === "string" &&
    value.trim() &&
    field.options.length &&
    !field.options.includes(value)
  ) {
    return `${field.label} must use one of the listed options.`;
  }

  if (field.type === "multi-select" && Array.isArray(value) && field.options.length) {
    const invalid = value.find((item) => !field.options.includes(item));
    if (invalid) {
      return `${field.label} has an invalid option: ${invalid}.`;
    }
  }

  if (field.type === "number" && typeof value === "string" && value.trim()) {
    if (Number.isNaN(Number(value))) {
      return `${field.label} must be a number.`;
    }
  }

  if (field.type === "url" && typeof value === "string" && value.trim()) {
    try {
      new URL(value);
    } catch {
      return `${field.label} must be a valid URL.`;
    }
  }

  return null;
}

function buildQuestionField(node: RuntimeFlowNode): FormField {
  return {
    id: "answer",
    label: String(node.settings?.name || "Answer"),
    type:
      node.settings?.responseType === "mcq" ? "single-select" : "short-text",
    required: node.settings?.required ?? true,
    options: Array.isArray(node.settings?.options)
      ? node.settings.options.map((option: unknown) => String(option))
      : [],
    placeholder:
      node.settings?.responseType === "mcq"
        ? "Choose one option"
        : "Enter the answer needed for this workflow step",
    memoryKey: node.settings?.memoryKey ? String(node.settings.memoryKey) : undefined,
    reusable: true,
  };
}

function buildPendingForm(
  node: RuntimeFlowNode,
  runState: PersistedRun,
  reusableMemory: Record<string, any>
): PendingFormPayload {
  const effectiveReusableMemory = {
    ...reusableMemory,
    ...ensureObject(runState.state?.reusableMemory),
  };

  if (node.type === "QuestionNode") {
    const field = buildQuestionField(node);
    const existingValues = ensureObject(runState.pendingAction?.values);
    const seededValues = ensureObject(runState.state?.formResponses?.[node.id]);

    return {
      nodeId: node.id,
      nodeName: getNodeName(node),
      description: String(
        node.settings?.question || "Answer the question so the workflow can continue."
      ),
      submitLabel: "Continue",
      fields: [field],
      values: {
        answer:
          existingValues.answer !== undefined
            ? existingValues.answer
            : seededValues.answer !== undefined
              ? seededValues.answer
              : defaultValueForField(field, effectiveReusableMemory),
      },
    };
  }

  const settings = ensureObject(node.settings);
  const fields: FormField[] = Array.isArray(settings.fields)
    ? settings.fields.map((field: unknown) => {
        const typed = ensureObject(field);
        return {
          id: String(typed.id || slugify(String(typed.label || "field"))),
          label: String(typed.label || "Field"),
          type: typed.type || "short-text",
          required: typed.required ?? true,
          options: Array.isArray(typed.options)
            ? typed.options.map((option: unknown) => String(option))
            : [],
          placeholder: typed.placeholder ? String(typed.placeholder) : undefined,
          memoryKey: typed.memoryKey ? String(typed.memoryKey) : undefined,
          reusable: Boolean(typed.reusable),
        } as FormField;
      })
    : [];
  const existingValues = ensureObject(runState.pendingAction?.values);
  const seededValues = ensureObject(runState.state?.formResponses?.[node.id]);

  return {
    nodeId: node.id,
    nodeName: getNodeName(node),
    description: String(settings.description || ""),
    submitLabel: String(settings.submitLabel || "Continue"),
    fields,
    values: Object.fromEntries(
      fields.map((field) => [
        field.id,
        existingValues[field.id] !== undefined
          ? existingValues[field.id]
          : seededValues[field.id] !== undefined
            ? seededValues[field.id]
            : defaultValueForField(field, effectiveReusableMemory),
      ])
    ),
  };
}

function buildPendingApproval(node: RuntimeFlowNode): PendingApprovalPayload {
  return {
    nodeId: node.id,
    nodeName: getNodeName(node),
    message: String(
      node.settings?.message || "Review this step before the workflow continues."
    ),
    approveLabel: "Approve",
    rejectLabel: "Reject",
  };
}

function applyFormSubmission(
  node: RuntimeFlowNode,
  values: Record<string, string | string[]>,
  state: Record<string, any>
) {
  const fields =
    node.type === "QuestionNode"
      ? [buildQuestionField(node)]
      : (Array.isArray(node.settings?.fields) ? node.settings.fields : []).map(
          (field: unknown) => {
            const typed = ensureObject(field);
            return {
              id: String(typed.id || slugify(String(typed.label || "field"))),
              label: String(typed.label || "Field"),
              type: typed.type || "short-text",
              required: typed.required ?? true,
              options: Array.isArray(typed.options)
                ? typed.options.map((option: unknown) => String(option))
                : [],
              placeholder: typed.placeholder ? String(typed.placeholder) : undefined,
              memoryKey: typed.memoryKey ? String(typed.memoryKey) : undefined,
              reusable: Boolean(typed.reusable),
            } as FormField;
          }
        );

  const normalizedValues = Object.fromEntries(
    fields.map((field) => [
      field.id,
      normalizeIncomingFieldValue(field, values[field.id]),
    ])
  );

  for (const field of fields) {
    const error = validateField(field, normalizedValues[field.id]);
    if (error) {
      return {
        ok: false as const,
        error,
        values: normalizedValues,
        memoryUpdates: [] as MemoryUpdate[],
      };
    }
  }

  const memoryUpdates = fields
    .filter((field) => field.reusable && field.memoryKey)
    .map((field) => ({
      memoryKey: field.memoryKey as string,
      value: normalizedValues[field.id],
      source: `${node.id}.${field.id}`,
    }));

  const nextState = deepClone(state);
  const nextReusableMemory = {
    ...ensureObject(nextState.reusableMemory),
  };

  for (const memoryUpdate of memoryUpdates) {
    nextReusableMemory[memoryUpdate.memoryKey] = memoryUpdate.value;
  }

  nextState.formResponses = {
    ...(nextState.formResponses || {}),
    [node.id]: normalizedValues,
  };
  nextState.reusableMemory = nextReusableMemory;
  nextState.latestOutput = normalizedValues;

  return {
    ok: true as const,
    values: normalizedValues,
    nextState,
    memoryUpdates,
    summary:
      node.type === "QuestionNode"
        ? `Collected answer for ${getNodeName(node)}.`
        : `Collected ${Object.keys(normalizedValues).length} form values for ${getNodeName(
            node
          )}.`,
  };
}

function initializeRunState(
  conversationId: string,
  persistedRun: PersistedRun | null | undefined,
  taskInput: string,
  reusableMemory: Record<string, any>,
  startNodeId: string
): PersistedRun {
  if (persistedRun?.conversationId && persistedRun.status !== "completed") {
    return {
      ...persistedRun,
      state: {
        ...(persistedRun.state || {}),
        reusableMemory,
      },
    };
  }

  return {
    conversationId,
    status: "running",
    currentNodeId: startNodeId,
    pendingAction: undefined,
    state: {
      task: taskInput,
      reusableMemory,
      formResponses: {},
      nodeOutputs: {},
      apiOutputs: {},
      approvals: {},
      trace: [],
      latestOutput: null,
    },
    nodeHistory: [],
    messages: taskInput.trim()
      ? [
          {
            role: "user",
            content: taskInput.trim(),
          },
        ]
      : [],
    browserSession: persistedRun?.browserSession,
  };
}

function buildCompletedMessage(state: Record<string, any>) {
  if (state.finalOutput) {
    return typeof state.finalOutput === "string"
      ? state.finalOutput
      : JSON.stringify(state.finalOutput, null, 2);
  }

  if (state.latestOutput) {
    return typeof state.latestOutput === "string"
      ? state.latestOutput
      : JSON.stringify(state.latestOutput, null, 2);
  }

  if (state.nodeOutputs && Object.keys(state.nodeOutputs).length) {
    const lastValue = Object.values(state.nodeOutputs).slice(-1)[0];
    return typeof lastValue === "string" ? lastValue : JSON.stringify(lastValue, null, 2);
  }

  return "Workflow completed.";
}

async function finalizeEndNode(node: RuntimeFlowNode, runState: PersistedRun) {
  const settings = ensureObject(node.settings);
  const state = ensureObject(runState.state);
  const baseOutput = {
    task: state.task,
    formResponses: state.formResponses || {},
    nodeOutputs: state.nodeOutputs || {},
    apiOutputs: state.apiOutputs || {},
    approvals: state.approvals || {},
  };

  if (settings.schema) {
    const output = await ollamaGenerateJson(
      `Create the final workflow result using this schema:
${settings.schema}

Available workflow state:
${JSON.stringify(baseOutput, null, 2)}`
    );
    state.finalOutput = tryParseJson(output) ?? output;
  } else {
    state.finalOutput = state.latestOutput || baseOutput;
  }

  return {
    state,
    message: buildCompletedMessage(state),
  };
}

async function runFallbackRecovery({
  config,
  node,
  problem,
  state,
  conversationId,
  browserSession,
}: {
  config: AgentRuntimeConfig;
  node: RuntimeFlowNode;
  problem: string;
  state: Record<string, any>;
  conversationId: string;
  browserSession?: any;
}) {
  const fallbackAgent = (config.agents ?? []).find(
    (agent) =>
      /fallback/i.test(agent.name || "") || /fallback/i.test(agent.instruction || "")
  );

  const isLoginProblem = /sign.?in|log.?in|login|authentication|credentials|session/i.test(problem);

  // --- Auto-login attempt: if this looks like a login wall, try browser_task with user profile first ---
  if (isLoginProblem) {
    try {
      const { runBrowserTask } = await import("@/lib/browser-runtime");
      const loginAttempt = await runBrowserTask({
        goal: `The workflow hit a sign-in/login page. Check if the user profile is already signed in. If not, attempt to sign in using any saved session or cookies. Goal context: ${problem}`,
        profile: "user",
        reuseSignedInSession: true,
        maxSteps: 3,
        browserSession,
        conversationId,
        workspaceKey: browserSession?.workspaceKey || conversationId,
        startUrl: String(state.reusableMemory?.preview_default_url || state.task || ""),
        rememberedUrl: String(state.reusableMemory?.preview_default_url || ""),
      });

      if (loginAttempt.status === "completed") {
        const loginPayload = loginAttempt as any;
        return {
          resolved: true,
          action: "continue",
          message: `Auto-login succeeded using the signed-in browser profile: ${loginPayload.result || "session active"}`,
          statePatch: {
            browserSession: loginPayload.browserSession,
            reusableMemory: {
              ...ensureObject(state.reusableMemory),
              authenticated: true,
            },
          },
          avoidanceRule: "Use the signed-in user profile for sites requiring authentication.",
          failurePattern: "login_page_blocked",
        };
      }
    } catch {
      // Auto-login failed — fall through to LLM recovery
    }
  }

  const recoveryPrompt = `You are the workflow fallback agent.
Return only valid JSON in this shape:
{
  "resolved": false,
  "action": "continue",
  "message": "",
  "statePatch": {},
  "browserUrl": "",
  "avoidanceRule": "",
  "failurePattern": ""
}

The available actions are:
- "continue": the workflow can keep going automatically
- "manual_browser": the user should take over the browser workspace, then resume
- "stop": the workflow should stop with an error

If this was a browser or navigation failure, include:
- "failurePattern": a short phrase describing what failed (e.g., "login button timeout")
- "avoidanceRule": a short instruction to prevent this next time (e.g., "Wait for the iframe to load before clicking login")

Current node:
${getNodeName(node)}

Problem:
${problem}

Workflow state:
${JSON.stringify(state, null, 2)}

Fallback instruction:
${fallbackAgent?.instruction || fallbackAgent?.instructions || "Recover workflow errors, suggest the next best step, and only ask for manual browser takeover when the site truly needs the user."}`;

  // --- Agentic recovery: use ollamaChat so the fallback model can call browser tools ---
  let parsed: any = null;

  try {
    const chatMessages: any[] = [
      { role: "system", content: `You are a workflow fallback recovery agent. ${fallbackAgent?.instruction || "Recover errors autonomously."}` },
      { role: "user", content: recoveryPrompt },
    ];

    const recoveryTools = [
      {
        type: "function",
        function: {
          name: "browser_task",
          description: "Execute a browser task to recover the workflow.",
          parameters: {
            type: "object",
            properties: {
              goal: { type: "string" },
              startUrl: { type: "string" },
              profile: { type: "string" },
            },
            required: ["goal"],
          },
        },
      },
    ];

    const { ollamaChat: chat } = await import("@/lib/ollama");
    const assistantMsg = await chat({
      messages: chatMessages,
      tools: recoveryTools,
      model: fallbackAgent?.model,
    });

    // If the model called browser_task, execute it
    if (assistantMsg.tool_calls?.length) {
      for (const toolCall of assistantMsg.tool_calls) {
        const fn = toolCall.function ?? toolCall;
        if (fn.name === "browser_task") {
          const args = typeof fn.arguments === "string" ? JSON.parse(fn.arguments) : fn.arguments;
          const { runBrowserTask } = await import("@/lib/browser-runtime");
          const taskResult = await runBrowserTask({
            goal: String(args.goal || problem),
            startUrl: String(args.startUrl || state.reusableMemory?.preview_default_url || ""),
            profile: String(args.profile || "user"),
            reuseSignedInSession: true,
            maxSteps: 4,
            browserSession,
            conversationId,
            workspaceKey: browserSession?.workspaceKey || conversationId,
            rememberedUrl: String(state.reusableMemory?.preview_default_url || ""),
          });

          if (taskResult.status === "completed") {
            const taskPayload = taskResult as any;
            return {
              resolved: true,
              action: "continue",
              message: `Fallback agent recovered via browser_task: ${taskPayload.result || "completed"}`,
              statePatch: { browserSession: taskPayload.browserSession },
              avoidanceRule: "Use browser_task with user profile for authenticated pages.",
              failurePattern: "browser_recovery_needed",
            };
          }
        }
      }
    }

    // Model returned a text response — try to parse it as recovery JSON
    if (assistantMsg.content?.trim()) {
      parsed = tryParseJson(assistantMsg.content);
    }
  } catch {
    parsed = null;
  }

  // --- Last-resort: plain JSON generation ---
  if (!parsed || typeof parsed !== "object") {
    try {
      const response = await ollamaGenerateJson(
        recoveryPrompt,
        fallbackAgent?.model
      );
      parsed = tryParseJson(response);
    } catch {
      parsed = null;
    }
  }

  if (!parsed || typeof parsed !== "object") {
    const hostedFallback = await sendPromptViaChatGptBrowser({
      prompt: `${recoveryPrompt}\n\nIf the local recovery path is exhausted, still return the same JSON shape.`,
    });

    if (hostedFallback.ok && hostedFallback.content?.trim()) {
      parsed = tryParseJson(hostedFallback.content);
    } else if (hostedFallback.requiresManualIntervention) {
      return {
        resolved: false,
        action: "manual_browser",
        message:
          hostedFallback.manualInterventionReason ||
          hostedFallback.error ||
          "The hosted browser fallback needs Brave and ChatGPT to be ready before recovery can continue.",
        statePatch: {},
        browserUrl: hostedFallback.browserUrl,
      };
    }
  }

  return {
    resolved: Boolean(parsed?.resolved),
    action: String(parsed?.action || "stop"),
    message: String(parsed?.message || "The fallback agent reviewed the error."),
    statePatch:
      parsed?.statePatch && typeof parsed.statePatch === "object" && !Array.isArray(parsed.statePatch)
        ? parsed.statePatch
        : {},
    browserUrl: parsed?.browserUrl ? String(parsed.browserUrl) : undefined,
    avoidanceRule: parsed?.avoidanceRule && typeof parsed.avoidanceRule === "string" ? parsed.avoidanceRule : undefined,
    failurePattern: parsed?.failurePattern && typeof parsed.failurePattern === "string" ? parsed.failurePattern : undefined,
  };
}

function recordFallbackHistory(
  state: Record<string, any>,
  node: RuntimeFlowNode,
  problem: string,
  fallback: {
    resolved: boolean;
    action: string;
    message: string;
    browserUrl?: string;
    lessonCreated?: boolean;
    workflowRewritten?: boolean;
    lessonSignature?: string;
  }
) {
  const nextState = deepClone(state);
  const history = Array.isArray(nextState.fallbackHistory)
    ? nextState.fallbackHistory
    : [];

  nextState.fallbackHistory = [
    ...history,
    {
      nodeId: node.id,
      nodeName: getNodeName(node),
      problem,
      resolved: fallback.resolved,
      action: fallback.action,
      message: fallback.message,
      browserUrl: fallback.browserUrl,
      lessonCreated: fallback.lessonCreated,
      workflowRewritten: fallback.workflowRewritten,
      lessonSignature: fallback.lessonSignature,
      createdAt: nowIso(),
    },
  ].slice(-20);

  return nextState;
}

function buildBrowserState(runState: PersistedRun): BrowserWorkspaceState | undefined {
  return runState.browserSession
    ? {
        url: runState.browserSession.lastUrl,
        title: runState.browserSession.lastTitle,
        lastError: runState.browserSession.lastError,
        mode: "live",
        provider: runState.browserSession.provider,
        profile: runState.browserSession.profile,
        tabId: runState.browserSession.tabId,
        targetId: runState.browserSession.targetId,
        serviceStatus: runState.browserSession.serviceStatus || "ready",
        availableRefs: Array.isArray(runState.browserSession.availableRefs)
          ? runState.browserSession.availableRefs
          : undefined,
      }
    : undefined;
}

export async function runWorkflowConversation({
  agentName,
  agentConfig,
  input,
  conversationId,
  persistedRun,
  memoryRecords = [],
  memoryTimeline = [],
  resumeAction,
  prefilledQuestionAnswers,
  runSetupAnswers,
  reusableMemoryBootstrap,
}: {
  agentName: string;
  agentConfig: any;
  input: string;
  conversationId?: string | null;
  persistedRun?: PersistedRun | null;
  memoryRecords?: MemoryRecord[];
  memoryTimeline?: Array<Record<string, any>>;
  resumeAction?: ResumeAction | null;
  prefilledQuestionAnswers?: PrefilledQuestionAnswer[];
  runSetupAnswers?: RunSetupAnswer[];
  reusableMemoryBootstrap?: Record<string, any>;
}): Promise<WorkflowExecutionResult> {
  const config = normalizeAgentToolConfig(agentConfig);
  let workflowRewritePayload:
    | {
        nodeId: string;
        nodeType: string;
        failureReason: string;
        avoidanceRule: string;
        failurePattern?: string;
        fallbackMessage: string;
        currentInstruction?: string;
      }
    | undefined;

  if (!config.flow?.flow?.length || Number(config.version || 1) < 3) {
    const sessionId = initializeConversation(conversationId || undefined);
    const result = await runLegacyAgentConversation({
      agentName,
      agentConfig: config,
      input,
      conversationId: sessionId,
      prefilledQuestionAnswers,
    });

    return {
      envelope: {
        status: "completed",
        conversationId: result.conversationId,
        currentNodeId: null,
        message: result.text,
        trace: persistedRun?.nodeHistory || [],
      },
      persistedRun: persistedRun || {
        conversationId: result.conversationId,
        status: "completed",
      },
      memoryUpdates: [],
    };
  }

  const resolvedConversationId =
    conversationId || persistedRun?.conversationId || randomUUID();
  const reusableMemory = buildReusableMemoryMap(memoryRecords);
  const nodeMap = getNodeMap(config.flow.flow);
  const startNodeId = config.flow.startNode || "start";
  let runState = initializeRunState(
    resolvedConversationId,
    persistedRun,
    input,
    reusableMemory,
    startNodeId
  );

  if (persistedRun?.status === "completed" && input.trim()) {
    runState = initializeRunState(
      resolvedConversationId,
      null,
      input,
      reusableMemory,
      startNodeId
    );
  }

  const pendingNode = runState.currentNodeId ? nodeMap.get(runState.currentNodeId) : null;
  const bootstrapPayload = buildBootstrapPayload({
    config,
    prefilledQuestionAnswers,
    runSetupAnswers,
    reusableMemoryBootstrap,
  });
  const state = hydrateRunSetupState(
    ensureObject(runState.state),
    config,
    input,
    {
      answerMap: bootstrapPayload.answerMap,
      memoryMap: {
        ...reusableMemory,
        ...bootstrapPayload.memoryMap,
      },
    }
  );

  if (input.trim() && (!state.task || runState.status === "completed")) {
    state.task = input.trim();
  }
  state.memoryTimeline = Array.isArray(memoryTimeline)
    ? memoryTimeline.slice(0, 40)
    : [];

  runState.state = state;
  const collectedMemoryUpdates: MemoryUpdate[] = collectBootstrapMemoryUpdates(
    bootstrapPayload.memoryMap
  );

  if (runState.status === "pending_form" && pendingNode) {
    if (!resumeAction || resumeAction.type !== "form") {
      const pendingForm = buildPendingForm(
        pendingNode,
        runState,
        ensureObject(runState.state?.reusableMemory)
      );
      runState.pendingAction = {
        type: "form",
        values: pendingForm.values,
      };
      return {
        envelope: {
          status: "pending_form",
          conversationId: resolvedConversationId,
          currentNodeId: pendingNode.id,
          message:
            pendingNode.type === "QuestionNode"
              ? String(
                  pendingNode.settings?.question ||
                    "Answer the question so the workflow can continue."
                )
              : String(
                  pendingNode.settings?.description ||
                    "Fill out the form so the workflow can continue."
                ),
          form: pendingForm,
          trace: runState.nodeHistory || [],
        },
        persistedRun: runState,
        memoryUpdates: [],
      };
    }

    const submission = applyFormSubmission(pendingNode, resumeAction.values, state);
    if (!submission.ok) {
      const pendingForm = buildPendingForm(
        pendingNode,
        {
          ...runState,
          pendingAction: {
            type: "form",
            values: submission.values,
          },
        },
        ensureObject(runState.state?.reusableMemory)
      );
      return {
        envelope: {
          status: "pending_form",
          conversationId: resolvedConversationId,
          currentNodeId: pendingNode.id,
          message: submission.error,
          form: pendingForm,
          trace: runState.nodeHistory || [],
        },
        persistedRun: {
          ...runState,
          pendingAction: {
            type: "form",
            values: submission.values,
          },
        },
        memoryUpdates: [],
      };
    }

    runState.state = submission.nextState;
    runState.pendingAction = undefined;
    runState.status = "running";
    runState.nodeHistory = trackTrace(
      runState.nodeHistory || [],
      pendingNode,
      "completed",
      submission.summary
    );
    collectedMemoryUpdates.push(...submission.memoryUpdates);
    runState.currentNodeId = getNextNodeId(pendingNode) || null;
  }

  if (runState.status === "pending_approval" && pendingNode) {
    if (!resumeAction || resumeAction.type !== "approval") {
      return {
        envelope: {
          status: "pending_approval",
          conversationId: resolvedConversationId,
          currentNodeId: pendingNode.id,
          message: String(
            pendingNode.settings?.message ||
              "Approve or reject this step before the workflow continues."
          ),
          approval: buildPendingApproval(pendingNode),
          trace: runState.nodeHistory || [],
        },
        persistedRun: runState,
        memoryUpdates: [],
      };
    }

    runState.state = {
      ...state,
      approvals: {
        ...(state.approvals || {}),
        [pendingNode.id]: resumeAction.decision,
      },
      latestOutput: {
        decision: resumeAction.decision,
      },
    };
    runState.pendingAction = undefined;
    runState.status = "running";
    runState.nodeHistory = trackTrace(
      runState.nodeHistory || [],
      pendingNode,
      "completed",
      `Approval decision: ${resumeAction.decision}.`
    );
    runState.currentNodeId = getNextNodeId(pendingNode, resumeAction.decision) || null;
  }

  if (runState.status === "pending_browser" && pendingNode) {
    if (!resumeAction || resumeAction.type !== "browser") {
      return {
        envelope: {
          status: "pending_browser",
          conversationId: resolvedConversationId,
          currentNodeId: pendingNode.id,
          message: String(
            runState.pendingAction?.reason ||
              "Manual browser takeover is needed before the workflow can continue."
          ),
          browser: runState.pendingAction as PendingBrowserPayload,
          browserState: buildBrowserState(runState),
          trace: runState.nodeHistory || [],
        },
        persistedRun: runState,
        memoryUpdates: [],
      };
    }

    const nextState = ensureObject(runState.state);
    nextState.browserTakeovers = {
      ...(nextState.browserTakeovers || {}),
      [pendingNode.id]: {
        note: resumeAction.note || "",
        currentUrl: resumeAction.currentUrl || runState.browserSession?.lastUrl || "",
        completedAt: nowIso(),
      },
    };
    nextState.latestOutput = nextState.browserTakeovers[pendingNode.id];
    runState.state = nextState;
    runState.pendingAction = undefined;
    runState.status = "running";
    runState.nodeHistory = trackTrace(
      runState.nodeHistory || [],
      pendingNode,
      "completed",
      "Manual browser takeover completed."
    );
  }

  for (let step = 0; step < 24; step += 1) {
    const currentNode = runState.currentNodeId
      ? nodeMap.get(runState.currentNodeId)
      : null;

    if (!currentNode) {
      const message = buildCompletedMessage(ensureObject(runState.state));
      runState.status = "completed";
      runState.currentNodeId = null;
      return {
        envelope: {
          status: "completed",
          conversationId: resolvedConversationId,
          currentNodeId: null,
          message,
          browserState: buildBrowserState(runState),
          trace: runState.nodeHistory || [],
        },
        persistedRun: runState,
        memoryUpdates: collectedMemoryUpdates,
      };
    }

    if (currentNode.type === "StartNode") {
      runState.currentNodeId = getNextNodeId(currentNode) || null;
      continue;
    }

    if (currentNode.type === "QuestionNode" || currentNode.type === "FormNode") {
      const pendingForm = buildPendingForm(
        currentNode,
        runState,
        ensureObject(runState.state?.reusableMemory)
      );
      const seededSubmission = applyFormSubmission(
        currentNode,
        ensureObject(pendingForm.values),
        ensureObject(runState.state)
      );

      if (seededSubmission.ok) {
        runState.state = seededSubmission.nextState;
        runState.pendingAction = undefined;
        runState.status = "running";
        runState.nodeHistory = trackTrace(
          runState.nodeHistory || [],
          currentNode,
          "completed",
          `Used pre-run setup for ${getNodeName(currentNode)}.`
        );
        collectedMemoryUpdates.push(...seededSubmission.memoryUpdates);
        runState.currentNodeId = getNextNodeId(currentNode) || null;
        continue;
      }

      runState.status = "pending_form";
      runState.pendingAction = {
        type: "form",
        values: pendingForm.values,
      };
      runState.nodeHistory = trackTrace(
        runState.nodeHistory || [],
        currentNode,
        "pending",
        currentNode.type === "QuestionNode"
          ? "Waiting for the user to answer the question."
          : "Waiting for the user to complete the form."
      );
      return {
        envelope: {
          status: "pending_form",
          conversationId: resolvedConversationId,
          currentNodeId: currentNode.id,
          message:
            currentNode.type === "QuestionNode"
              ? String(
                  currentNode.settings?.question ||
                    "Answer the question so the workflow can continue."
                )
              : String(
                  currentNode.settings?.description ||
                    "Fill out the form so the workflow can continue."
                ),
          form: pendingForm,
          browserState: buildBrowserState(runState),
          trace: runState.nodeHistory || [],
        },
        persistedRun: runState,
        memoryUpdates: collectedMemoryUpdates,
      };
    }

    if (currentNode.type === "CaptchaNode") {
      const settings = ensureObject(currentNode.settings);

      if (!runState.browserSession) {
        if (settings.pauseWithoutBrowser) {
          const browserPayload: PendingBrowserPayload = {
            nodeId: currentNode.id,
            nodeName: getNodeName(currentNode),
            reason:
              String(settings.message || "").trim() ||
              "Open the browser workspace, complete the verification step if needed, then resume the workflow.",
            suggestedAction:
              "Open the browser workspace, verify the page is clear, then click Resume Workflow.",
          };

          runState.status = "pending_browser";
          runState.pendingAction = browserPayload;
          runState.nodeHistory = trackTrace(
            runState.nodeHistory || [],
            currentNode,
            "pending",
            browserPayload.reason
          );
          return {
            envelope: {
              status: "pending_browser",
              conversationId: resolvedConversationId,
              currentNodeId: currentNode.id,
              message: browserPayload.reason,
              browser: browserPayload,
              browserState: buildBrowserState(runState),
              trace: runState.nodeHistory || [],
            },
            persistedRun: runState,
            memoryUpdates: collectedMemoryUpdates,
          };
        }

        const nextState = ensureObject(runState.state);
        nextState.nodeOutputs = {
          ...(nextState.nodeOutputs || {}),
          [currentNode.id]: {
            checkedAt: nowIso(),
            detected: false,
            status: "skipped_no_browser",
          },
        };
        nextState.latestOutput = nextState.nodeOutputs[currentNode.id];
        runState.state = nextState;
        runState.nodeHistory = trackTrace(
          runState.nodeHistory || [],
          currentNode,
          "completed",
          "No browser workspace was attached, so the CAPTCHA gate was skipped."
        );
        runState.currentNodeId = getNextNodeId(currentNode) || null;
        continue;
      }

      let snapshot: any = null;
      try {
        snapshot = await getBrowserWorkspaceSnapshot({
          conversationId: resolvedConversationId,
          browserSession: runState.browserSession,
          profile: runState.browserSession?.profile,
          workspaceKey:
            runState.browserSession?.workspaceKey || resolvedConversationId,
        });
      } catch (error) {
        snapshot = null;
        runState.browserSession = {
          ...(runState.browserSession || {}),
          lastError:
            error instanceof Error
              ? error.message
              : "Unable to read the live browser workspace.",
        };
      }

      updateBrowserSessionFromSnapshot(runState, snapshot);

      if (
        isCaptchaOrVerificationChallenge(
          snapshot,
          settings.pauseOnAnyVerification !== false
        )
      ) {
        const browserPayload: PendingBrowserPayload = {
          nodeId: currentNode.id,
          nodeName: getNodeName(currentNode),
          reason: buildCaptchaPauseReason(currentNode, snapshot),
          url: snapshot?.currentUrl || runState.browserSession?.lastUrl,
          title: snapshot?.title || runState.browserSession?.lastTitle,
          provider: snapshot?.provider || runState.browserSession?.provider,
          tabId: snapshot?.tabId || runState.browserSession?.tabId,
          profile: snapshot?.profile || runState.browserSession?.profile,
          suggestedAction:
            "Complete the CAPTCHA or verification in the browser workspace, then click Resume Workflow.",
        };

        runState.status = "pending_browser";
        runState.pendingAction = browserPayload;
        runState.nodeHistory = trackTrace(
          runState.nodeHistory || [],
          currentNode,
          "pending",
          browserPayload.reason
        );
        return {
          envelope: {
            status: "pending_browser",
            conversationId: resolvedConversationId,
            currentNodeId: currentNode.id,
            message: browserPayload.reason,
            browser: browserPayload,
            browserState: buildBrowserState(runState),
            trace: runState.nodeHistory || [],
          },
          persistedRun: runState,
          memoryUpdates: collectedMemoryUpdates,
        };
      }

      const nextState = ensureObject(runState.state);
      nextState.nodeOutputs = {
        ...(nextState.nodeOutputs || {}),
        [currentNode.id]: {
          checkedAt: nowIso(),
          detected: false,
          status: snapshot ? "clear" : "no_snapshot",
          url: snapshot?.currentUrl || runState.browserSession?.lastUrl || "",
          title: snapshot?.title || runState.browserSession?.lastTitle || "",
        },
      };
      nextState.latestOutput = nextState.nodeOutputs[currentNode.id];
      runState.state = nextState;
      runState.nodeHistory = trackTrace(
        runState.nodeHistory || [],
        currentNode,
        "completed",
        snapshot
          ? "No CAPTCHA or human verification was detected."
          : "The CAPTCHA gate could not read a live snapshot, so the workflow continued."
      );
      runState.currentNodeId = getNextNodeId(currentNode) || null;
      continue;
    }

    if (currentNode.type === "UserApprovalNode") {
      runState.status = "pending_approval";
      runState.pendingAction = {
        type: "approval",
      };
      runState.nodeHistory = trackTrace(
        runState.nodeHistory || [],
        currentNode,
        "pending",
        "Waiting for approval."
      );
      return {
        envelope: {
          status: "pending_approval",
          conversationId: resolvedConversationId,
          currentNodeId: currentNode.id,
          message: String(
            currentNode.settings?.message ||
              "Approve or reject this step before the workflow continues."
          ),
          approval: buildPendingApproval(currentNode),
          browserState: buildBrowserState(runState),
          trace: runState.nodeHistory || [],
        },
        persistedRun: runState,
        memoryUpdates: collectedMemoryUpdates,
      };
    }

    // --- Specialized agent nodes (Researcher, Writer, Viewer, Reviewer, Executor) ---
    const SPECIALIZED_NODE_TYPES = [
      "ResearcherAgentNode",
      "WriterAgentNode",
      "ViewerAgentNode",
      "ReviewerAgentNode",
      "ExecutorAgentNode",
    ] as const;

    if (SPECIALIZED_NODE_TYPES.includes(currentNode.type as any)) {
      const result = await runSpecializedAgentNode(currentNode, config, runState);

      if (result.manualBrowser) {
        // Same fallback path as AgentNode
        const fallback = await runFallbackRecovery({
          config,
          node: currentNode,
          problem: result.manualBrowser.reason,
          state: ensureObject(runState.state),
          conversationId: resolvedConversationId,
          browserSession: runState.browserSession,
        });
        let fallbackObj = fallback as any;

        if (fallback.action === "continue" && fallback.resolved && fallbackObj.avoidanceRule && fallbackObj.failurePattern) {
          const lessonSignature = `lesson_${randomUUID().split("-")[0]}`;
          fallbackObj.lessonCreated = true;
          fallbackObj.lessonSignature = lessonSignature;
          let hostname = "unknown";
          try { hostname = new URL(runState.browserSession?.lastUrl || "").hostname; } catch {}
          collectedMemoryUpdates.push({
            memoryKey: config.executionPolicy?.browserFailureMemoryKey || "browser_failure_playbook",
            value: {
              nodeId: currentNode.id,
              provider: runState.browserSession?.provider || "unknown",
              hostname,
              failurePattern: fallbackObj.failurePattern,
              avoidanceRule: fallbackObj.avoidanceRule,
              recoveryAction: fallback.action,
              updatedAt: nowIso(),
              successCount: 1,
            },
            source: lessonSignature,
          });
          if (config.executionPolicy?.autoRewriteRecoveredBrowserFailures) {
            fallbackObj.workflowRewritten = true;
            workflowRewritePayload = {
              nodeId: currentNode.id,
              nodeType: currentNode.type,
              failureReason: result.manualBrowser.reason,
              avoidanceRule: fallbackObj.avoidanceRule,
              failurePattern: fallbackObj.failurePattern,
              fallbackMessage: fallback.message,
              currentInstruction: String(currentNode.settings?.instruction || ""),
            };
          }
        }

        runState.state = recordFallbackHistory(
          ensureObject(runState.state), currentNode, result.manualBrowser.reason, fallbackObj
        );

        if (fallbackObj.action === "continue" && fallbackObj.resolved) {
          runState.state = { ...ensureObject(runState.state), ...(fallback.statePatch || {}) };
          runState.nodeHistory = trackTrace(runState.nodeHistory || [], currentNode, "completed", fallback.message);
          runState.currentNodeId = getNextNodeId(currentNode) || null;
          continue;
        }

        const browserPayload: PendingBrowserPayload = {
          nodeId: currentNode.id,
          nodeName: getNodeName(currentNode),
          reason: fallback.action === "manual_browser" ? fallback.message : result.manualBrowser.reason,
          url: fallback.browserUrl || result.manualBrowser.url || runState.browserSession?.lastUrl,
          title: result.manualBrowser.title || runState.browserSession?.lastTitle,
          provider: runState.browserSession?.provider,
          tabId: runState.browserSession?.tabId,
          profile: runState.browserSession?.profile,
          suggestedAction: result.manualBrowser.suggestedAction || "Complete the step in the browser workspace, then resume.",
        };

        runState.status = "pending_browser";
        runState.pendingAction = browserPayload;
        runState.nodeHistory = trackTrace(runState.nodeHistory || [], currentNode, "pending", browserPayload.reason);
        return {
          envelope: {
            status: "pending_browser",
            conversationId: resolvedConversationId,
            currentNodeId: currentNode.id,
            message: browserPayload.reason,
            browser: browserPayload,
            browserState: buildBrowserState(runState),
            trace: runState.nodeHistory || [],
          },
          persistedRun: runState,
          memoryUpdates: collectedMemoryUpdates,
          workflowRewrite: workflowRewritePayload,
        };
      }

      // Success path — same as AgentNode
      const nextState = ensureObject(runState.state);
      const nextReusableMemory = { ...ensureObject(nextState.reusableMemory) };
      for (const mu of result.memoryUpdates || []) {
        nextReusableMemory[mu.memoryKey] = mu.value;
      }
      nextState.nodeOutputs = { ...(nextState.nodeOutputs || {}), [currentNode.id]: result.output };
      nextState.latestOutput = result.output;
      nextState.reusableMemory = nextReusableMemory;
      // Persist node patches from recovery so next run reads the avoidance hint
      if (nextReusableMemory[`node_patch_${currentNode.id}`]) {
        nextState.nodePatches = {
          ...ensureObject(nextState.nodePatches),
          [currentNode.id]: nextReusableMemory[`node_patch_${currentNode.id}`],
        };
      }
      runState.state = nextState;
      runState.messages = result.messages;
      runState.browserSession = result.browserSession;
      collectedMemoryUpdates.push(...(result.memoryUpdates || []));
      runState.nodeHistory = trackTrace(runState.nodeHistory || [], currentNode, "completed", result.summary.slice(0, 280));
      runState.currentNodeId = getNextNodeId(currentNode) || null;
      continue;
    }

    if (currentNode.type === "SignInAgentNode") {
      // Run exactly like an AgentNode but always with user profile + signed-in session
      const signInNode = {
        ...currentNode,
        type: "AgentNode" as const,
        settings: {
          ...ensureObject(currentNode.settings),
          preferredBrowserProfile: "user",
          reuseSignedInSession: true,
        },
      };
      const result = await runAgentNode(signInNode, config, runState);

      if (result.manualBrowser) {
        // Sign-in agent hit a page it can't handle — pass to standard fallback with extra context
        const fallback = await runFallbackRecovery({
          config,
          node: currentNode,
          problem: `Sign-in required: ${result.manualBrowser.reason}`,
          state: ensureObject(runState.state),
          conversationId: resolvedConversationId,
          browserSession: runState.browserSession,
        });

        if (fallback.action === "continue" && fallback.resolved) {
          runState.state = { ...ensureObject(runState.state), ...(fallback.statePatch || {}) };
          runState.nodeHistory = trackTrace(runState.nodeHistory || [], currentNode, "completed", fallback.message);
          runState.currentNodeId = getNextNodeId(currentNode) || null;
          continue;
        }

        // Couldn't auto-sign-in — escalate
        const browserPayload: PendingBrowserPayload = {
          nodeId: currentNode.id,
          nodeName: getNodeName(currentNode),
          reason: `Sign-in required: Please log in to the site in the browser workspace, then resume.`,
          url: result.manualBrowser.url || runState.browserSession?.lastUrl,
          title: result.manualBrowser.title || runState.browserSession?.lastTitle,
          provider: runState.browserSession?.provider,
          tabId: runState.browserSession?.tabId,
          profile: "user",
          suggestedAction: "Log in to the site in the browser workspace using the user profile, then click Resume.",
        };

        runState.status = "pending_browser";
        runState.pendingAction = browserPayload;
        runState.nodeHistory = trackTrace(runState.nodeHistory || [], currentNode, "pending", browserPayload.reason);
        return {
          envelope: {
            status: "pending_browser",
            conversationId: resolvedConversationId,
            currentNodeId: currentNode.id,
            message: browserPayload.reason,
            browser: browserPayload,
            browserState: buildBrowserState(runState),
            trace: runState.nodeHistory || [],
          },
          persistedRun: runState,
          memoryUpdates: collectedMemoryUpdates,
        };
      }

      const nextState = ensureObject(runState.state);
      nextState.nodeOutputs = { ...(nextState.nodeOutputs || {}), [currentNode.id]: result.output };
      nextState.latestOutput = result.output;
      nextState.reusableMemory = { ...ensureObject(nextState.reusableMemory), authenticated: true };
      runState.state = nextState;
      runState.messages = result.messages;
      runState.browserSession = result.browserSession;
      runState.nodeHistory = trackTrace(runState.nodeHistory || [], currentNode, "completed", result.summary.slice(0, 280));
      runState.currentNodeId = getNextNodeId(currentNode) || null;
      continue;
    }

    if (currentNode.type === "AgentNode") {
      const result = await runAgentNode(currentNode, config, runState);
      if (result.manualBrowser) {
        const fallback = await runFallbackRecovery({
          config,
          node: currentNode,
          problem: result.manualBrowser.reason,
          state: ensureObject(runState.state),
          conversationId: resolvedConversationId,
          browserSession: runState.browserSession,
        });
        let fallbackObj = fallback as any;

        if (fallback.action === "continue" && fallback.resolved && fallbackObj.avoidanceRule && fallbackObj.failurePattern) {
          const lessonSignature = `lesson_${randomUUID().split("-")[0]}`;
          fallbackObj.lessonCreated = true;
          fallbackObj.lessonSignature = lessonSignature;
          
          let hostname = "unknown";
          try {
            hostname = new URL(runState.browserSession?.lastUrl || "").hostname;
          } catch {}

          collectedMemoryUpdates.push({
            memoryKey: config.executionPolicy?.browserFailureMemoryKey || "browser_failure_playbook",
            value: {
              nodeId: currentNode.id,
              provider: runState.browserSession?.provider || "unknown",
              hostname,
              failurePattern: fallbackObj.failurePattern,
              avoidanceRule: fallbackObj.avoidanceRule,
              recoveryAction: fallback.action,
              updatedAt: nowIso(),
              successCount: 1,
            },
            source: lessonSignature,
          });

          if (config.executionPolicy?.autoRewriteRecoveredBrowserFailures) {
            fallbackObj.workflowRewritten = true;
            workflowRewritePayload = {
              nodeId: currentNode.id,
              nodeType: currentNode.type,
              failureReason: result.manualBrowser.reason,
              avoidanceRule: fallbackObj.avoidanceRule,
              failurePattern: fallbackObj.failurePattern,
              fallbackMessage: fallback.message,
              currentInstruction: String(currentNode.settings?.instruction || ""),
            };
          }
        }

        runState.state = recordFallbackHistory(
          ensureObject(runState.state),
          currentNode,
          result.manualBrowser.reason,
          fallbackObj
        );

        if (fallbackObj.action === "continue" && fallbackObj.resolved) {
          runState.state = {
            ...ensureObject(runState.state),
            ...(fallback.statePatch || {}),
          };
          runState.nodeHistory = trackTrace(
            runState.nodeHistory || [],
            currentNode,
            "completed",
            fallback.message
          );
          runState.currentNodeId = getNextNodeId(currentNode) || null;
          continue;
        }

        const browserPayload: PendingBrowserPayload = {
          nodeId: currentNode.id,
          nodeName: getNodeName(currentNode),
          reason: fallback.action === "manual_browser" ? fallback.message : result.manualBrowser.reason,
          url:
            fallback.browserUrl ||
            result.manualBrowser.url ||
            runState.browserSession?.lastUrl,
          title: result.manualBrowser.title || runState.browserSession?.lastTitle,
          provider: runState.browserSession?.provider,
          tabId: runState.browserSession?.tabId,
          profile: runState.browserSession?.profile,
          suggestedAction:
            result.manualBrowser.suggestedAction ||
            "Complete the step in the browser workspace, then resume the workflow.",
        };

        runState.status = "pending_browser";
        runState.pendingAction = browserPayload;
        runState.nodeHistory = trackTrace(
          runState.nodeHistory || [],
          currentNode,
          "pending",
          browserPayload.reason
        );
        return {
          envelope: {
            status: "pending_browser",
            conversationId: resolvedConversationId,
            currentNodeId: currentNode.id,
            message: browserPayload.reason,
            browser: browserPayload,
            browserState: buildBrowserState(runState),
            trace: runState.nodeHistory || [],
          },
          persistedRun: runState,
          memoryUpdates: collectedMemoryUpdates,
          workflowRewrite: workflowRewritePayload,
        };
      }

      const nextState = ensureObject(runState.state);
      const nextReusableMemory = {
        ...ensureObject(nextState.reusableMemory),
      };

      for (const memoryUpdate of result.memoryUpdates || []) {
        nextReusableMemory[memoryUpdate.memoryKey] = memoryUpdate.value;
      }

      nextState.nodeOutputs = {
        ...(nextState.nodeOutputs || {}),
        [currentNode.id]: result.output,
      };
      nextState.latestOutput = result.output;
      nextState.reusableMemory = nextReusableMemory;
      runState.state = nextState;
      runState.messages = result.messages;
      runState.browserSession = result.browserSession;
      collectedMemoryUpdates.push(...(result.memoryUpdates || []));
      runState.nodeHistory = trackTrace(
        runState.nodeHistory || [],
        currentNode,
        "completed",
        result.summary.slice(0, 280)
      );
      runState.currentNodeId = getNextNodeId(currentNode) || null;
      continue;
    }

    if (currentNode.type === "ApiNode") {
      const result = await runApiNode(currentNode, runState);
      if (result.output.ok === false) {
        const fallback = await runFallbackRecovery({
          config,
          node: currentNode,
          problem: String(result.output.error || result.summary),
          state: ensureObject(runState.state),
          conversationId: resolvedConversationId,
          browserSession: runState.browserSession,
        });
        let fallbackObj = fallback as any;

        if (
          fallback.action === "continue" &&
          fallback.resolved &&
          fallbackObj.avoidanceRule &&
          fallbackObj.failurePattern
        ) {
          const lessonSignature = `lesson_${randomUUID().split("-")[0]}`;
          fallbackObj.lessonCreated = true;
          fallbackObj.lessonSignature = lessonSignature;

          collectedMemoryUpdates.push({
            memoryKey: config.executionPolicy?.browserFailureMemoryKey || "browser_failure_playbook",
            value: {
              nodeId: currentNode.id,
              provider: runState.browserSession?.provider || "unknown",
              hostname: "api_or_non_browser",
              failurePattern: fallbackObj.failurePattern,
              avoidanceRule: fallbackObj.avoidanceRule,
              recoveryAction: fallback.action,
              updatedAt: nowIso(),
              successCount: 1,
            },
            source: lessonSignature,
          });

          if (config.executionPolicy?.autoRewriteRecoveredBrowserFailures) {
            fallbackObj.workflowRewritten = true;
            workflowRewritePayload = {
              nodeId: currentNode.id,
              nodeType: currentNode.type,
              failureReason: String(result.output.error || result.summary),
              avoidanceRule: fallbackObj.avoidanceRule,
              failurePattern: fallbackObj.failurePattern,
              fallbackMessage: fallback.message,
              currentInstruction: String(currentNode.settings?.instruction || ""),
            };
          }
        }

        runState.state = recordFallbackHistory(
          ensureObject(runState.state),
          currentNode,
          String(result.output.error || result.summary),
          fallbackObj
        );

        if (fallbackObj.action === "continue" && fallbackObj.resolved) {
          runState.state = {
            ...ensureObject(runState.state),
            ...(fallback.statePatch || {}),
          };
          runState.nodeHistory = trackTrace(
            runState.nodeHistory || [],
            currentNode,
            "completed",
            fallback.message
          );
          runState.currentNodeId = getNextNodeId(currentNode) || null;
          continue;
        }

        if (fallback.action === "manual_browser") {
          const browserPayload: PendingBrowserPayload = {
            nodeId: currentNode.id,
            nodeName: getNodeName(currentNode),
            reason: fallback.message,
            url: fallback.browserUrl || runState.browserSession?.lastUrl,
            title: runState.browserSession?.lastTitle,
            provider: runState.browserSession?.provider,
            tabId: runState.browserSession?.tabId,
            profile: runState.browserSession?.profile,
            suggestedAction:
              "Use the browser workspace to recover the site manually, then resume the workflow.",
          };

          runState.status = "pending_browser";
          runState.pendingAction = browserPayload;
          runState.nodeHistory = trackTrace(
            runState.nodeHistory || [],
            currentNode,
            "pending",
            browserPayload.reason
          );
          return {
            envelope: {
              status: "pending_browser",
              conversationId: resolvedConversationId,
              currentNodeId: currentNode.id,
              message: browserPayload.reason,
              browser: browserPayload,
              browserState: buildBrowserState(runState),
              trace: runState.nodeHistory || [],
            },
            persistedRun: runState,
            memoryUpdates: collectedMemoryUpdates,
            workflowRewrite: workflowRewritePayload,
          };
        }
      }

      const nextState = ensureObject(runState.state);
      nextState.apiOutputs = {
        ...(nextState.apiOutputs || {}),
        [currentNode.id]: result.output,
      };
      nextState.latestOutput = result.output;
      runState.state = nextState;
      runState.nodeHistory = trackTrace(
        runState.nodeHistory || [],
        currentNode,
        result.output.ok === false ? "error" : "completed",
        result.summary
      );
      runState.currentNodeId = getNextNodeId(currentNode) || null;
      continue;
    }

    if (currentNode.type === "IfElseNode") {
      const evaluation = await evaluateCondition(
        String(currentNode.settings?.ifCondition || ""),
        ensureObject(runState.state),
        getNodeName(currentNode)
      );
      runState.nodeHistory = trackTrace(
        runState.nodeHistory || [],
        currentNode,
        "completed",
        evaluation.reason
      );
      runState.currentNodeId = getNextNodeId(
        currentNode,
        evaluation.result ? "if" : "else"
      );
      continue;
    }

    if (currentNode.type === "WhileNode") {
      const stateSnapshot = ensureObject(runState.state);
      const visitCounts = ensureObject(stateSnapshot.loopCounts);
      const count = Number(visitCounts[currentNode.id] || 0) + 1;
      stateSnapshot.loopCounts = {
        ...visitCounts,
        [currentNode.id]: count,
      };
      runState.state = stateSnapshot;

      if (count > 3) {
        runState.nodeHistory = trackTrace(
          runState.nodeHistory || [],
          currentNode,
          "completed",
          "Loop safeguard stopped the node after 3 iterations."
        );
        runState.currentNodeId = getNextNodeId(currentNode, "done") || null;
        continue;
      }

      const evaluation = await evaluateCondition(
        String(currentNode.settings?.whileCondition || ""),
        stateSnapshot,
        getNodeName(currentNode)
      );
      runState.nodeHistory = trackTrace(
        runState.nodeHistory || [],
        currentNode,
        "completed",
        evaluation.reason
      );
      runState.currentNodeId = getNextNodeId(
        currentNode,
        evaluation.result ? "loop" : "done"
      );
      continue;
    }

    if (currentNode.type === "EndNode") {
      const finalized = await finalizeEndNode(currentNode, runState);
      runState.state = finalized.state;
      runState.status = "completed";
      runState.currentNodeId = null;
      runState.pendingAction = undefined;
      runState.nodeHistory = trackTrace(
        runState.nodeHistory || [],
        currentNode,
        "completed",
        "Workflow completed."
      );
      return {
        envelope: {
          status: "completed",
          conversationId: resolvedConversationId,
          currentNodeId: null,
          message: finalized.message,
          browserState: buildBrowserState(runState),
          trace: runState.nodeHistory || [],
        },
        persistedRun: runState,
        memoryUpdates: collectedMemoryUpdates,
      };
    }

    runState.currentNodeId = getNextNodeId(currentNode) || null;
  }

  runState.status = "error";
  runState.currentNodeId = runState.currentNodeId || null;

  return {
    envelope: {
      status: "error",
      conversationId: resolvedConversationId,
      currentNodeId: runState.currentNodeId,
      message: "The workflow hit its step limit before finishing.",
      browserState: buildBrowserState(runState),
      trace: runState.nodeHistory || [],
    },
    persistedRun: runState,
    memoryUpdates: collectedMemoryUpdates,
    workflowRewrite: workflowRewritePayload,
  };
}
