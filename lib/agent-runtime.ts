import { randomUUID } from "crypto";

import { visitWebsite } from "@/lib/browser-runtime";
import { normalizeLocalModel, ollamaChat } from "@/lib/ollama";
import { fetchWebpage, searchInternet } from "@/lib/web-tools";

type AgentTool = {
  id?: string;
  name: string;
  callName: string;
  description?: string;
  method?: string;
  url?: string;
  includeApiKey?: boolean;
  apiKey?: string;
  parameters?: Record<string, string>;
  assignedAgent?: string;
};

type QuestionBlock = {
  id: string;
  name: string;
  question: string;
  responseType: "short-answer" | "mcq";
  options: string[];
  required: boolean;
};

type PrefilledQuestionAnswer = {
  id?: string;
  answer: string;
};

type AgentConfig = {
  version?: number;
  systemPrompt?: string;
  primaryAgentName?: string;
  questionBlocks?: QuestionBlock[];
  agents?: Array<{
    id?: string;
    name?: string;
    instruction?: string;
    instructions?: string;
    model?: string;
    includeHistory?: boolean;
    tools?: string[];
  }>;
  tools?: AgentTool[];
};

type SessionMessage = {
  role: "user" | "assistant" | "tool";
  content: string;
  tool_calls?: any[];
  name?: string;
};

type RuntimeSession = {
  messages: SessionMessage[];
  taskContext: string | null;
  pendingQuestionIndex: number;
  questionAnswers: Array<{
    id: string;
    name: string;
    question: string;
    answer: string;
    responseType: "short-answer" | "mcq";
  }>;
  questionsCompleted: boolean;
};

const BUILT_IN_TOOLS: AgentTool[] = [
  {
    name: "Internet search",
    callName: "internet_search",
    description:
      "Search the public web for current information, sources, and research leads.",
    method: "GET",
    parameters: {
      query: "string",
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
    name: "Browser visit",
    callName: "browser_visit",
    description:
      "Visit a website in a browser-like session, wait for rendered content, and extract the page details for the current task.",
    method: "GET",
    parameters: {
      url: "string",
      goal: "optional",
    },
  },
];

const globalStore = globalThis as typeof globalThis & {
  __systematicTrackerSessions?: Map<string, RuntimeSession>;
};

const sessions =
  globalStore.__systematicTrackerSessions ?? new Map<string, RuntimeSession>();
globalStore.__systematicTrackerSessions = sessions;

function createEmptySession(): RuntimeSession {
  return {
    messages: [],
    taskContext: null,
    pendingQuestionIndex: 0,
    questionAnswers: [],
    questionsCompleted: false,
  };
}

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
  };
}

export function normalizeAgentToolConfig(rawConfig: any): AgentConfig {
  if (!rawConfig) {
    return {
      version: 2,
      systemPrompt: "",
      primaryAgentName: "",
      questionBlocks: [],
      agents: [],
      tools: [],
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

  return {
    version: rawConfig.version ?? 1,
    systemPrompt: rawConfig.systemPrompt ?? "",
    primaryAgentName: rawConfig.primaryAgentName ?? "",
    questionBlocks: Array.isArray(rawConfig.questionBlocks)
      ? rawConfig.questionBlocks.map(normalizeQuestionBlock)
      : [],
    agents: Array.isArray(rawConfig.agents)
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
      : [],
    tools,
  };
}

export function needsAgentRuntimeRefresh(rawConfig: any) {
  if (!rawConfig) {
    return true;
  }

  if (rawConfig.parsedJson) {
    return true;
  }

  return rawConfig.version !== 2;
}

export function initializeConversation(conversationId?: string) {
  const id = conversationId || randomUUID();

  if (!sessions.has(id)) {
    sessions.set(id, createEmptySession());
  }

  return id;
}

function getSession(sessionId: string) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, createEmptySession());
  }

  return sessions.get(sessionId) as RuntimeSession;
}

function buildRuntimePrompt(agentName: string, config: AgentConfig) {
  const agentLines = (config.agents ?? []).map((agent) => {
    const instruction = agent.instruction || agent.instructions || "";
    const tools = agent.tools?.length ? `Tools: ${agent.tools.join(", ")}` : "Tools: none";
    const model = agent.model ? `Model: ${agent.model}` : "Model: default";

    return `- ${agent.name || "Agent"}: ${instruction}\n  ${model}\n  ${tools}`;
  });

  const toolLines = [...BUILT_IN_TOOLS, ...(config.tools ?? [])].map((tool) => {
    const method = tool.method || "GET";
    return `- ${tool.name} (call name: ${tool.callName}, ${method})${tool.assignedAgent ? ` for ${tool.assignedAgent}` : ""}: ${tool.description || "No description"}`;
  });

  const questionLines = (config.questionBlocks ?? []).map((question, index) => {
    const options = question.options.length ? ` Options: ${question.options.join(", ")}` : "";
    return `${index + 1}. ${question.name}: ${question.question}${options}`;
  });

  return [
    `You are ${config.primaryAgentName || agentName || "Systematic Tracker"}.`,
    config.systemPrompt ||
      "Research the task first, list the important points, build a clear plan, and only then execute or answer.",
    "You can browse the public web with the built-in tools when the request needs current information, facts, or sources.",
    "When current or recent information matters, use internet_search first and fetch_webpage on the most relevant sources before answering.",
    "If the user needs information from a site, visit or fetch the site yourself and bring back the answer. Only tell the user to open a site manually when the task needs their login, payment, OTP, or explicit legal confirmation.",
    agentLines.length
      ? `Specialist workflow agents:\n${agentLines.join("\n")}`
      : "There are no specialist sub-agents configured.",
    questionLines.length
      ? `Requirement questions that may already be answered:\n${questionLines.join("\n")}`
      : "",
    toolLines.length
      ? `Available tools:\n${toolLines.join("\n")}`
      : "There are no tools configured.",
    "If a tool is needed, call it with exact arguments. After tool results come back, answer clearly, cite URLs when helpful, and stay grounded in the retrieved data.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildToolSchema(parameters?: Record<string, string>) {
  const entries = Object.entries(parameters ?? {});

  return {
    type: "object",
    properties: Object.fromEntries(
      entries.map(([key, type]) => [
        key,
        {
          type:
            type === "number"
              ? "number"
              : type === "boolean"
                ? "boolean"
                : "string",
        },
      ])
    ),
    required: entries
      .filter(([, type]) => type !== "optional")
      .map(([key]) => key),
  };
}

function parseToolArguments(input: unknown) {
  if (!input) {
    return {};
  }

  if (typeof input === "string") {
    try {
      return JSON.parse(input);
    } catch {
      return {};
    }
  }

  if (typeof input === "object") {
    return input as Record<string, unknown>;
  }

  return {};
}

function appendQueryParams(url: string, params: Record<string, unknown>) {
  const urlObject = new URL(url);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      urlObject.searchParams.set(key, String(value));
    }
  }

  return urlObject.toString();
}

function fillUrlPlaceholders(url: string, params: Record<string, unknown>) {
  let resolvedUrl = url;

  for (const [key, value] of Object.entries(params)) {
    resolvedUrl = resolvedUrl
      .replaceAll(`{{${key}}}`, encodeURIComponent(String(value)))
      .replaceAll(`{${key}}`, encodeURIComponent(String(value)));
  }

  if (/\{[^}]+\}/.test(resolvedUrl) && Object.keys(params).length === 1) {
    const replacementValue = encodeURIComponent(String(Object.values(params)[0]));
    resolvedUrl = resolvedUrl.replace(/\{[^}]+\}/, replacementValue);
  }

  return resolvedUrl.replace("/currrent.json", "/current.json");
}

function extractTextToolCalls(content: string, toolRegistry: Map<string, AgentTool>) {
  const trimmed = content.trim();
  if (!trimmed) {
    return [];
  }

  const candidateBlocks = [
    trimmed,
    ...(trimmed.match(/```json([\s\S]*?)```/gi) ?? []).map((block) =>
      block.replace(/```json|```/gi, "").trim()
    ),
    ...(trimmed.match(/\{[\s\S]*\}/g) ?? []),
  ];

  for (const block of candidateBlocks) {
    try {
      const parsed = JSON.parse(block);
      const calls = Array.isArray(parsed) ? parsed : [parsed];

      const normalizedCalls = calls
        .map((call) => {
          const rawName =
            typeof call?.name === "string"
              ? call.name
              : typeof call?.function?.name === "string"
                ? call.function.name
                : "";
          const normalizedName = toolRegistry.has(rawName)
            ? rawName
            : toCallName(rawName, rawName);

          if (!toolRegistry.has(normalizedName)) {
            return null;
          }

          const rawArguments =
            call?.parameters ??
            call?.arguments ??
            call?.function?.arguments ??
            {};

          return {
            function: {
              name: normalizedName,
              arguments:
                typeof rawArguments === "string"
                  ? parseToolArguments(rawArguments)
                  : rawArguments,
            },
          };
        })
        .filter(Boolean);

      if (normalizedCalls.length) {
        return normalizedCalls as any[];
      }
    } catch {
      // Keep scanning for a valid JSON tool call block.
    }
  }

  return [];
}

function getPreferredModel(config: AgentConfig) {
  const preferredAgent =
    (config.agents ?? []).find(
      (agent) => agent.name && agent.name === config.primaryAgentName
    ) || config.agents?.[0];

  return normalizeLocalModel(preferredAgent?.model);
}

async function executeBuiltInTool(callName: string, rawArgs: unknown) {
  const args = parseToolArguments(rawArgs);

  if (callName === "internet_search") {
    if (!String(args.query || "").trim()) {
      return {
        ok: false,
        status: 400,
        error: "Add a search query before calling internet_search.",
      };
    }

    return searchInternet(String(args.query || ""), Number(args.maxResults || 5));
  }

  if (callName === "fetch_webpage") {
    if (!String(args.url || "").trim()) {
      return {
        ok: false,
        status: 400,
        error: "Add a URL before calling fetch_webpage.",
      };
    }

    return fetchWebpage(String(args.url || ""));
  }

  if (callName === "browser_visit") {
    if (!String(args.url || "").trim() && !String(args.goal || "").trim()) {
      return {
        ok: false,
        status: 400,
        error: "Add a URL or a goal before calling browser_visit.",
      };
    }

    return visitWebsite({
      url: String(args.url || ""),
      goal: String(args.goal || ""),
    });
  }

  return {
    ok: false,
    status: 400,
    error: `Built-in tool "${callName}" is not available.`,
  };
}

async function executeExternalTool(toolConfig: AgentTool, rawArgs: unknown) {
  const args = parseToolArguments(rawArgs);
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

function normalizeChoice(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

function formatQuestionPrompt(question: QuestionBlock, index: number, total: number) {
  const header = `Requirement ${index + 1} of ${total}: ${question.name}`;
  const responseHint =
    question.responseType === "mcq"
      ? "Reply with one option name or its number."
      : "Reply with a short answer so the agent can tailor the workflow.";
  const options = question.options.length
    ? `\nOptions:\n${question.options
        .map((option, optionIndex) => `${optionIndex + 1}. ${option}`)
        .join("\n")}`
    : "";

  return `${header}\n${question.question}\n${responseHint}${options}`;
}

function validateQuestionAnswer(question: QuestionBlock, answer: string) {
  const trimmedAnswer = answer.trim();

  if (!trimmedAnswer && question.required) {
    return "A response is needed before the agent can continue.";
  }

  if (question.responseType !== "mcq" || !question.options.length) {
    return null;
  }

  const normalizedAnswer = normalizeChoice(trimmedAnswer);
  const directMatch = question.options.find(
    (option, index) =>
      normalizeChoice(option) === normalizedAnswer ||
      String(index + 1) === normalizedAnswer
  );

  if (!directMatch) {
    return "Pick one of the listed options so the workflow can stay precise.";
  }

  return null;
}

function buildQuestionnaireSummary(session: RuntimeSession) {
  const answerLines = session.questionAnswers.map(
    (answer, index) => `${index + 1}. ${answer.question}\nAnswer: ${answer.answer}`
  );

  return [
    "Use the user's original task and collected requirements below to continue.",
    `Original task:\n${session.taskContext || ""}`,
    answerLines.length
      ? `Collected requirements:\n${answerLines.join("\n\n")}`
      : "Collected requirements: none",
    "Proceed with deep research first, list the key points, outline the workflow, and then give the final answer or action.",
  ].join("\n\n");
}

function applyPrefilledQuestionAnswers(
  session: RuntimeSession,
  questionBlocks: QuestionBlock[],
  input: string,
  prefilledQuestionAnswers: PrefilledQuestionAnswer[]
) {
  if (!questionBlocks.length || !prefilledQuestionAnswers.length) {
    return false;
  }

  session.taskContext = input.trim();
  session.questionAnswers = questionBlocks
    .map((question, index) => {
      const answer =
        prefilledQuestionAnswers.find((item) => item.id === question.id)?.answer ||
        prefilledQuestionAnswers[index]?.answer;

      if (!String(answer || "").trim()) {
        return null;
      }

      return {
        id: question.id,
        name: question.name,
        question: question.question,
        answer: String(answer).trim(),
        responseType: question.responseType,
      };
    })
    .filter(Boolean) as RuntimeSession["questionAnswers"];

  session.pendingQuestionIndex = session.questionAnswers.length;
  session.questionsCompleted =
    session.questionAnswers.length >= questionBlocks.filter((question) => question.required).length &&
    session.questionAnswers.length > 0;

  return session.questionsCompleted;
}

function handleQuestionnaireStep(
  session: RuntimeSession,
  questionBlocks: QuestionBlock[],
  input: string
) {
  if (!questionBlocks.length || session.questionsCompleted) {
    return {
      mode: "continue" as const,
      compiledInput: input,
    };
  }

  if (!session.taskContext) {
    session.taskContext = input.trim();
    session.pendingQuestionIndex = 0;

    return {
      mode: "ask" as const,
      text: formatQuestionPrompt(questionBlocks[0], 0, questionBlocks.length),
    };
  }

  const currentQuestion = questionBlocks[session.pendingQuestionIndex];
  if (!currentQuestion) {
    session.questionsCompleted = true;
    return {
      mode: "continue" as const,
      compiledInput: buildQuestionnaireSummary(session),
    };
  }

  const validationError = validateQuestionAnswer(currentQuestion, input);
  if (validationError) {
    return {
      mode: "ask" as const,
      text: `${validationError}\n\n${formatQuestionPrompt(
        currentQuestion,
        session.pendingQuestionIndex,
        questionBlocks.length
      )}`,
    };
  }

  session.questionAnswers.push({
    id: currentQuestion.id,
    name: currentQuestion.name,
    question: currentQuestion.question,
    answer: input.trim(),
    responseType: currentQuestion.responseType,
  });
  session.pendingQuestionIndex += 1;

  if (session.pendingQuestionIndex < questionBlocks.length) {
    return {
      mode: "ask" as const,
      text: formatQuestionPrompt(
        questionBlocks[session.pendingQuestionIndex],
        session.pendingQuestionIndex,
        questionBlocks.length
      ),
    };
  }

  session.questionsCompleted = true;

  return {
    mode: "continue" as const,
    compiledInput: buildQuestionnaireSummary(session),
  };
}

export async function runAgentConversation({
  agentName,
  agentConfig,
  input,
  conversationId,
  prefilledQuestionAnswers,
}: {
  agentName: string;
  agentConfig: any;
  input: string;
  conversationId?: string | null;
  prefilledQuestionAnswers?: PrefilledQuestionAnswer[];
}) {
  const config = normalizeAgentToolConfig(agentConfig);
  const sessionId = initializeConversation(conversationId || undefined);
  const session = getSession(sessionId);

  if (
    Array.isArray(prefilledQuestionAnswers) &&
    prefilledQuestionAnswers.length &&
    !session.questionsCompleted
  ) {
    applyPrefilledQuestionAnswers(
      session,
      config.questionBlocks ?? [],
      input,
      prefilledQuestionAnswers
    );
  }

  const questionStep = handleQuestionnaireStep(
    session,
    config.questionBlocks ?? [],
    input
  );

  if (questionStep.mode === "ask") {
    return {
      text: questionStep.text,
      conversationId: sessionId,
    };
  }

  const runtimeInput = questionStep.compiledInput;
  const messages: any[] = [
    {
      role: "system",
      content: buildRuntimePrompt(agentName, config),
    },
    ...session.messages,
    {
      role: "user",
      content: runtimeInput,
    },
  ];

  const allTools = [...BUILT_IN_TOOLS, ...(config.tools ?? [])];
  const toolRegistry = new Map(allTools.map((tool) => [tool.callName, tool]));
  const tools = allTools.map((tool) => ({
    type: "function",
    function: {
      name: tool.callName,
      description: tool.description || tool.name,
      parameters: buildToolSchema(tool.parameters),
    },
  }));

  let finalText = "";

  for (let step = 0; step < 8; step += 1) {
    const assistantMessage = await ollamaChat({
      messages,
      tools: tools.length ? tools : undefined,
      model: getPreferredModel(config),
    });
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
        "I completed the workflow but did not produce a detailed response.";
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

      const toolResult = BUILT_IN_TOOLS.some(
        (tool) => tool.callName === functionCall.name
      )
        ? await executeBuiltInTool(functionCall.name, functionCall.arguments)
        : await executeExternalTool(toolConfig, functionCall.arguments);

      messages.push({
        role: "tool",
        name: functionCall.name,
        content: JSON.stringify(toolResult),
      });
    }
  }

  if (!finalText) {
    const lastAssistantMessage = [...messages]
      .reverse()
      .find((message) => message.role === "assistant" && message.content?.trim());
    finalText =
      lastAssistantMessage?.content?.trim() ||
      "I could not complete the request.";
  }

  session.messages = messages
    .filter((message) => message.role !== "system")
    .slice(-20)
    .map((message) => ({
      role: message.role,
      content: message.content || "",
      ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
      ...(message.name ? { name: message.name } : {}),
    }));

  return {
    text: finalText,
    conversationId: sessionId,
  };
}
