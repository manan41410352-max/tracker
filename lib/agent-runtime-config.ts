import type {
  AgentRuntimeConfig,
  AgentTool,
  FormField,
  QuestionBlock,
  RunSetup,
  RunSetupField,
  RuntimeFlowConfig,
  RuntimeFlowNode,
} from "@/lib/runtime-types";
import { normalizeLocalModel } from "@/lib/ollama";

function toCallName(value: string, fallback: string) {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || fallback;
}

function normalizeToolName(tool: any, index: number) {
  const name =
    String(tool?.name || "").trim() ||
    String(tool?.id || "").trim() ||
    String(tool?.description || "").trim() ||
    `tool_${index + 1}`;

  return {
    displayName: name,
    callName: toCallName(name, `tool_${index + 1}`),
  };
}

function normalizeQuestionBlock(rawQuestion: any, index: number): QuestionBlock {
  const options = Array.isArray(rawQuestion?.options)
    ? rawQuestion.options
        .map((option: unknown) => String(option || "").trim())
        .filter(Boolean)
    : [];

  return {
    id: String(rawQuestion?.id || `question-${index + 1}`),
    name: String(rawQuestion?.name || `Question ${index + 1}`),
    question: String(
      rawQuestion?.question || "What requirement should the agent confirm before continuing?"
    ),
    responseType: rawQuestion?.responseType === "mcq" ? "mcq" : "short-answer",
    options,
    required: rawQuestion?.required ?? true,
    memoryKey: rawQuestion?.memoryKey ? String(rawQuestion.memoryKey) : undefined,
  };
}

function normalizeFormField(rawField: any, index: number): FormField {
  const options = Array.isArray(rawField?.options)
    ? rawField.options
        .map((option: unknown) => String(option || "").trim())
        .filter(Boolean)
    : [];

  const type = [
    "short-text",
    "long-text",
    "single-select",
    "multi-select",
    "number",
    "url",
  ].includes(String(rawField?.type))
    ? (rawField.type as FormField["type"])
    : "short-text";

  return {
    id: String(rawField?.id || `field-${index + 1}`),
    label: String(rawField?.label || `Field ${index + 1}`),
    type,
    required: rawField?.required ?? true,
    options,
    placeholder: rawField?.placeholder ? String(rawField.placeholder) : undefined,
    memoryKey: rawField?.memoryKey ? String(rawField.memoryKey) : undefined,
    reusable: Boolean(rawField?.reusable),
  };
}

function normalizeFlowNode(rawNode: any, index: number): RuntimeFlowNode {
  const rawType = String(rawNode?.type || "AgentNode");
  const type = [
    "StartNode",
    "AgentNode",
    "SignInAgentNode",
    "ResearcherAgentNode",
    "WriterAgentNode",
    "ViewerAgentNode",
    "ReviewerAgentNode",
    "ExecutorAgentNode",
    "ApiNode",
    "IfElseNode",
    "WhileNode",
    "UserApprovalNode",
    "QuestionNode",
    "FormNode",
    "CaptchaNode",
    "EndNode",
  ].includes(rawType)
    ? (rawType as RuntimeFlowNode["type"])
    : "AgentNode";

  const settings =
    rawNode?.settings && typeof rawNode.settings === "object"
      ? { ...rawNode.settings }
      : {};

  if (type === "FormNode") {
    settings.fields = Array.isArray(settings.fields)
      ? settings.fields.map(normalizeFormField)
      : [];
  }

  return {
    id: String(rawNode?.id || `node-${index + 1}`),
    type,
    label: String(rawNode?.label || settings?.name || `${type} ${index + 1}`),
    settings,
    next:
      rawNode?.next && typeof rawNode.next === "object" && !Array.isArray(rawNode.next)
        ? Object.fromEntries(
            Object.entries(rawNode.next).map(([key, value]) => [
              key,
              value ? String(value) : null,
            ])
          )
        : Array.isArray(rawNode?.next)
          ? rawNode.next.map((value: unknown) => String(value))
          : rawNode?.next
            ? String(rawNode.next)
            : null,
  };
}

function normalizeRunSetupField(rawField: any, index: number): RunSetupField {
  const normalizedField = normalizeFormField(rawField, index);

  return {
    ...normalizedField,
    sourceNodeId: rawField?.sourceNodeId ? String(rawField.sourceNodeId) : undefined,
    sourceNodeName: rawField?.sourceNodeName ? String(rawField.sourceNodeName) : undefined,
    sourceNodeType:
      rawField?.sourceNodeType === "QuestionNode" || rawField?.sourceNodeType === "FormNode"
        ? rawField.sourceNodeType
        : undefined,
    description: rawField?.description ? String(rawField.description) : undefined,
  };
}

function normalizeRunSetup(rawRunSetup: any): RunSetup | undefined {
  if (!rawRunSetup || !Array.isArray(rawRunSetup.fields)) {
    return undefined;
  }

  return {
    title: String(rawRunSetup.title || "Run setup"),
    description: rawRunSetup.description
      ? String(rawRunSetup.description)
      : "Collect the required details once before the workflow starts.",
    fields: rawRunSetup.fields.map(normalizeRunSetupField),
  };
}

const BROWSER_DISCOVERY_NODE_TYPES = new Set([
  "ViewerAgentNode",
  "ExecutorAgentNode",
  "SignInAgentNode",
]);

function buildWebsiteStartNodeSettings() {
  return {
    name: "Website Start",
    instruction:
      "Choose the best website or web app where this task should start, open it in preview, remember it for later steps, and describe the next browser goal.",
    includeHistory: true,
    model: "qwen3:14b-q4_K_M",
    output: "json",
    schema:
      '{ "recommendedUrl": "string", "siteName": "string", "reason": "string", "nextBrowserGoal": "string", "preferredBrowserProfile": "string" }',
    websiteDiscovery: true,
    autoOpenDiscoveredSite: true,
    rememberDiscoveredUrl: true,
    discoveredUrlMemoryKey: "preview_default_url",
    preferredBrowserProfile: "auto",
    browserProfileMemoryKey: "preview_browser_profile",
    reuseSignedInSession: true,
  };
}

function cloneFlowNext(next: unknown) {
  if (Array.isArray(next)) {
    return [...next];
  }

  if (next && typeof next === "object") {
    return { ...next };
  }

  return next ?? null;
}

function ensureUniqueFlowNodeId(baseId: string, flow: any[]) {
  const existingIds = new Set(flow.map((node) => String(node?.id || "")));
  let nextId = baseId;
  let counter = 2;

  while (existingIds.has(nextId)) {
    nextId = `${baseId}-${counter}`;
    counter += 1;
  }

  return nextId;
}

function ensureTaskFirstBrowserDiscovery(rawFlow: any) {
  if (!rawFlow || !Array.isArray(rawFlow.flow)) {
    return rawFlow;
  }

  const flow = rawFlow.flow.map((node: any) => ({
    ...node,
    settings:
      node?.settings && typeof node.settings === "object"
        ? { ...node.settings }
        : {},
  }));

  if (!flow.some((node: any) => BROWSER_DISCOVERY_NODE_TYPES.has(String(node?.type || "")))) {
    return {
      ...rawFlow,
      flow,
    };
  }

  const websiteStartDefaults = buildWebsiteStartNodeSettings();
  const existingWebsiteStart = flow.find(
    (node: any) =>
      node?.settings?.websiteDiscovery ||
      /website start|start site/i.test(
        String(node?.label || node?.settings?.name || "")
      )
  );

  if (existingWebsiteStart) {
    existingWebsiteStart.type = "AgentNode";
    existingWebsiteStart.label = "Website Start";
    existingWebsiteStart.settings = {
      ...websiteStartDefaults,
      ...(existingWebsiteStart.settings || {}),
      name: "Website Start",
      instruction:
        String(existingWebsiteStart.settings?.instruction || "").trim() ||
        websiteStartDefaults.instruction,
      output: "json",
      schema: websiteStartDefaults.schema,
      websiteDiscovery: true,
      autoOpenDiscoveredSite: true,
      rememberDiscoveredUrl: true,
      discoveredUrlMemoryKey: "preview_default_url",
      preferredBrowserProfile:
        existingWebsiteStart.settings?.preferredBrowserProfile || "auto",
      browserProfileMemoryKey: "preview_browser_profile",
      reuseSignedInSession:
        existingWebsiteStart.settings?.reuseSignedInSession ?? true,
    };

    return {
      ...rawFlow,
      flow,
    };
  }

  const websiteStartId = ensureUniqueFlowNodeId("website-start", flow);
  const originalStartNodeId =
    String(rawFlow.startNode || "").trim() || String(flow[0]?.id || "").trim();
  const startNode = flow.find(
    (node: any) => String(node?.id || "") === originalStartNodeId
  );
  const websiteStartNode = {
    id: websiteStartId,
    type: "AgentNode",
    label: "Website Start",
    settings: websiteStartDefaults,
    next:
      startNode?.type === "StartNode"
        ? cloneFlowNext(startNode.next)
        : originalStartNodeId || null,
  };

  if (startNode?.type === "StartNode") {
    startNode.next = websiteStartId;
    return {
      ...rawFlow,
      flow: [websiteStartNode, ...flow],
    };
  }

  return {
    ...rawFlow,
    startNode: websiteStartId,
    flow: [websiteStartNode, ...flow],
  };
}

function ensureFallbackAgents(agents: AgentRuntimeConfig["agents"]) {
  const existingAgents = Array.isArray(agents) ? [...agents] : [];
  const hasFallbackAgent = existingAgents.some(
    (agent) =>
      /fallback|recovery|resolver/i.test(agent?.name || "") ||
      /fallback|recover|manual takeover/i.test(
        `${agent?.instruction || ""} ${agent?.instructions || ""}`
      )
  );

  const hasSignInAgent = existingAgents.some(
    (agent) =>
      /sign.?in|login|auth/i.test(agent?.name || "") ||
      /sign.?in|login|authenticate/i.test(
        `${agent?.instruction || ""} ${agent?.instructions || ""}`
      )
  );

  const injected: AgentRuntimeConfig["agents"] = [...existingAgents];

  if (!hasSignInAgent) {
    injected.push({
      id: "sign-in-agent",
      name: "Sign-In Agent",
      instruction:
        "You handle browser authentication on behalf of the user. When the workflow reaches a login or sign-in page, open the site in the 'user' browser profile (which has the user's saved sessions and cookies). Check if the user is already signed in by reading the page. If already signed in, return success. If not, attempt to sign in using any visible SSO or saved-credential flow. Never store passwords. After completing the login, return the authenticated browser state so the workflow can continue.",
      model: "qwen3:14b-q4_K_M",
      includeHistory: false,
      tools: ["browser_visit", "browser_task"],
    });
  }

  if (!hasFallbackAgent) {
    injected.push({
      id: "fallback-recovery-agent",
      name: "Fallback Recovery Agent",
      instruction:
        "Recover browser, API, or tool failures. Repair or re-plan the next command for qwen3:14b-q4_K_M, retry with the best available step, patch workflow state when safe, and when recovery succeeds let the ChatGPT proxy evolve the workflow permanently by rewriting the node instruction or inserting a helper recovery guard node. Only use chatgpt_api or manual browser takeover after automatic local recovery is exhausted.",
      model: "qwen3.5:35b-a3b",
      includeHistory: true,
      tools: ["browser_visit", "browser_task", "chatgpt_api"],
    });
  }

  return injected;
}


function normalizeFlowConfig(rawFlow: any): RuntimeFlowConfig | undefined {
  if (!rawFlow || !Array.isArray(rawFlow.flow)) {
    return undefined;
  }

  const upgradedFlow = ensureTaskFirstBrowserDiscovery(rawFlow);

  return {
    startNode: String(upgradedFlow.startNode || "start"),
    flow: upgradedFlow.flow.map(normalizeFlowNode),
  };
}

export function normalizeAgentToolConfig(rawConfig: any): AgentRuntimeConfig {
  if (!rawConfig) {
    return {
      version: 6,
      systemPrompt: "",
      primaryAgentName: "",
      questionBlocks: [],
      runSetup: {
        title: "Run setup",
        description: "Collect the required details once before the workflow starts.",
        fields: [],
      },
      agents: ensureFallbackAgents([]),
      tools: [],
      flow: undefined,
      memory: {
        reusableByDefault: false,
      },
      executionPolicy: {
        webSearchMode: "always_on",
        builderResearchDepth: "aggressive",
        autoRewriteRecoveredBrowserFailures: true,
        browserFailureMemoryKey: "browser_failure_playbook",
      },
    };
  }

  if (rawConfig.parsedJson) {
    return normalizeAgentToolConfig(rawConfig.parsedJson);
  }

  const tools = Array.isArray(rawConfig.tools)
    ? rawConfig.tools
        .map((tool: any, index: number) => {
          const { displayName, callName } = normalizeToolName(tool, index);

          return {
            id: tool?.id ? String(tool.id) : undefined,
            name: displayName,
            callName,
            description: tool?.description ? String(tool.description) : undefined,
            method:
              String(tool?.method || "GET").toUpperCase() === "POST" ? "POST" : "GET",
            url: tool?.url ? String(tool.url).trim() : "",
            includeApiKey: Boolean(tool?.includeApiKey),
            apiKey: tool?.apiKey ? String(tool.apiKey) : "",
            parameters:
              tool?.parameters && typeof tool.parameters === "object"
                ? Object.fromEntries(
                    Object.entries(tool.parameters).map(([key, value]) => [
                      key,
                      typeof value === "string" ? value : "string",
                    ])
                  )
                : {},
            assignedAgent: tool?.assignedAgent ? String(tool.assignedAgent) : undefined,
          } satisfies AgentTool;
        })
        .filter((tool: AgentTool) => Boolean(tool.url))
    : [];

  const questionBlocks = Array.isArray(rawConfig.questionBlocks)
    ? rawConfig.questionBlocks.map(normalizeQuestionBlock)
    : [];
  const runSetup =
    normalizeRunSetup(rawConfig.runSetup) ??
    (questionBlocks.length
      ? {
          title: "Run setup",
          description:
            "Collect the required details once before the workflow starts.",
          fields: questionBlocks.map((question: QuestionBlock, index: number) => ({
            id: question.id || `run-setup-${index + 1}`,
            label: question.name,
            type:
              question.responseType === "mcq" ? "single-select" : "short-text",
            required: question.required,
            options: question.options,
            placeholder:
              question.responseType === "mcq"
                ? "Choose an option"
                : "Enter the required detail",
            memoryKey: question.memoryKey,
            reusable: true,
            sourceNodeId: question.id,
            sourceNodeName: question.name,
            sourceNodeType: "QuestionNode" as const,
            description: question.question,
          })),
        }
      : undefined);

  const agents = Array.isArray(rawConfig.agents)
    ? rawConfig.agents.map((agent: any, index: number) => ({
        id: agent?.id ? String(agent.id) : `agent-${index + 1}`,
        name: agent?.name ? String(agent.name) : `Agent ${index + 1}`,
        instruction: agent?.instruction ? String(agent.instruction) : "",
        instructions: agent?.instructions ? String(agent.instructions) : "",
        model: normalizeLocalModel(agent?.model),
        includeHistory: agent?.includeHistory ?? true,
        tools: Array.isArray(agent?.tools)
          ? agent.tools.map((toolName: unknown) => String(toolName))
          : [],
      }))
    : [];

  return {
    version: Number(rawConfig.version || 1),
    systemPrompt: rawConfig.systemPrompt ?? "",
    primaryAgentName: rawConfig.primaryAgentName ?? "",
    questionBlocks,
    runSetup,
    agents: ensureFallbackAgents(agents),
    tools,
    flow: normalizeFlowConfig(rawConfig.flow),
    memory:
      rawConfig.memory && typeof rawConfig.memory === "object"
        ? {
            reusableByDefault: Boolean(rawConfig.memory.reusableByDefault),
          }
        : {
            reusableByDefault: false,
          },
    executionPolicy:
      rawConfig.executionPolicy && typeof rawConfig.executionPolicy === "object"
        ? {
            webSearchMode:
              rawConfig.executionPolicy.webSearchMode === "standard"
                ? "standard"
                : "always_on",
            builderResearchDepth:
              rawConfig.executionPolicy.builderResearchDepth === "standard"
                ? "standard"
                : "aggressive",
            autoRewriteRecoveredBrowserFailures:
              rawConfig.executionPolicy.autoRewriteRecoveredBrowserFailures !== undefined
                ? Boolean(rawConfig.executionPolicy.autoRewriteRecoveredBrowserFailures)
                : true,
            browserFailureMemoryKey:
              rawConfig.executionPolicy.browserFailureMemoryKey
                ? String(rawConfig.executionPolicy.browserFailureMemoryKey)
                : "browser_failure_playbook",
          }
        : {
            webSearchMode: "always_on",
            builderResearchDepth: "aggressive",
            autoRewriteRecoveredBrowserFailures: true,
            browserFailureMemoryKey: "browser_failure_playbook",
          },
  };
}

export function needsAgentRuntimeRefresh(rawConfig: any) {
  if (!rawConfig) {
    return true;
  }

  if (rawConfig.parsedJson) {
    return true;
  }

  if (Number(rawConfig.version || 1) < 6) {
    return true;
  }

  if (!rawConfig.flow || !Array.isArray(rawConfig.flow.flow)) {
    return true;
  }

  return !rawConfig.runSetup || !Array.isArray(rawConfig.runSetup.fields);
}
