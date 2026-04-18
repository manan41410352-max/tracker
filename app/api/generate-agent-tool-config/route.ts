import { NextRequest, NextResponse } from "next/server";

import {
  extractQuestionBlocksFromFlowConfig,
  extractRunSetupFromFlowConfig,
} from "@/lib/agent-builder";
import { requestChatGptBuilderJson } from "@/lib/server/chatgpt-builder";

const PROMPT = `You convert a visual workflow into JSON for the runtime agent config.
Return only valid JSON.
Use this exact top-level shape:
{
  "version": 6,
  "systemPrompt": "",
  "primaryAgentName": "",
  "flow": {
    "startNode": "start",
    "flow": []
  },
  "memory": {
    "reusableByDefault": false
  },
  "runSetup": {
    "title": "Run setup",
    "description": "",
    "fields": []
  },
  "questionBlocks": [
    {
      "id": "",
      "name": "",
      "question": "",
      "responseType": "short-answer",
      "options": [],
      "memoryKey": ""
    }
  ],
  "agents": [
    {
      "id": "agent-id",
      "name": "",
      "model": "qwen3:14b-q4_K_M",
      "includeHistory": true,
      "output": "",
      "tools": ["tool-id"],
      "instruction": ""
    }
  ],
  "tools": [
    {
      "id": "tool-id",
      "name": "",
      "description": "",
      "method": "GET",
      "url": "",
      "includeApiKey": false,
      "apiKey": "",
      "parameters": {
        "query": "string"
      },
      "usage": [],
      "assignedAgent": ""
    }
  ]
}
Rules:
- The workflow should preserve any research-first structure already present in the nodes. If the first steps are about research, points, or planning, keep that order explicit in the systemPrompt and specialist instructions.
- Built-in tools for web work already exist in the runtime: web_research, internet_search, fetch_webpage, browser_visit, browser_task, and chatgpt_browser. Do not create fake API tools just for general web browsing, search, page reading, or visiting a site to extract content.
- If the workflow contains user-requirement or clarification steps, reflect that in questionBlocks, runSetup, and in the systemPrompt so the runtime collects those details before final execution.
- runSetup is the authoritative pre-run setup contract for preview and execution.
- Preserve the provided flow graph exactly in the top-level "flow" object; do not reorder or remove nodes.
- If a node's "next" field is an object, it represents named branches that should be reflected in the systemPrompt and any relevant specialist instructions.
- Keep tool parameters accurate for the HTTP method.
- Use GET for read-only APIs unless the workflow clearly needs POST.
- Every agent instruction should be practical and concise.
- Use only local models: qwen3:14b-q4_K_M, qwen3.5:35b-a3b, llama3.1:8b, qwen2.5vl:7b.
- Set the model field to qwen3:14b-q4_K_M unless the workflow explicitly needs a vision model or a dedicated recovery specialist.
- Reserve qwen3.5:35b-a3b for fallback, repair, recovery, and hard troubleshooting.
- chatgpt_browser is a slow last-resort hosted fallback through a Brave session that already has ChatGPT open. Use it only when local recovery is exhausted or when the workflow explicitly needs an attachment-aware hosted fallback.
- Always include a dedicated fallback or recovery agent that retries failures, prefers automatic recovery, and only requests manual browser takeover or chatgpt_browser after that fails.`;

const AGENT_NODE_TYPES = new Set([
  "AgentNode",
  "SignInAgentNode",
  "ResearcherAgentNode",
  "WriterAgentNode",
  "ViewerAgentNode",
  "ReviewerAgentNode",
  "ExecutorAgentNode",
]);

function buildRuntimeAgentInstruction(node: any) {
  const settings = node?.settings ?? {};
  const existingInstruction = String(
    settings.instruction || settings.instructions || ""
  ).trim();

  if (existingInstruction) {
    return existingInstruction;
  }

  const nodeType = String(node?.type || "");
  if (nodeType === "ResearcherAgentNode") {
    return "Research the task first, gather the strongest facts and constraints, and store clear notes for the rest of the workflow.";
  }

  if (nodeType === "WriterAgentNode") {
    return "Turn the available research and workflow state into a clear draft, plan, or structured answer for the next step.";
  }

  if (nodeType === "ViewerAgentNode") {
    return "Inspect the relevant website or web app, describe the page state, and capture the details the workflow needs before acting.";
  }

  if (nodeType === "ReviewerAgentNode") {
    return "Review the previous step for accuracy, completeness, and readiness before the workflow moves forward.";
  }

  if (nodeType === "ExecutorAgentNode") {
    return "Carry out the planned steps carefully, verify the result, and only request manual takeover when protected actions truly require the user.";
  }

  if (nodeType === "SignInAgentNode") {
    return "Open the target site in the signed-in user browser profile, confirm authentication state, and help the workflow resume from a valid session.";
  }

  return "Study the workflow state, research when needed, and move the task toward the next successful step.";
}

function buildRuntimeAgentTools(node: any) {
  const settings = node?.settings ?? {};
  const explicitAllowedTools = Array.isArray(settings.allowedTools)
    ? settings.allowedTools.map((tool: unknown) => String(tool || "").trim()).filter(Boolean)
    : [];

  if (explicitAllowedTools.length) {
    return explicitAllowedTools;
  }

  const nodeType = String(node?.type || "");
  if (nodeType === "ResearcherAgentNode") {
    return ["internet_search", "web_research", "fetch_webpage", "ask_agent"];
  }

  if (nodeType === "ViewerAgentNode") {
    return ["browser_visit", "browser_task", "ask_agent"];
  }

  if (nodeType === "ExecutorAgentNode") {
    return ["browser_visit", "browser_task", "internet_search", "ask_agent"];
  }

  if (nodeType === "SignInAgentNode") {
    return ["browser_visit", "browser_task"];
  }

  return ["ask_agent"];
}

function buildFallbackRuntimeConfig({
  jsonConfig,
  builderContext,
  researchNotes,
  agentName,
  questionBlocks,
  runSetup,
}: {
  jsonConfig: any;
  builderContext: string;
  researchNotes: any[];
  agentName: string;
  questionBlocks: ReturnType<typeof extractQuestionBlocksFromFlowConfig>;
  runSetup: ReturnType<typeof extractRunSetupFromFlowConfig>;
}) {
  const flowNodes = Array.isArray(jsonConfig?.flow) ? jsonConfig.flow : [];
  const agents = flowNodes
    .filter((node: any) => AGENT_NODE_TYPES.has(String(node?.type || "")))
    .map((node: any, index: number) => {
      const settings = node?.settings ?? {};

      return {
        id: String(node?.id || `agent-${index + 1}`),
        name: String(
          settings.name || node?.label || `${String(node?.type || "Agent").replace(/Node$/, "")} ${index + 1}`
        ),
        model: String(settings.model || "qwen3:14b-q4_K_M"),
        includeHistory: settings.includeHistory ?? true,
        tools: buildRuntimeAgentTools(node),
        instruction: buildRuntimeAgentInstruction(node),
      };
    });
  const tools = flowNodes
    .filter((node: any) => String(node?.type || "") === "ApiNode")
    .map((node: any, index: number) => {
      const settings = node?.settings ?? {};
      return {
        id: String(node?.id || `tool-${index + 1}`),
        name: String(settings.name || node?.label || `API Tool ${index + 1}`),
        description: `Call ${String(settings.name || node?.label || "the configured API step")} from the workflow.`,
        method: String(settings.method || "GET").toUpperCase() === "POST" ? "POST" : "GET",
        url: String(settings.url || ""),
        includeApiKey: Boolean(settings.includeApiKey),
        apiKey: String(settings.apiKey || ""),
        parameters:
          typeof settings.bodyparams === "object" && settings.bodyparams
            ? Object.fromEntries(
                Object.keys(settings.bodyparams).map((key) => [key, "string"])
              )
            : {},
        assignedAgent: undefined,
      };
    })
    .filter((tool: { url: string }) => Boolean(tool.url));
  const researchSummary = Array.isArray(researchNotes)
    ? researchNotes
        .map((note: any) => String(note?.title || note?.point || "").trim())
        .filter(Boolean)
        .slice(0, 3)
        .join(", ")
    : "";
  const systemPrompt = [
    "Research the task first, use any run setup answers and reusable memory, then execute the workflow step by step.",
    builderContext ? `Builder context: ${builderContext}` : "",
    researchSummary ? `Existing research focus: ${researchSummary}` : "",
    questionBlocks.length
      ? "Collect the required question and form inputs before the execution steps depend on them."
      : "",
    "Use automatic recovery first. Request manual browser takeover only for login, payment, OTP, CAPTCHA, or other protected actions the user must finish personally.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    version: 6,
    systemPrompt,
    primaryAgentName: agentName || "Systematic Tracker",
    flow: jsonConfig,
    memory: {
      reusableByDefault: false,
    },
    questionBlocks,
    runSetup,
    agents: ensureFallbackAgent(agents),
    tools,
    executionPolicy: {
      webSearchMode: "always_on" as const,
      builderResearchDepth: "aggressive" as const,
      autoRewriteRecoveredBrowserFailures: true,
      browserFailureMemoryKey: "browser_failure_playbook",
    },
  };
}

function ensureFallbackAgent(agents: any[]) {
  const safeAgents = Array.isArray(agents) ? agents : [];
  const hasFallbackAgent = safeAgents.some(
    (agent) =>
      /fallback|recovery|resolver/i.test(String(agent?.name || "")) ||
      /fallback|recover|manual browser/i.test(
        `${String(agent?.instruction || "")} ${String(agent?.instructions || "")}`
      )
  );

  if (hasFallbackAgent) {
    return safeAgents;
  }

  return [
    ...safeAgents,
    {
      id: "fallback-recovery-agent",
      name: "Fallback Recovery Agent",
      model: "qwen3.5:35b-a3b",
      includeHistory: true,
      tools: ["browser_visit", "browser_task", "chatgpt_browser"],
      instruction:
        "Recover browser, API, or tool failures. Repair or re-plan the next command for qwen3:14b-q4_K_M, retry with the best available step, patch workflow state when safe, and when recovery succeeds let the ChatGPT proxy evolve the workflow permanently by rewriting the node instruction or inserting a helper recovery guard node. Only use chatgpt_browser or manual browser takeover after automatic local recovery is exhausted.",
    },
  ];
}

export async function POST(req: NextRequest) {
  try {
    const { jsonConfig, builderContext, researchNotes, agentName } = await req.json();
    const questionBlocks = extractQuestionBlocksFromFlowConfig(jsonConfig);
    const runSetup = extractRunSetupFromFlowConfig(jsonConfig);
    const fallbackConfig = buildFallbackRuntimeConfig({
      jsonConfig,
      builderContext: String(builderContext || ""),
      researchNotes: Array.isArray(researchNotes) ? researchNotes : [],
      agentName: String(agentName || ""),
      questionBlocks,
      runSetup,
    });
    let parsed: any = null;

    try {
      parsed = await requestChatGptBuilderJson<any>({
        action: "convert the workflow into runtime config",
        prompt: `${PROMPT}\n\nTracker name:\n${agentName || "Systematic Tracker"}\n\nBuilder context:\n${builderContext || "None"}\n\nEditable research notes:\n${JSON.stringify(
          Array.isArray(researchNotes) ? researchNotes : [],
          null,
          2
        )}\n\nWorkflow:\n${JSON.stringify(jsonConfig, null, 2)}`
      });
    } catch (error) {
      console.warn(
        "ChatGPT runtime-config generation failed, using deterministic fallback.",
        error
      );
    }

    return NextResponse.json({
      ...fallbackConfig,
      ...(parsed && typeof parsed === "object" ? parsed : {}),
      version: 6,
      systemPrompt: String(parsed?.systemPrompt || fallbackConfig.systemPrompt || ""),
      primaryAgentName: String(
        parsed?.primaryAgentName || fallbackConfig.primaryAgentName || agentName || "Systematic Tracker"
      ),
      flow: jsonConfig,
      memory: {
        ...fallbackConfig.memory,
        ...(parsed?.memory && typeof parsed.memory === "object" ? parsed.memory : {}),
      },
      questionBlocks,
      runSetup,
      agents: ensureFallbackAgent(
        Array.isArray(parsed?.agents) && parsed.agents.length
          ? parsed.agents
          : fallbackConfig.agents
      ),
      tools:
        Array.isArray(parsed?.tools) && parsed.tools.length
          ? parsed.tools
          : fallbackConfig.tools,
      executionPolicy:
        parsed?.executionPolicy && typeof parsed.executionPolicy === "object"
          ? {
              ...fallbackConfig.executionPolicy,
              ...parsed.executionPolicy,
            }
          : fallbackConfig.executionPolicy,
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        error:
          details ||
          "Unable to convert the workflow into runtime config through the ChatGPT builder proxy.",
        details,
      },
      { status: 503 }
    );
  }
}
