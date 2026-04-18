import "server-only";

import {
  resolveBrowserSite,
  resolvePreferredBrowserProfile,
  runBrowserTask,
  visitWebsite,
} from "@/lib/browser-runtime";
// import { sendPromptViaChatGptBrowser } from "@/lib/chatgpt-browser-fallback";
import {
  getOllamaFallbackModel,
  normalizeLocalModel,
  ollamaChat,
  ollamaGenerateJson,
  type OllamaMessage,
} from "@/lib/ollama";
import type { AgentRuntimeConfig, AgentTool, RuntimeFlowNode, WorkflowTraceItem } from "@/lib/runtime-types";
import { fetchWebpage, researchInternet, searchInternet } from "@/lib/web-tools";
import {
  appendQueryParams,
  applyTemplate,
  buildToolSchema,
  compareValues,
  ensureObject,
  extractTextToolCalls,
  fillUrlPlaceholders,
  parsePrimitive,
  parseToolArguments,
  tryParseJson,
} from "@/lib/server/runtime-utils";
import { sendPromptViaOpenAI, isOpenAIConfigured } from "@/lib/server/openai-client";

const PREVIEW_DEFAULT_URL_MEMORY_KEY = "preview_default_url";
const PREVIEW_BROWSER_PROFILE_MEMORY_KEY = "preview_browser_profile";
const NODE_ERROR_MEMORY_KEY = "node_error_playbook";

// Role descriptions for each specialized node type
const AGENT_ROLE_PROMPTS: Record<string, string> = {
  researcher:
    "You are a Researcher agent. Your only job is to find, compile, and return evidence using search and fetch tools. Stay on public informational sources. Do NOT use browser_visit or browser_task.",
  writer:
    "You are a Writer agent. Your only job is to produce well-crafted content from the workflow state. Do NOT search the web — work only from what is already in the state. Use ask_agent to consult a Researcher if you need more facts.",
  viewer:
    "You are a Viewer agent. Your only job is to open the target browser page and extract requested information. Use browser_visit for direct pages and browser_task for multi-step navigation. Return structured extracted data.",
  reviewer:
    "You are a Reviewer agent. Your only job is to critically evaluate the output of the previous step. Check for accuracy, completeness, and alignment with the original goal. Use ask_agent to request a Researcher or Writer sub-step if something needs to be re-done.",
  executor:
    "You are an Executor agent. Your only job is to carry out the planned actions: navigate the browser, fill forms, click elements, and return the result. Follow the execution plan from the workflow state precisely. If a CAPTCHA, human verification, or bot-check appears, stop and hand the browser back to the user instead of trying to bypass it.",
};

export type PersistedRun = {
  conversationId: string;
  status?: string;
  currentNodeId?: string | null;
  pendingAction?: any;
  state?: Record<string, any>;
  nodeHistory?: WorkflowTraceItem[];
  messages?: Array<{ role: string; content: string }>;
  browserSession?: any;
};

export const BUILT_IN_TOOLS: AgentTool[] = [
  {
    name: "Internet search",
    callName: "internet_search",
    description:
      "Search the public web for current information, sources, and research leads.",
    method: "GET",
    parameters: {
      query: "string",
      maxResults: "optional",
    },
  },
  {
    name: "Fetch webpage",
    callName: "fetch_webpage",
    description:
      "Open a webpage URL and extract readable text so you can cite or summarize it.",
    method: "GET",
    parameters: {
      url: "string",
    },
  },
  {
    name: "Web research",
    callName: "web_research",
    description:
      "Search the public web, fetch the strongest results, and return evidence-rich summaries the local model can use immediately.",
    method: "GET",
    parameters: {
      query: "string",
      maxResults: "optional",
    },
  },
  {
    name: "Browser visit",
    callName: "browser_visit",
    description:
      "Use the attached browser workspace to open a public site. You can pass a URL directly, or pass only a goal and the runtime will research the best site automatically. The actions array supports click, fill/type, press, wait, and scroll steps.",
    method: "GET",
    parameters: {
      url: "optional",
      goal: "optional",
      actions: "optional",
      profile: "optional",
    },
  },
  {
    name: "Browser task",
    callName: "browser_task",
    description:
      "Execute a multi-step browser procedure toward an end result. Use this for goals like opening Gmail, navigating to the right page, and reading or extracting the final answer.",
    method: "GET",
    parameters: {
      goal: "string",
      startUrl: "optional",
      websiteHint: "optional",
      successCriteria: "optional",
      profile: "optional",
      maxSteps: "optional",
      reuseSignedInSession: "optional",
    },
  },
  {
    name: "Ask agent",
    callName: "ask_agent",
    description:
      "Delegate a sub-question or sub-task to another specialized agent (researcher, writer, viewer, reviewer, executor, or any named agent in this workflow). Returns the agent's answer that you can use to continue this step.",
    method: "GET",
    parameters: {
      agentRole: "string",
      question: "string",
      context: "optional",
    },
  },
  {
    name: "ChatGPT API",
    callName: "chatgpt_api",
    description:
      "Send a prompt to the OpenAI GPT-4 API. Use this as a hosted fallback after local model recovery is exhausted, or for complex reasoning.",
    method: "GET",
    parameters: {
      prompt: "string",
    },
  },
];

function normalizeToolFilterName(value: string) {
  return value.trim().toLowerCase();
}

function getNodeName(node: RuntimeFlowNode) {
  return String(node.settings?.name || node.label || node.type);
}

/**
 * Returns tools for a node, respecting any `allowedTools` restriction set on specialized nodes.
 */
function getToolsForNode(node: RuntimeFlowNode, config: AgentRuntimeConfig) {
  const nodeName = normalizeToolFilterName(getNodeName(node));
  const allowedTools = Array.isArray(node.settings?.allowedTools)
    ? (node.settings.allowedTools as string[])
    : null;

  const scopedTools = (config.tools ?? []).filter((tool) => {
    if (!tool.assignedAgent?.trim()) {
      return true;
    }
    return normalizeToolFilterName(tool.assignedAgent) === nodeName;
  });

  const allTools = [...BUILT_IN_TOOLS, ...scopedTools];

  // For specialized nodes with an allowedTools list, filter to only those + always allow ask_agent
  if (allowedTools) {
    const allowed = new Set([...allowedTools, "ask_agent"]);
    return allTools.filter((tool) => allowed.has(tool.callName));
  }

  return allTools;
}

function normalizePublicUrl(value: unknown) {
  const candidate = String(value || "").trim();
  if (!candidate) {
    return "";
  }

  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "";
    }

    return parsed.toString();
  } catch {
    return "";
  }
}

function normalizeAttachmentInputs(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function buildWebsiteDiscoveryQuery({
  settings,
  state,
}: {
  settings: Record<string, any>;
  state: Record<string, any>;
}) {
  const templatedQuery = String(
    applyTemplate(String(settings.discoveryQuery || ""), state) || ""
  ).trim();

  if (templatedQuery) {
    return templatedQuery;
  }

  const task = String(state.task || "").trim();
  const instruction = String(settings.instruction || "").trim();
  const fragments = [task, instruction].filter(Boolean);

  return fragments.join("\n");
}

function inferBrowserProfileForTask({
  requestedProfile,
  rememberedProfile,
  goal,
  url,
  siteName,
  reuseSignedInSession = true,
}: {
  requestedProfile?: string;
  rememberedProfile?: string;
  goal?: string;
  url?: string;
  siteName?: string;
  reuseSignedInSession?: boolean;
}) {
  return resolvePreferredBrowserProfile({
    requestedProfile,
    rememberedProfile,
    goal,
    url,
    siteName,
    reuseSignedInSession,
  });
}

export async function executeBuiltInTool(
  callName: string,
  rawArgs: unknown,
  browserSession?: any,
  conversationId?: string,
  state?: Record<string, any>,
  preferredModel?: string
) {
  const args = parseToolArguments(rawArgs);

  if (callName === "internet_search") {
    if (!String(args.query || "").trim()) {
      return {
        result: {
          ok: false,
          status: 400,
          error: "Add a search query before calling internet_search.",
        },
      };
    }

    return {
      result: await searchInternet(String(args.query || ""), Number(args.maxResults || 5)),
    };
  }

  if (callName === "fetch_webpage") {
    if (!String(args.url || "").trim()) {
      return {
        result: {
          ok: false,
          status: 400,
          error: "Add a URL before calling fetch_webpage.",
        },
      };
    }

    return {
      result: await fetchWebpage(String(args.url || "")),
    };
  }

  if (callName === "web_research") {
    if (!String(args.query || "").trim()) {
      return {
        result: {
          ok: false,
          status: 400,
          error: "Add a research query before calling web_research.",
        },
      };
    }

    return {
      result: await researchInternet(String(args.query || ""), Number(args.maxResults || 5)),
    };
  }

  if (callName === "browser_visit") {
    const mutableState = ensureObject(state);
    const reusableMemory = ensureObject(mutableState.reusableMemory);
    const rememberedUrl = String(
      reusableMemory[PREVIEW_DEFAULT_URL_MEMORY_KEY] || ""
    ).trim();
    const rememberedProfile = String(
      reusableMemory[PREVIEW_BROWSER_PROFILE_MEMORY_KEY] || ""
    ).trim();
    const goal = String(args.goal || mutableState.task || "").trim();
    const resolvedTarget = await resolveBrowserSite({
      url: args.url ? String(args.url) : undefined,
      browserSession,
      rememberedUrl,
      goal,
      preferredModel,
      nodeName: "browser_visit",
    });
    const resolvedUrl = String(resolvedTarget.resolvedUrl || "").trim();
    const memoryUpdates: Array<{
      memoryKey: string;
      value: any;
      source?: string;
    }> = [];

    const selectedVisitProfile = inferBrowserProfileForTask({
      requestedProfile: args.profile ? String(args.profile) : undefined,
      rememberedProfile,
      goal,
      url: resolvedUrl,
      siteName: resolvedTarget.discoveredSite?.siteName,
      reuseSignedInSession: true,
    });

    if (selectedVisitProfile) {
      reusableMemory[PREVIEW_BROWSER_PROFILE_MEMORY_KEY] = selectedVisitProfile;
      mutableState.reusableMemory = reusableMemory;
      memoryUpdates.push({
        memoryKey: PREVIEW_BROWSER_PROFILE_MEMORY_KEY,
        value: selectedVisitProfile,
        source: "browser_visit.profile",
      });
    }

    if (
      resolvedUrl &&
      (resolvedTarget.resolvedSiteSource === "override" ||
        resolvedTarget.resolvedSiteSource === "discovery")
    ) {
      reusableMemory[PREVIEW_DEFAULT_URL_MEMORY_KEY] = resolvedUrl;
      mutableState.reusableMemory = reusableMemory;
      memoryUpdates.push({
        memoryKey: PREVIEW_DEFAULT_URL_MEMORY_KEY,
        value: resolvedUrl,
        source: `browser_visit.${resolvedTarget.resolvedSiteSource}`,
      });
    }

    const result = await visitWebsite({
      url: resolvedUrl || (args.url ? String(args.url) : undefined),
      goal,
      browserSession,
      conversationId,
      actions: args.actions,
      profile: selectedVisitProfile || undefined,
      workspaceKey: browserSession?.workspaceKey || conversationId || undefined,
      rememberedUrl: String(reusableMemory[PREVIEW_DEFAULT_URL_MEMORY_KEY] || "").trim(),
      preferredModel,
      resolvedSite: resolvedTarget,
    });

    return {
      result,
      browserSession:
        "browserSession" in result ? result.browserSession || browserSession : browserSession,
      memoryUpdates,
    };
  }

  if (callName === "browser_task") {
    const mutableState = ensureObject(state);
    const reusableMemory = ensureObject(mutableState.reusableMemory);
    const rememberedUrl = String(
      reusableMemory[PREVIEW_DEFAULT_URL_MEMORY_KEY] || ""
    ).trim();
    const rememberedProfile = String(
      reusableMemory[PREVIEW_BROWSER_PROFILE_MEMORY_KEY] || ""
    ).trim();
    const explicitUrl = normalizePublicUrl(args.startUrl || args.url);
    const currentBrowserUrl = normalizePublicUrl(browserSession?.lastUrl);
    const goal = String(args.goal || mutableState.task || "").trim();
    const websiteHint = String(args.websiteHint || "").trim();
    const reuseSignedInSession =
      args.reuseSignedInSession === undefined
        ? true
        : !["0", "false", "off", "no"].includes(
            String(args.reuseSignedInSession).trim().toLowerCase()
          );
    const memoryUpdates: Array<{
      memoryKey: string;
      value: any;
      source?: string;
    }> = [];

    if (!goal) {
      return {
        result: {
          ok: false,
          status: 400,
          error: "Add a goal before calling browser_task.",
        },
        browserSession,
      };
    }

    const resolvedTarget = await resolveBrowserSite({
      url: explicitUrl,
      browserSession,
      rememberedUrl,
      goal: websiteHint || goal,
      preferredModel,
      nodeName: "browser_task",
    });
    const resolvedUrl = String(
      resolvedTarget.resolvedUrl || currentBrowserUrl || ""
    ).trim();

    const preferredProfile = inferBrowserProfileForTask({
      requestedProfile: args.profile ? String(args.profile) : undefined,
      rememberedProfile,
      goal,
      url: resolvedUrl,
      siteName: websiteHint || resolvedTarget.discoveredSite?.siteName,
      reuseSignedInSession,
    });

    if (preferredProfile) {
      reusableMemory[PREVIEW_BROWSER_PROFILE_MEMORY_KEY] = preferredProfile;
      mutableState.reusableMemory = reusableMemory;
      memoryUpdates.push({
        memoryKey: PREVIEW_BROWSER_PROFILE_MEMORY_KEY,
        value: preferredProfile,
        source: "browser_task.profile",
      });
    }

    if (
      resolvedUrl &&
      (resolvedTarget.resolvedSiteSource === "override" ||
        resolvedTarget.resolvedSiteSource === "discovery")
    ) {
      reusableMemory[PREVIEW_DEFAULT_URL_MEMORY_KEY] = resolvedUrl;
      mutableState.reusableMemory = reusableMemory;
      memoryUpdates.push({
        memoryKey: PREVIEW_DEFAULT_URL_MEMORY_KEY,
        value: resolvedUrl,
        source: `browser_task.${resolvedTarget.resolvedSiteSource}`,
      });
    }

    const result = await runBrowserTask({
      goal,
      startUrl: resolvedUrl || undefined,
      websiteHint: websiteHint || resolvedTarget.discoveredSite?.siteName,
      successCriteria: String(args.successCriteria || "").trim() || undefined,
      profile: preferredProfile || undefined,
      maxSteps: Number(args.maxSteps || 0) || undefined,
      reuseSignedInSession,
      browserSession,
      conversationId: String(conversationId || ""),
      workspaceKey: browserSession?.workspaceKey || conversationId || undefined,
      rememberedUrl,
      preferredModel,
      resolvedSite: resolvedTarget,
    });

    return {
      result,
      browserSession:
        "browserSession" in result ? result.browserSession || browserSession : browserSession,
      memoryUpdates,
    };
  }

  if (callName === "ask_agent") {
    const agentRole = String(args.agentRole || "").trim().toLowerCase();
    const question = String(args.question || "").trim();
    const extraContext = String(args.context || "").trim();

    if (!agentRole || !question) {
      return {
        result: {
          ok: false,
          error: "ask_agent requires agentRole and question.",
        },
      };
    }

    const rolePrompt =
      AGENT_ROLE_PROMPTS[agentRole] ||
      `You are a specialized ${agentRole} agent. Answer the question using the best available tools and information.`;

    const subMessages: OllamaMessage[] = [
      {
        role: "system",
        content: `${rolePrompt}\n\nWorkflow context:\n${JSON.stringify(ensureObject(state), null, 2)}`,
      },
      {
        role: "user",
        content: extraContext
          ? `${question}\n\nAdditional context:\n${extraContext}`
          : question,
      },
    ];

    const subTools = BUILT_IN_TOOLS.filter((tool) => {
      const roleTools: Record<string, string[]> = {
        researcher: ["internet_search", "web_research", "fetch_webpage"],
        writer: [],
        viewer: ["browser_visit", "browser_task"],
        reviewer: [],
        executor: ["browser_visit", "browser_task", "internet_search"],
      };
      const allowed = roleTools[agentRole];
      return allowed ? allowed.includes(tool.callName) : true;
    });

    const subToolSchemas = subTools.map((tool) => ({
      type: "function",
      function: {
        name: tool.callName,
        description: tool.description || tool.name,
        parameters: buildToolSchema(tool.parameters),
      },
    }));

    let subFinalText = "";
    let subBrowserSession = browserSession;
    const SUB_AGENT_TIMEOUT = 30_000;
    const subStart = Date.now();

    for (let step = 0; step < 4; step += 1) {
      if (Date.now() - subStart > SUB_AGENT_TIMEOUT) break;

      let subResponse: any;
      try {
        subResponse = await ollamaChat({
          messages: subMessages,
          tools: subToolSchemas.length ? subToolSchemas : undefined,
          model: preferredModel,
        });
      } catch {
        break;
      }

      subMessages.push(subResponse);

      if (!subResponse.tool_calls?.length) {
        subFinalText = subResponse.content?.trim() || "";
        break;
      }

      for (const tc of subResponse.tool_calls) {
        const fn = tc.function ?? tc;
        const tcResult = BUILT_IN_TOOLS.some((t) => t.callName === fn.name)
          ? await executeBuiltInTool(fn.name, fn.arguments, subBrowserSession, conversationId, state, preferredModel)
          : { result: { ok: false, error: `Tool ${fn.name} not available in sub-agent.` } };

        subBrowserSession = (tcResult as any).browserSession ?? subBrowserSession;
        subMessages.push({ role: "tool", name: fn.name, content: JSON.stringify(tcResult.result) });
      }
    }

    return {
      result: {
        ok: true,
        agentRole,
        question,
        answer: subFinalText || "The sub-agent did not produce an answer.",
      },
      browserSession: subBrowserSession,
    };
  }

  if (callName === "chatgpt_api") {
    const prompt = String(args.prompt || args.goal || "").trim();
    const result = await sendPromptViaOpenAI({
      prompt,
    });

    return {
      result,
      browserSession,
    };
  }

  return {
    result: {
      ok: false,
      status: 400,
      error: `Built-in tool "${callName}" is not available.`,
    },
  };
}

export async function executeExternalTool(
  toolConfig: AgentTool,
  rawArgs: unknown,
  state: Record<string, any>
) {
  const args = applyTemplate(parseToolArguments(rawArgs), state) as Record<string, unknown>;
  const originalUrl = toolConfig.url || "";

  if (!toolConfig.url) {
    return {
      ok: false,
      status: 400,
      error: `Tool "${toolConfig.name}" does not have a URL configured.`,
    };
  }

  let resolvedUrl = fillUrlPlaceholders(originalUrl, args);
  const method = (toolConfig.method || "GET").toUpperCase();
  const wildcardPlaceholderUsed =
    /\{[^}]+\}/.test(originalUrl) && Object.keys(args).length === 1;
  const remainingArgs = wildcardPlaceholderUsed
    ? {}
    : Object.fromEntries(
        Object.entries(args).filter(
          ([key]) =>
            !originalUrl.includes(`{{${key}}}`) && !originalUrl.includes(`{${key}}`)
        )
      );

  if (toolConfig.includeApiKey && toolConfig.apiKey) {
    remainingArgs.key = toolConfig.apiKey;
  }

  const init: RequestInit = {
    method,
    headers: {},
  };

  if (method === "GET") {
    resolvedUrl = appendQueryParams(resolvedUrl, remainingArgs);
  } else {
    init.headers = {
      "Content-Type": "application/json",
    };
    init.body = JSON.stringify(remainingArgs);
  }

  try {
    const response = await fetch(resolvedUrl, init);
    const responseText = await response.text();
    let payload: unknown = responseText;

    try {
      payload = JSON.parse(responseText);
    } catch {
      payload = responseText;
    }

    return {
      ok: response.ok,
      status: response.status,
      data: payload,
      url: resolvedUrl,
    };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : "Tool execution failed.",
      url: resolvedUrl,
    };
  }
}

function summarizeStateForPrompt(
  state: Record<string, any>,
  includeHistory: boolean
) {
  const baseState = {
    task: state.task,
    reusableMemory: state.reusableMemory || {},
    memoryTimeline: Array.isArray(state.memoryTimeline)
      ? state.memoryTimeline.slice(0, 24)
      : [],
    formResponses: state.formResponses || {},
    approvals: state.approvals || {},
    latestOutput: state.latestOutput || null,
  };

  if (includeHistory) {
    return JSON.stringify(
      {
        ...baseState,
        nodeOutputs: state.nodeOutputs || {},
        apiOutputs: state.apiOutputs || {},
        trace: state.trace || [],
      },
      null,
      2
    );
  }

  return JSON.stringify(baseState, null, 2);
}

export async function ensureJsonOutput(
  content: string,
  schema: string,
  preferredModel?: string
) {
  // Fast path: already valid JSON — no Qwen round-trip needed
  const directParse = tryParseJson(content);
  if (directParse !== null) {
    return JSON.stringify(directParse, null, 2);
  }

  // Slow path: ask Qwen to repair/reformat the text into JSON
  console.log(`[ensureJsonOutput] direct parse failed, invoking Qwen repair. content head: ${content.slice(0, 120)}`);
  try {
    const normalized = await ollamaGenerateJson(
      `Convert the following workflow output into strict JSON that matches this schema exactly. Return ONLY the JSON — no prose, no markdown fences, no code blocks.

Schema:
${schema}

Output to convert:
${content.slice(0, 6000)}`,
      preferredModel
    );

    const parsed = tryParseJson(normalized);
    if (parsed !== null) {
      return JSON.stringify(parsed, null, 2);
    }
  } catch (err) {
    console.error(`[ensureJsonOutput] Qwen repair threw:`, err);
  }

  // Final fallback: return a stub so the workflow node gets *something* into nodeOutputs
  return JSON.stringify({ response: content.slice(0, 500) }, null, 2);
}

type NodeManualBrowser = {
  url?: string;
  title?: string;
  reason: string;
  suggestedAction?: string;
};

type NodeRecoveryPlan = {
  resolved: boolean;
  reason: string;
  recoveryCommand: string;
  finalText: string;
  toolCall?: {
    name: string;
    arguments: Record<string, unknown>;
  };
  shouldEscalateToChatGpt: boolean;
};

function buildNodeRecoveryPrompt({
  node,
  settings,
  state,
  messages,
  tools,
  failureReason,
}: {
  node: RuntimeFlowNode;
  settings: Record<string, any>;
  state: Record<string, any>;
  messages: OllamaMessage[];
  tools: AgentTool[];
  failureReason: string;
}) {
  return `You are the fallback recovery agent for a local workflow node.
The primary model is qwen3:14b-q4_K_M.
Your job is to diagnose the failure, choose one recovery command if possible, and hand the step back to the primary model.
Return only valid JSON in this exact shape:
{
  "resolved": false,
  "reason": "",
  "recoveryCommand": "",
  "finalText": "",
  "toolCall": {
    "name": "",
    "arguments": {}
  },
  "shouldEscalateToChatGpt": false
}

Rules:
- Prefer giving one concrete recovery command that qwen3:14b-q4_K_M can use immediately.
- Use toolCall only when one tool action is the clearest fix.
- Leave toolCall empty when a direct finalText or short recoveryCommand is enough.
- Set shouldEscalateToChatGpt to true only when local recovery is exhausted and the hosted Brave/ChatGPT fallback is the better last resort.
- If the node requires JSON output, finalText should already match the schema.

Node:
${getNodeName(node)}

Node instruction:
${String(settings.instruction || "Use the available context to complete this step.")}

Failure reason:
${failureReason}

Required output format:
${settings.output === "json" && settings.schema ? settings.schema : "plain text"}

Workflow state:
${summarizeStateForPrompt(state, settings.includeHistory ?? true)}

Available tools:
${JSON.stringify(
    tools.map((tool) => ({
      name: tool.callName,
      description: tool.description || tool.name,
      parameters: tool.parameters || {},
    })),
    null,
    2
  )}

Recent conversation:
${JSON.stringify(messages.slice(-10), null, 2)}`;
}

async function requestNodeRecoveryPlan({
  node,
  settings,
  state,
  messages,
  tools,
  toolRegistry,
  failureReason,
}: {
  node: RuntimeFlowNode;
  settings: Record<string, any>;
  state: Record<string, any>;
  messages: OllamaMessage[];
  tools: AgentTool[];
  toolRegistry: Map<string, AgentTool>;
  failureReason: string;
}): Promise<NodeRecoveryPlan | null> {
  try {
    const response = await ollamaGenerateJson(
      buildNodeRecoveryPrompt({
        node,
        settings,
        state,
        messages,
        tools,
        failureReason,
      }),
      getOllamaFallbackModel()
    );
    const parsed = tryParseJson(response);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const rawToolCall =
      parsed.toolCall && typeof parsed.toolCall === "object" ? parsed.toolCall : null;
    const toolName = rawToolCall?.name ? String(rawToolCall.name).trim() : "";
    const normalizedToolName = toolRegistry.has(toolName) ? toolName : "";

    return {
      resolved: Boolean(parsed.resolved),
      reason: String(parsed.reason || failureReason || "Fallback recovery reviewed the step."),
      recoveryCommand: String(parsed.recoveryCommand || "").trim(),
      finalText: String(parsed.finalText || "").trim(),
      toolCall: normalizedToolName
        ? {
            name: normalizedToolName,
            arguments:
              rawToolCall?.arguments &&
              typeof rawToolCall.arguments === "object" &&
              !Array.isArray(rawToolCall.arguments)
                ? (rawToolCall.arguments as Record<string, unknown>)
                : {},
          }
        : undefined,
      shouldEscalateToChatGpt: Boolean(parsed.shouldEscalateToChatGpt),
    };
  } catch {
    return null;
  }
}

function buildChatGptBrowserFallbackPrompt({
  node,
  settings,
  state,
  failureReason,
  messages,
}: {
  node: RuntimeFlowNode;
  settings: Record<string, any>;
  state: Record<string, any>;
  failureReason: string;
  messages: OllamaMessage[];
}) {
  return [
    `You are the hosted last-resort fallback for the workflow node "${getNodeName(node)}".`,
    `Failure reason: ${failureReason}`,
    `Node instruction:\n${String(settings.instruction || "Use the available context to complete this step.")}`,
    settings.output === "json" && settings.schema
      ? `Return only valid JSON matching this schema exactly:\n${settings.schema}`
      : "Return the completed node output directly with no extra framing.",
    `Workflow state:\n${summarizeStateForPrompt(state, settings.includeHistory ?? true)}`,
    `Recent conversation:\n${JSON.stringify(messages.slice(-8), null, 2)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function runHostedNodeFallback({
  node,
  settings,
  state,
  failureReason,
  messages,
}: {
  node: RuntimeFlowNode;
  settings: Record<string, any>;
  state: Record<string, any>;
  failureReason: string;
  messages: OllamaMessage[];
}): Promise<{
  finalText?: string;
  manualBrowser?: NodeManualBrowser;
}> {
  const hostedResult = await sendPromptViaOpenAI({
    prompt: buildChatGptBrowserFallbackPrompt({
      node,
      settings,
      state,
      failureReason,
      messages,
    }),
  });

  if (hostedResult.ok && hostedResult.content?.trim()) {
    return {
      finalText: hostedResult.content.trim(),
    };
  }

  return {};
}

async function attemptNodeRecovery({
  node,
  settings,
  state,
  messages,
  preferredModel,
  tools,
  toolRegistry,
  browserSession,
  conversationId,
  failureReason,
}: {
  node: RuntimeFlowNode;
  settings: Record<string, any>;
  state: Record<string, any>;
  messages: OllamaMessage[];
  preferredModel?: string;
  tools: AgentTool[];
  toolRegistry: Map<string, AgentTool>;
  browserSession?: any;
  conversationId?: string;
  failureReason: string;
}): Promise<{
  finalText?: string;
  browserSession?: any;
  memoryUpdates: Array<{
    memoryKey: string;
    value: any;
    source?: string;
  }>;
  manualBrowser?: NodeManualBrowser;
}> {
  let nextBrowserSession = browserSession;
  const memoryUpdates: Array<{
    memoryKey: string;
    value: any;
    source?: string;
  }> = [];
  const recoveryPlan = await requestNodeRecoveryPlan({
    node,
    settings,
    state,
    messages,
    tools,
    toolRegistry,
    failureReason,
  });

  if (!recoveryPlan || recoveryPlan.shouldEscalateToChatGpt) {
    const hostedFallback = await runHostedNodeFallback({
      node,
      settings,
      state,
      failureReason,
      messages,
    });
    return {
      finalText: hostedFallback.finalText,
      browserSession: nextBrowserSession,
      memoryUpdates,
      manualBrowser: hostedFallback.manualBrowser,
    };
  }

  const handoffMessages: OllamaMessage[] = [...messages];

  if (recoveryPlan.toolCall) {
    const toolConfig = toolRegistry.get(recoveryPlan.toolCall.name);

    if (toolConfig) {
      const toolResult: {
        result: any;
        browserSession?: any;
        memoryUpdates?: Array<{
          memoryKey: string;
          value: any;
          source?: string;
        }>;
      } = BUILT_IN_TOOLS.some((tool) => tool.callName === recoveryPlan.toolCall?.name)
        ? await executeBuiltInTool(
            recoveryPlan.toolCall.name,
            recoveryPlan.toolCall.arguments,
            nextBrowserSession,
            conversationId,
            state,
            preferredModel
          )
        : {
            result: await executeExternalTool(
              toolConfig,
              recoveryPlan.toolCall.arguments,
              state
            ),
          };

      nextBrowserSession = toolResult.browserSession ?? nextBrowserSession;
      if (toolResult.memoryUpdates?.length) {
        memoryUpdates.push(...toolResult.memoryUpdates);
      }

      if (toolResult.result?.requiresManualIntervention) {
        return {
          browserSession: nextBrowserSession,
          memoryUpdates,
          manualBrowser: {
            url:
              toolResult.result?.finalUrl ||
              toolResult.result?.browserUrl ||
              toolResult.result?.browserState?.url,
            title:
              toolResult.result?.title ||
              toolResult.result?.browserState?.title ||
              "Browser recovery",
            reason:
              toolResult.result?.manualInterventionReason ||
              toolResult.result?.error ||
              "Manual browser attention is needed before the workflow can continue.",
            suggestedAction:
              "Complete the required browser step, then resume the workflow.",
          },
        };
      }

      handoffMessages.push({
        role: "tool",
        name: recoveryPlan.toolCall.name,
        content: JSON.stringify(toolResult.result),
      });
    }
  }

  const handoffNote = [
    `Fallback handoff from ${getOllamaFallbackModel()}: ${recoveryPlan.recoveryCommand || recoveryPlan.reason}`,
    settings.output === "json" && settings.schema
      ? `Return only valid JSON matching this schema:\n${settings.schema}`
      : "Return the completed node output now.",
    recoveryPlan.finalText
      ? `Recovered answer draft:\n${recoveryPlan.finalText}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  let recoveredText: string | undefined;

  try {
    const handoffResponse = await ollamaChat({
      messages: [
        ...handoffMessages,
        {
          role: "user",
          content: handoffNote,
        },
      ],
      // Switch BACK to primary model after recovery plan is applied
      model: preferredModel,
    });

    if (handoffResponse.content?.trim()) {
      recoveredText = handoffResponse.content.trim();
    }
  } catch {
    // Fall through
  }

  if (!recoveredText) {
    recoveredText = recoveryPlan.finalText || undefined;
  }

  // --- Write error lesson to memory so future runs avoid the same mistake ---
  if (recoveredText) {
    const avoidanceHint =
      recoveryPlan.reason ||
      `When executing node "${getNodeName(node)}", the primary model failed with: ${failureReason}. Use the ${getOllamaFallbackModel()} recovery plan as a hint.`;

    // 1. Persistent error memory for this node
    memoryUpdates.push({
      memoryKey: NODE_ERROR_MEMORY_KEY,
      value: {
        nodeId: node.id,
        nodeName: getNodeName(node),
        errorPattern: failureReason.slice(0, 240),
        recoveryModel: getOllamaFallbackModel(),
        avoidanceHint,
        patchedAt: new Date().toISOString(),
      },
      source: `recovery.${node.id}`,
    });

    // 2. Node-level patch injected into run state so primary model sees it next time
    memoryUpdates.push({
      memoryKey: `node_patch_${node.id}`,
      value: avoidanceHint,
      source: `recovery.${node.id}.patch`,
    });

    return {
      finalText: recoveredText,
      browserSession: nextBrowserSession,
      memoryUpdates,
    };
  }

  const hostedFallback = await runHostedNodeFallback({
    node,
    settings,
    state,
    failureReason,
    messages: handoffMessages,
  });

  return {
    finalText: hostedFallback.finalText,
    browserSession: nextBrowserSession,
    memoryUpdates,
    manualBrowser: hostedFallback.manualBrowser,
  };
}

export async function runAgentNode(
  node: RuntimeFlowNode,
  config: AgentRuntimeConfig,
  runState: PersistedRun
) {
  const settings = ensureObject(node.settings);
  const preferredModel = normalizeLocalModel(settings.model);
  const browserMemoryKey = String(
    settings.discoveredUrlMemoryKey || PREVIEW_DEFAULT_URL_MEMORY_KEY
  ).trim() || PREVIEW_DEFAULT_URL_MEMORY_KEY;
  const browserProfileMemoryKey = String(
    settings.browserProfileMemoryKey || PREVIEW_BROWSER_PROFILE_MEMORY_KEY
  ).trim() || PREVIEW_BROWSER_PROFILE_MEMORY_KEY;

  if (settings.websiteDiscovery) {
    const state = ensureObject(runState.state);
    const reusableMemory = ensureObject(state.reusableMemory);
    const discoveryQuery = buildWebsiteDiscoveryQuery({
      settings,
      state,
    });
    const rememberedDiscoveredUrl = String(
      reusableMemory[browserMemoryKey] || ""
    ).trim();
    const resolvedTarget = await resolveBrowserSite({
      browserSession: runState.browserSession,
      rememberedUrl: rememberedDiscoveredUrl,
      goal: discoveryQuery,
      preferredModel,
      nodeName: getNodeName(node),
    });
    const resolvedUrl = String(resolvedTarget.resolvedUrl || "").trim();
    const discoveredSite = resolvedTarget.discoveredSite || {};
    const preferredBrowserProfile = inferBrowserProfileForTask({
      requestedProfile:
        typeof settings.preferredBrowserProfile === "string"
          ? settings.preferredBrowserProfile
          : undefined,
      rememberedProfile:
        typeof reusableMemory[browserProfileMemoryKey] === "string"
          ? reusableMemory[browserProfileMemoryKey]
          : undefined,
      goal: discoveredSite.nextStep || discoveryQuery,
      url: resolvedUrl,
      siteName: discoveredSite.siteName,
      reuseSignedInSession: settings.reuseSignedInSession !== false,
    });
    let nextBrowserSession = runState.browserSession;
    let manualBrowser:
      | {
          url?: string;
          title?: string;
          reason: string;
          suggestedAction?: string;
        }
      | undefined;

    if (settings.autoOpenDiscoveredSite !== false && resolvedUrl) {
      const visitResult = await visitWebsite({
        url: resolvedUrl,
        goal: discoveredSite.nextStep || discoveryQuery,
        browserSession: nextBrowserSession,
        conversationId: runState.conversationId,
        actions: settings.initialBrowserActions,
        profile: preferredBrowserProfile || undefined,
        workspaceKey:
          nextBrowserSession?.workspaceKey || runState.conversationId || undefined,
        rememberedUrl: rememberedDiscoveredUrl,
        preferredModel,
        resolvedSite: resolvedTarget,
      });

      nextBrowserSession =
        "browserSession" in visitResult
          ? visitResult.browserSession || nextBrowserSession
          : nextBrowserSession;

      const visitPayload = visitResult as Record<string, any>;

      if (visitPayload?.requiresManualIntervention) {
        manualBrowser = {
          url: visitPayload.finalUrl || visitPayload.browserState?.url,
          title: visitPayload.title || visitPayload.browserState?.title,
          reason:
            visitPayload.manualInterventionReason ||
            "Manual browser takeover is needed before the workflow can continue.",
          suggestedAction:
            "Use the browser workspace to complete the step, then resume the workflow.",
        };
      }
    } else if (!resolvedUrl) {
      manualBrowser = {
        reason:
          "The workflow could not confirm the right website automatically from this task. Use the optional site override or open the browser workspace manually, then resume.",
        suggestedAction:
          "Enter a site override if you know the destination, or open the correct site in the browser workspace and resume.",
      };
    }

    const websiteDiscoveryOutput = {
      query: discoveredSite.query,
      recommendedUrl: resolvedUrl,
      siteName: discoveredSite.siteName,
      reason: discoveredSite.reason,
      nextBrowserGoal: discoveredSite.nextStep,
      preferredBrowserProfile,
      nextStep: discoveredSite.nextStep,
      resolvedSiteSource: resolvedTarget.resolvedSiteSource,
      rememberedUrlMatchedTask: Boolean(discoveredSite.rememberedUrlMatchedTask),
      sources: Array.isArray(discoveredSite.sources)
        ? discoveredSite.sources.slice(0, 3)
        : [],
      pageSummary: nextBrowserSession
        ? {
            url: nextBrowserSession.lastUrl || resolvedUrl,
            title: nextBrowserSession.lastTitle || discoveredSite.siteName,
          }
        : undefined,
    };

    const parsedOutput =
      settings.output === "json"
        ? websiteDiscoveryOutput
        : [
            discoveredSite.siteName
              ? `Website selected: ${discoveredSite.siteName}`
              : "Website selection completed.",
            resolvedUrl
              ? `URL: ${resolvedUrl}`
              : "No public URL could be selected automatically.",
            discoveredSite.reason ? `Why: ${discoveredSite.reason}` : "",
            discoveredSite.nextStep ? `Next step: ${discoveredSite.nextStep}` : "",
          ]
            .filter(Boolean)
            .join("\n");

    const memoryUpdates =
      [
        resolvedUrl &&
        settings.rememberDiscoveredUrl !== false &&
        (resolvedTarget.resolvedSiteSource === "discovery" ||
          resolvedTarget.resolvedSiteSource === "override")
          ? {
              memoryKey: browserMemoryKey,
              value: resolvedUrl,
              source: `${node.id}.website_discovery`,
            }
          : null,
        preferredBrowserProfile
          ? {
              memoryKey: browserProfileMemoryKey,
              value: preferredBrowserProfile,
              source: `${node.id}.browser_profile`,
            }
          : null,
      ].filter(Boolean) as Array<{
        memoryKey: string;
        value: any;
        source?: string;
      }>;

    return {
      output: parsedOutput,
      summary:
        typeof parsedOutput === "string"
          ? parsedOutput
          : JSON.stringify(parsedOutput, null, 2),
      browserSession: nextBrowserSession,
      manualBrowser,
      memoryUpdates,
      messages: [
        ...(runState.messages ?? []),
        {
          role: "assistant",
          content:
            typeof parsedOutput === "string"
              ? `${getNodeName(node)}:\n${parsedOutput}`
              : `${getNodeName(node)}:\n${JSON.stringify(parsedOutput, null, 2)}`,
        },
      ].slice(-12),
    };
  }

  const allTools = getToolsForNode(node, config);
  const toolRegistry = new Map(allTools.map((tool) => [tool.callName, tool]));
  const tools = allTools.map((tool) => ({
    type: "function",
    function: {
      name: tool.callName,
      description: tool.description || tool.name,
      parameters: buildToolSchema(tool.parameters),
    },
  }));

  const includeHistory = settings.includeHistory ?? true;
  const state = ensureObject(runState.state);
  const rememberedUrl = String(
    ensureObject(state.reusableMemory)?.[PREVIEW_DEFAULT_URL_MEMORY_KEY] || ""
  );
  const rememberedProfile = String(
    ensureObject(state.reusableMemory)?.[PREVIEW_BROWSER_PROFILE_MEMORY_KEY] || ""
  );
  const currentBrowserSummary = runState.browserSession
    ? {
        provider: runState.browserSession.provider || "unknown",
        url: runState.browserSession.lastUrl || "",
        title: runState.browserSession.lastTitle || "",
        tabId: runState.browserSession.tabId || runState.browserSession.targetId || "",
      }
    : null;

  // Read any node-level error patch written by a previous recovery run
  const nodePatchKey = `node_patch_${node.id}`;
  const nodePatch = String(
    ensureObject(state.reusableMemory)?.[nodePatchKey] ||
    ensureObject(state.nodePatches)?.[node.id] ||
    ""
  ).trim();

  // Read role for specialized nodes
  const agentRole = String(settings.agentRole || "").trim().toLowerCase();
  const rolePromptPrefix = agentRole ? (AGENT_ROLE_PROMPTS[agentRole] || "") : "";

  const prompt = [
    rolePromptPrefix || `You are executing the workflow node "${getNodeName(node)}".`,
    config.systemPrompt || "Complete the workflow step precisely and efficiently.",
    `Node instruction:\n${settings.instruction || "Use the available context to complete this step."}`,
    nodePatch
      ? `IMPORTANT — Avoidance hint from a previous recovery run:\n${nodePatch}`
      : "",
    `Output slot: nodeOutputs.${node.id}`,
    settings.output === "json" && settings.schema
      ? `Return JSON matching this schema:\n${settings.schema}`
      : "Return a concise, useful result for this node.",
    'Built-in web tools are available: "web_research" for search + evidence gathering, "internet_search" for quick search results, "fetch_webpage" for readable page text, "browser_visit" for direct browser navigation/actions, "browser_task" for multi-step browser procedures, "ask_agent" to delegate a sub-question to another specialized agent, and "chatgpt_api" as a hosted fallback when local recovery is exhausted.',
    currentBrowserSummary
      ? `Current browser workspace:\n${JSON.stringify(currentBrowserSummary, null, 2)}`
      : "Current browser workspace: none attached yet.",
    rememberedUrl
      ? `Remembered preview start URL (${PREVIEW_DEFAULT_URL_MEMORY_KEY}): ${rememberedUrl}`
      : `Remembered preview start URL (${PREVIEW_DEFAULT_URL_MEMORY_KEY}): none`,
    rememberedProfile
      ? `Remembered browser profile (${PREVIEW_BROWSER_PROFILE_MEMORY_KEY}): ${rememberedProfile}`
      : `Remembered browser profile (${PREVIEW_BROWSER_PROFILE_MEMORY_KEY}): none`,
    "Prefer web_research, fetch_webpage, browser_visit, and browser_task instead of asking the user for public-site links.",
    'Use browser_task for end-to-end browser outcomes such as opening Gmail, navigating to the right page, and extracting the final result. Use browser_visit for direct opens or one-shot actions. browser_visit can accept only a goal when no URL is known yet, and the runtime will research the site automatically.',
    "Use chatgpt_api only when local model recovery is exhausted or complex hosted help is explicitly necessary.",
    "Never attempt to bypass CAPTCHA, bot detection, or human verification. If one appears, request manual browser takeover and wait for resume.",
    "Do not ask the user to visit public sites manually unless the page requires login, payment, OTP, CAPTCHA, or legal confirmation.",
    `Workflow state:\n${summarizeStateForPrompt(state, includeHistory)}`,
    // Inject uploaded PDF context if present
    (() => {
      const pdfCtx = String(ensureObject(state.reusableMemory)["workflow_pdf_context"] || "").trim();
      return pdfCtx ? `Uploaded PDF context (use this to inform your plan):\n${pdfCtx.slice(0, 6000)}` : "";
    })(),
  ]
    .filter(Boolean)
    .join("\n\n");

  const messages: any[] = [
    {
      role: "system",
      content: prompt,
    },
    ...(includeHistory ? runState.messages ?? [] : []),
    {
      role: "user",
      content: `Complete the node "${getNodeName(node)}" for task:\n${state.task || ""}`,
    },
  ];

  let finalText = "";
  let nextBrowserSession = runState.browserSession;

  // ── OpenAI API as primary for timetable domain nodes ─────────────────────
  const isTimetableDomain =
    String(settings.domain || "").trim().toLowerCase() === "timetable" ||
    String(node.id || "").toLowerCase().includes("timetable") ||
    String(getNodeName(node)).toLowerCase().includes("timetable");

  console.log(`[timetable-debug] node="${getNodeName(node)}" id="${node.id}" domain="${settings.domain}" isTimetableDomain=${isTimetableDomain} output="${settings.output}"`);

  if (isTimetableDomain && settings.output === "json") {
    const openAIReady = isOpenAIConfigured();
    console.log(`[timetable-debug] isOpenAIConfigured=${openAIReady}`);

    // ── Path A: OpenAI API ────────────────────────────────────────────────
    if (openAIReady) {
      const pdfCtx = String(ensureObject(state.reusableMemory)["workflow_pdf_context"] || "").trim();
      const openAiPrompt = [
        `You are a life-planning AI executing the workflow node "${getNodeName(node)}".`,
        `Instruction:\n${settings.instruction || "Create a comprehensive timetable plan."}`,
        settings.schema
          ? `Return ONLY valid JSON matching this schema exactly. No prose, no markdown, no code fences — raw JSON only:\n${settings.schema}`
          : "",
        `Workflow state:\n${summarizeStateForPrompt(state, true)}`,
        pdfCtx ? `Uploaded PDF context (use this to inform your plan):\n${pdfCtx.slice(0, 8000)}` : "",
      ].filter(Boolean).join("\n\n");

      console.log(`[timetable-debug] Calling OpenAI, prompt length=${openAiPrompt.length}`);

      try {
        const openAiResult = await sendPromptViaOpenAI({
          prompt: openAiPrompt,
          systemPrompt:
            "You are a precise life-planning AI. Always respond with valid JSON only — no prose, no markdown fences.",
        });
        console.log(`[timetable-debug] OpenAI ok=${openAiResult.ok} contentLen=${openAiResult.content?.length ?? 0} error=${openAiResult.error ?? "none"}`);
        if (openAiResult.ok && openAiResult.content?.trim()) {
          finalText = openAiResult.content.trim();
          console.log(`[timetable-debug] finalText set from OpenAI, first 200 chars: ${finalText.slice(0, 200)}`);
        } else if (openAiResult.error) {
          console.error(`[timetable-debug] OpenAI error: ${openAiResult.error}`);
        }
      } catch (err) {
        console.error(`[timetable-debug] OpenAI threw:`, err);
      }
    }

    // ── Path B: Qwen 14b direct JSON generation (fallback) ────────────────
    if (!finalText) {
      console.log(`[timetable-debug] OpenAI path did not produce output — trying Qwen direct JSON generation`);
      const pdfCtx = String(ensureObject(state.reusableMemory)["workflow_pdf_context"] || "").trim();
      const qwenPrompt = [
        settings.instruction || "Create a comprehensive timetable plan for today based on the workflow state below.",
        settings.schema ? `Return ONLY a single valid JSON object matching this schema. No thinking, no prose, no markdown:\n${settings.schema}` : "",
        `Workflow state:\n${summarizeStateForPrompt(state, false)}`,
        pdfCtx ? `Additional context:\n${pdfCtx.slice(0, 4000)}` : "",
      ].filter(Boolean).join("\n\n");

      try {
        const qwenResult = await ollamaGenerateJson(qwenPrompt, preferredModel);
        console.log(`[timetable-debug] Qwen direct result length=${qwenResult?.length ?? 0} head=${String(qwenResult || "").slice(0, 100)}`);
        if (qwenResult?.trim()) {
          finalText = qwenResult.trim();
        }
      } catch (err) {
        console.error(`[timetable-debug] Qwen direct generation threw:`, err);
        // fall through to the standard 8-step Ollama agent loop
      }
    }
  }
  // ─────────────────────────────────────────────────────────────────────────
  const memoryUpdates: Array<{
    memoryKey: string;
    value: any;
    source?: string;
  }> = [];
  let manualBrowser:
    | {
        url?: string;
        title?: string;
        reason: string;
        suggestedAction?: string;
      }
    | undefined;
  let failureReason = "";

  for (let step = 0; step < 8 && !finalText; step += 1) {
    let assistantMessage: any;

    try {
      assistantMessage = await ollamaChat({
        messages,
        tools: tools.length ? tools : undefined,
        model: preferredModel,
      });
    } catch (error) {
      failureReason =
        error instanceof Error
          ? error.message
          : "The primary workflow model could not complete this step.";
      break;
    }
    const resolvedToolCalls =
      assistantMessage.tool_calls?.length
        ? assistantMessage.tool_calls
        : extractTextToolCalls(assistantMessage.content || "", toolRegistry);

    if (resolvedToolCalls.length) {
      assistantMessage.tool_calls = resolvedToolCalls;
    }

    messages.push(assistantMessage);

    if (!assistantMessage.tool_calls?.length) {
      finalText =
        assistantMessage.content?.trim() ||
        "This workflow step completed without a detailed response.";
      break;
    }

    for (const toolCall of assistantMessage.tool_calls) {
      const functionCall = toolCall.function ?? toolCall;
      const toolConfig = toolRegistry.get(functionCall.name);

      if (!toolConfig) {
        messages.push({
          role: "tool",
          name: functionCall.name,
          content: JSON.stringify({
            ok: false,
            error: `Tool "${functionCall.name}" is not configured.`,
          }),
        });
        continue;
      }

      const toolResult: {
        result: any;
        browserSession?: any;
        memoryUpdates?: Array<{
          memoryKey: string;
          value: any;
          source?: string;
        }>;
      } = BUILT_IN_TOOLS.some((tool) => tool.callName === functionCall.name)
        ? await executeBuiltInTool(
            functionCall.name,
            functionCall.arguments,
            nextBrowserSession,
            runState.conversationId,
            state,
            preferredModel
          )
        : {
            result: await executeExternalTool(toolConfig, functionCall.arguments, state),
          };

      nextBrowserSession = toolResult.browserSession ?? nextBrowserSession;
      if (toolResult.memoryUpdates?.length) {
        memoryUpdates.push(...toolResult.memoryUpdates);
      }

      if (
        ["browser_visit", "browser_task", "chatgpt_api"].includes(functionCall.name) &&
        toolResult.result?.requiresManualIntervention
      ) {
        manualBrowser = {
          url:
            toolResult.result?.finalUrl ||
            toolResult.result?.browserUrl ||
            toolResult.result?.browserState?.url,
          title:
            toolResult.result?.title ||
            toolResult.result?.browserState?.title ||
            "Browser recovery",
          reason:
            toolResult.result?.manualInterventionReason ||
            "Manual browser takeover is needed before the workflow can continue.",
          suggestedAction:
            "Use the browser workspace to complete the manual step, then resume the workflow.",
        };
      }

      messages.push({
        role: "tool",
        name: functionCall.name,
        content: JSON.stringify(toolResult.result),
      });

      if (manualBrowser) {
        break;
      }
    }

    if (manualBrowser) {
      break;
    }
  }

  if (!finalText && !manualBrowser) {
    const recovery = await attemptNodeRecovery({
      node,
      settings,
      state,
      messages,
      preferredModel,
      tools: allTools,
      toolRegistry,
      browserSession: nextBrowserSession,
      conversationId: runState.conversationId,
      failureReason:
        failureReason ||
        `The node exhausted its 8-step budget without producing a final answer.`,
    });

    nextBrowserSession = recovery.browserSession ?? nextBrowserSession;
    if (recovery.memoryUpdates.length) {
      memoryUpdates.push(...recovery.memoryUpdates);
    }
    if (recovery.manualBrowser) {
      manualBrowser = recovery.manualBrowser;
    }
    if (recovery.finalText?.trim()) {
      finalText = recovery.finalText.trim();
    }
  }

  if (!finalText) {
    finalText =
      [...messages]
        .reverse()
        .find((message) => message.role === "assistant" && message.content?.trim())
        ?.content?.trim() || "This workflow step did not complete.";
  }

  if (settings.output === "json" && settings.schema) {
    console.log(`[timetable-debug] Running ensureJsonOutput, finalText first 100: ${finalText.slice(0, 100)}`);
    finalText = await ensureJsonOutput(finalText, settings.schema, preferredModel);
  }

  const parsedOutput =
    settings.output === "json" ? tryParseJson(finalText) ?? { response: finalText } : finalText;

  if (isTimetableDomain) {
    const isValid = parsedOutput && typeof parsedOutput === "object" && !Array.isArray(parsedOutput) && (parsedOutput as any).scores && Array.isArray((parsedOutput as any).todayPlan);
    console.log(`[timetable-debug] parsedOutput type=${typeof parsedOutput} isTrackerPlanCandidate=${isValid} keys=${parsedOutput && typeof parsedOutput === "object" ? Object.keys(parsedOutput as object).join(",") : "N/A"}`);
  }

  return {
    output: parsedOutput,
    summary: typeof parsedOutput === "string" ? parsedOutput : JSON.stringify(parsedOutput, null, 2),
    browserSession: nextBrowserSession,
    manualBrowser,
    memoryUpdates,
    messages: [
      ...(includeHistory ? runState.messages ?? [] : []),
      {
        role: "assistant",
        content: `${getNodeName(node)}:\n${
          typeof parsedOutput === "string"
            ? parsedOutput
            : JSON.stringify(parsedOutput, null, 2)
        }`,
      },
    ].slice(-12),
  };
}

export async function runApiNode(node: RuntimeFlowNode, runState: PersistedRun) {
  const settings = ensureObject(node.settings);
  const state = ensureObject(runState.state);
  let url = String(applyTemplate(settings.url || "", state));
  const method =
    String(settings.method || "GET").toUpperCase() === "POST" ? "POST" : "GET";
  const bodyTemplate = settings.bodyparams ? String(settings.bodyparams) : "";
  const parsedBody = bodyTemplate ? tryParseJson(String(applyTemplate(bodyTemplate, state))) : null;
  const headers: Record<string, string> = {};

  if (settings.includeApiKey && settings.apiKey) {
    headers["x-api-key"] = String(settings.apiKey);
    headers.Authorization = `Bearer ${String(settings.apiKey)}`;

    if (method === "GET") {
      const nextUrl = new URL(url);
      nextUrl.searchParams.set("key", String(settings.apiKey));
      url = nextUrl.toString();
    }
  }

  try {
    let response: Response;
    if (method === "GET") {
      response = await fetch(url, {
        method: "GET",
        headers,
        cache: "no-store",
      });
    } else {
      response = await fetch(url, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(parsedBody ?? {}),
      });
    }

    const text = await response.text();
    const parsed = tryParseJson(text) ?? text;

    return {
      output: {
        ok: response.ok,
        status: response.status,
        url,
        data: parsed,
      },
      summary: response.ok
        ? `${getNodeName(node)} returned status ${response.status}.`
        : `${getNodeName(node)} failed with status ${response.status}.`,
    };
  } catch (error) {
    return {
      output: {
        ok: false,
        status: 500,
        url,
        error: error instanceof Error ? error.message : "API request failed.",
      },
      summary: `${getNodeName(node)} failed to reach ${url}.`,
    };
  }
}

/**
 * Run a specialized agent node (Researcher, Writer, Viewer, Reviewer, Executor).
 * Delegates to runAgentNode with the node type mapped to AgentNode so it uses
 * the same execution loop, but with role-locked tools and a role prompt prefix.
 */
export async function runSpecializedAgentNode(
  node: RuntimeFlowNode,
  config: AgentRuntimeConfig,
  runState: PersistedRun
) {
  // Map specialized type to AgentNode so the core loop runs unchanged
  const normalizedNode: RuntimeFlowNode = {
    ...node,
    type: "AgentNode",
    settings: {
      ...ensureObject(node.settings),
      // Ensure agentRole is set so the prompt prefix fires
      agentRole: ensureObject(node.settings).agentRole || node.type.replace("AgentNode", "").toLowerCase(),
    },
  };
  return runAgentNode(normalizedNode, config, runState);
}

export async function evaluateCondition(
  condition: string,
  state: Record<string, any>,
  label: string
) {
  const templated = String(applyTemplate(condition, state) || "").trim();
  const normalized = templated.toLowerCase();

  if (!templated.length) {
    return {
      result: false,
      reason: `${label} did not have a condition.`,
    };
  }

  if (["true", "yes", "approve", "approved"].includes(normalized)) {
    return {
      result: true,
      reason: `${label} condition resolved directly to true.`,
    };
  }

  if (["false", "no", "reject", "rejected"].includes(normalized)) {
    return {
      result: false,
      reason: `${label} condition resolved directly to false.`,
    };
  }

  const comparisonMatch = templated.match(/(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)/);
  if (comparisonMatch) {
    const [, rawLeft, operator, rawRight] = comparisonMatch;
    return {
      result: compareValues(parsePrimitive(rawLeft), operator, parsePrimitive(rawRight)),
      reason: `${label} condition used direct comparison.`,
    };
  }

  const response = await ollamaGenerateJson(
    `You are evaluating a workflow branch condition.
Return only valid JSON in this shape:
{"result":true,"reason":""}

Condition:
${condition}

Available workflow state:
${JSON.stringify(state, null, 2)}`
  );
  const parsed = tryParseJson(response);

  return {
    result: Boolean(parsed?.result),
    reason: String(parsed?.reason || `${label} used model evaluation.`),
  };
}
