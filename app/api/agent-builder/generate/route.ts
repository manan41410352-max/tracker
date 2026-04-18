import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  buildExecutionPlanFromFlowConfig,
  buildCanvasGraphFromBlueprint,
  buildFlowConfigFromCanvas,
  normalizePreviewPromptList,
  normalizeResearchPoints,
} from "@/lib/agent-builder";
import {
  buildTrackerMemoryContext,
  buildTrackerMemoryTimelineContext,
  buildTrackerWorkflowBlueprint,
  isTrackerWorkflowRequest,
  layoutTrackerCanvasGraph,
} from "@/lib/tracker-workflow";
import { requestChatGptBuilderJson } from "@/lib/server/chatgpt-builder";
import {
  analyzeAssistantUploads,
  parseJsonFormValue,
} from "@/lib/server/tracker-assistant-intelligence";
import { researchInternet } from "@/lib/web-tools";

export const runtime = "nodejs";

const BlueprintNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "AgentNode",
    "ApiNode",
    "IfElseNode",
    "WhileNode",
    "UserApprovalNode",
    "QuestionNode",
    "FormNode",
    "CaptchaNode",
    "SignInAgentNode",
    "ResearcherAgentNode",
    "WriterAgentNode",
    "ViewerAgentNode",
    "ReviewerAgentNode",
    "ExecutorAgentNode",
    "EndNode",
  ]),
  label: z.string().min(1),
  settings: z.record(z.any()).optional(),
});

const GeneratedPlanSchema = z.object({
  agentName: z.string().min(1).max(80),
  systemPrompt: z.string().min(1),
  assistantMessage: z.string().min(1).optional(),
  research: z
    .array(
      z.object({
        title: z.string().min(1),
        point: z.string().min(1),
        whyItMatters: z.string().optional(),
      })
    )
    .min(3)
    .max(8),
  workflow: z.object({
    nodes: z.array(BlueprintNodeSchema).min(2).max(9),
    edges: z
      .array(
        z.object({
          source: z.string().min(1),
          target: z.string().min(1),
          sourceHandle: z.string().optional(),
        })
      )
      .min(1)
      .max(12),
  }),
  executionPlan: z.array(z.string().min(1)).max(8).optional(),
  previewPrompts: z.array(z.string().min(1)).min(2).max(4).optional(),
});

function normalizeResearch(rawResearch: any, prompt: string) {
  const normalized = normalizeResearchPoints(rawResearch).map((item) => ({
    title: String(item.title || "Research point").trim(),
    point: String(item.point || item.whyItMatters || prompt).trim(),
    whyItMatters: item.whyItMatters ? String(item.whyItMatters).trim() : undefined,
  }));

  const fallbacks = [
    {
      title: "Goal clarity",
      point: "Clarify the outcome, scope, and success criteria before execution starts.",
      whyItMatters: "The workflow needs a stable target.",
    },
    {
      title: "Evidence gathering",
      point: "Collect the strongest signals, inputs, or facts required to do the task well.",
      whyItMatters: "This keeps the workflow research-first.",
    },
    {
      title: "Execution planning",
      point: "Turn the research into a short ordered plan before the agent answers or acts.",
      whyItMatters: "The user asked for points first and workflow second.",
    },
  ];

  while (normalized.length < 3) {
    normalized.push(fallbacks[normalized.length]);
  }

  return normalized.slice(0, 8);
}

function normalizePreviewPrompts(rawPrompts: any, trackerMode = false) {
  const normalized = normalizePreviewPromptList(rawPrompts, 4);

  const fallbacks = trackerMode
    ? [
        "I slept 8 hours, my energy is 7/10, and I need a timetable for today's work and errands.",
        "Use my previous check-ins plus today's tasks to suggest the best next action and build a realistic day plan.",
      ]
    : [
        "Research the task, list the key points, and tell me the workflow you would follow.",
        "Show the evidence you gathered, then explain the next best action.",
      ];

  while (normalized.length < 2) {
    normalized.push(fallbacks[normalized.length]);
  }

  return normalized.slice(0, 4);
}

function normalizeExecutionPlan(rawPlan: any, flowConfig: any) {
  const normalized = Array.isArray(rawPlan)
    ? rawPlan
        .filter((item) => typeof item === "string" && item.trim())
        .map((item) => item.trim())
    : [];

  if (normalized.length >= 3) {
    return normalized.slice(0, 8);
  }

  return buildExecutionPlanFromFlowConfig(flowConfig).slice(0, 8);
}

function createWebsiteStartBlueprintNode() {
  return {
    id: "website-start",
    type: "AgentNode" as const,
    label: "Website Start",
    settings: {
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
    },
  };
}

const BROWSER_WORKFLOW_NODE_TYPES = new Set([
  "ViewerAgentNode",
  "ExecutorAgentNode",
  "SignInAgentNode",
]);

function ensureWebsiteStartStep(workflow: any) {
  const safeWorkflow =
    workflow && typeof workflow === "object"
      ? workflow
      : { nodes: [], edges: [] };
  const nodes = Array.isArray(safeWorkflow.nodes) ? [...safeWorkflow.nodes] : [];
  const edges = Array.isArray(safeWorkflow.edges) ? [...safeWorkflow.edges] : [];
  if (!nodes.some((node) => BROWSER_WORKFLOW_NODE_TYPES.has(String(node?.type || "")))) {
    return {
      nodes,
      edges,
    };
  }
  const incomingTargets = new Set(
    edges.map((edge) => String(edge?.target || "")).filter(Boolean)
  );
  const entryNodes = nodes.filter(
    (node) =>
      node?.id &&
      node?.type !== "EndNode" &&
      !incomingTargets.has(String(node.id))
  );
  const existingStartNode = nodes.find(
    (node) =>
      node?.settings?.websiteDiscovery ||
      /website start|start site/i.test(
        String(node?.label || node?.settings?.name || "")
      )
  );

  if (existingStartNode) {
    const startDefaults = createWebsiteStartBlueprintNode().settings;
    existingStartNode.type = "AgentNode";
    existingStartNode.label = "Website Start";
    existingStartNode.settings = {
      ...(existingStartNode.settings || {}),
      name: "Website Start",
      instruction:
        String(existingStartNode.settings?.instruction || "").trim() ||
        String(startDefaults.instruction),
      output: "json",
      schema: startDefaults.schema,
      websiteDiscovery: true,
      autoOpenDiscoveredSite: true,
      rememberDiscoveredUrl: true,
      discoveredUrlMemoryKey: "preview_default_url",
      preferredBrowserProfile:
        existingStartNode.settings?.preferredBrowserProfile || "auto",
      browserProfileMemoryKey: "preview_browser_profile",
      reuseSignedInSession:
        existingStartNode.settings?.reuseSignedInSession ?? true,
    };

    return {
      nodes,
      edges,
    };
  }

  const websiteStartNode = createWebsiteStartBlueprintNode();

  return {
    nodes: [websiteStartNode, ...nodes],
    edges: [
      ...entryNodes.map((node) => ({
        source: websiteStartNode.id,
        target: String(node.id),
      })),
      ...edges,
    ],
  };
}

function summarizeForFallback(value: string, maxLength = 220) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.length > maxLength
    ? `${trimmed.slice(0, maxLength).trim()}...`
    : trimmed;
}

function looksLikeBrowserWorkflow(...values: string[]) {
  const combined = values.join("\n");
  return /(https?:\/\/|www\.|gmail|inbox|dashboard|portal|website|web app|browser|login|sign in|checkout|booking|book|navigate|scrape|crawl|page|tab)/i.test(
    combined
  );
}

function isHighRiskBrowserWorkflow(...values: string[]) {
  const combined = values.join("\n");
  return /(captcha|otp|verification|verify|payment|checkout|login|sign in|booking|book)/i.test(
    combined
  );
}

function buildDeterministicWorkflowBlueprint({
  browserMode,
  riskyBrowserMode,
}: {
  browserMode: boolean;
  riskyBrowserMode: boolean;
}) {
  if (!browserMode) {
    return {
      nodes: [
        {
          id: "research",
          type: "ResearcherAgentNode" as const,
          label: "Research Task",
          settings: {
            name: "Research Task",
            instruction:
              "Study the user's goal, clarification answers, saved memory, uploaded file context, and any research already available. Return the strongest facts, constraints, risks, and success criteria that should shape the workflow.",
            includeHistory: true,
            model: "qwen3:14b-q4_K_M",
            output: "text",
          },
        },
        {
          id: "plan",
          type: "WriterAgentNode" as const,
          label: "Plan Workflow",
          settings: {
            name: "Plan Workflow",
            instruction:
              "Turn the research into a short ordered plan, call out the key remembered inputs, and prepare the final workflow state the user should see.",
            includeHistory: true,
            model: "qwen3:14b-q4_K_M",
            output: "text",
          },
        },
        {
          id: "deliver",
          type: "ReviewerAgentNode" as const,
          label: "Finalize Response",
          settings: {
            name: "Finalize Response",
            instruction:
              "Review the plan for completeness and then package the final answer, recommendation, or next-step guidance clearly for the user.",
            includeHistory: true,
            model: "qwen3:14b-q4_K_M",
            output: "text",
          },
        },
        {
          id: "finish",
          type: "EndNode" as const,
          label: "Complete",
          settings: {
            schema:
              '{ "response": "string", "researchPoints": ["string"], "workflow": ["string"] }',
          },
        },
      ],
      edges: [
        { source: "research", target: "plan" },
        { source: "plan", target: "deliver" },
        { source: "deliver", target: "finish" },
      ],
    };
  }

  const nodes: Array<{
    id: string;
    type:
      | "ResearcherAgentNode"
      | "ViewerAgentNode"
      | "CaptchaNode"
      | "ExecutorAgentNode"
      | "EndNode";
    label: string;
    settings: Record<string, any>;
  }> = [
    {
      id: "research",
      type: "ResearcherAgentNode",
      label: "Research Task",
      settings: {
        name: "Research Task",
        instruction:
          "Study the user's goal, clarification answers, saved memory, uploaded file context, and any research already available. Identify the right site or app, the key constraints, and the safest path before any browser action begins.",
        includeHistory: true,
        model: "qwen3:14b-q4_K_M",
        output: "text",
      },
    },
    {
      id: "inspect",
      type: "ViewerAgentNode",
      label: "Inspect Site",
      settings: {
        name: "Inspect Site",
        instruction:
          "Open the best matching website or web app for the task, confirm the current page state, and describe the exact next browser steps needed to complete the job.",
        includeHistory: true,
        model: "qwen3:14b-q4_K_M",
        output: "text",
        reuseSignedInSession: true,
      },
    },
  ];
  const edges: Array<{ source: string; target: string }> = [
    { source: "research", target: "inspect" },
  ];
  let previousNodeId = "inspect";

  if (riskyBrowserMode) {
    nodes.push({
      id: "verification-guard",
      type: "CaptchaNode",
      label: "Verification Guard",
      settings: {
        name: "Verification Guard",
        message:
          "If a CAPTCHA, OTP wall, payment confirmation, or human verification appears, pause cleanly and wait for the user to finish it before resuming.",
        pauseWithoutBrowser: false,
        pauseOnAnyVerification: true,
      },
    });
    edges.push({ source: previousNodeId, target: "verification-guard" });
    previousNodeId = "verification-guard";
  }

  nodes.push(
    {
      id: "execute",
      type: "ExecutorAgentNode",
      label: "Execute Steps",
      settings: {
        name: "Execute Steps",
        instruction:
          "Carry out the planned browser steps carefully, verify the result after each major action, and only ask for manual takeover when login, OTP, payment, or CAPTCHA truly requires the user.",
        includeHistory: true,
        model: "qwen3:14b-q4_K_M",
        output: "text",
        reuseSignedInSession: true,
      },
    },
    {
      id: "finish",
      type: "EndNode",
      label: "Complete",
      settings: {
        schema:
          '{ "response": "string", "researchPoints": ["string"], "workflow": ["string"] }',
      },
    }
  );
  edges.push({ source: previousNodeId, target: "execute" });
  edges.push({ source: "execute", target: "finish" });

  return {
    nodes,
    edges,
  };
}

function buildDeterministicGeneratedPlan({
  prompt,
  agentName,
  clarificationAnswers,
  answersText,
  assistantContext,
  existingResearch,
  trackerMode,
}: {
  prompt: string;
  agentName?: string;
  clarificationAnswers: any[];
  answersText: string;
  assistantContext: string;
  existingResearch: any[];
  trackerMode: boolean;
}) {
  const browserMode = !trackerMode
    ? looksLikeBrowserWorkflow(prompt, answersText, assistantContext)
    : false;
  const riskyBrowserMode = browserMode
    ? isHighRiskBrowserWorkflow(prompt, answersText, assistantContext)
    : false;
  const shortPrompt = summarizeForFallback(prompt, 140) || "this workflow";
  const seededResearch = [
    {
      title: "Goal focus",
      point: summarizeForFallback(prompt, 260) || "The user needs a workflow that can research, plan, and respond clearly.",
      whyItMatters: "This keeps the fallback workflow tied to the requested outcome.",
    },
    ...(answersText !== "No clarification answers supplied."
      ? [
          {
            title: "Clarified requirements",
            point: summarizeForFallback(answersText, 260),
            whyItMatters: "The popup answers should shape the generated workflow.",
          },
        ]
      : []),
    ...(assistantContext
      ? [
          {
            title: "Uploaded file context",
            point: summarizeForFallback(assistantContext, 260),
            whyItMatters: "Uploaded files should still influence the workflow even in fallback mode.",
          },
        ]
      : []),
    {
      title: browserMode ? "Browser execution path" : "Execution path",
      point: browserMode
        ? "Research first, confirm the start site, inspect browser state, then execute carefully with a clean verification handoff when needed."
        : "Research first, turn the findings into a short plan, then deliver a checked final response.",
      whyItMatters: "This preserves the builder's research-first workflow structure.",
    },
  ];
  const workflow = trackerMode
    ? buildTrackerWorkflowBlueprint({
        prompt,
        clarificationAnswers,
      })
    : buildDeterministicWorkflowBlueprint({
        browserMode,
        riskyBrowserMode,
      });

  return {
    agentName:
      String(agentName || "").trim() ||
      (trackerMode
        ? "Tracker Workflow Assistant"
        : browserMode
          ? "Browser Workflow Assistant"
          : "Research Workflow Assistant"),
    assistantMessage: trackerMode
      ? "The hosted builder was unavailable, so I assembled a local tracker workflow that still uses your context, prior memory, and timetable structure."
      : browserMode
        ? "The hosted builder was unavailable, so I assembled a local recovery workflow that still researches the task, inspects the target site, and prepares safe execution."
        : "The hosted builder was unavailable, so I assembled a local recovery workflow that still researches the task, plans the next steps, and keeps the canvas editable.",
    systemPrompt: trackerMode
      ? "Read today's check-in and reusable memory first, use the recent memory timeline as prior history, analyze the selected life areas, and finish by generating timetable JSON."
      : browserMode
        ? "Research the task first, use the user's answers, uploaded file context, and saved memory to identify the right site, inspect browser state, plan the steps, and only then execute. Ask for manual takeover only for login, OTP, payment, or CAPTCHA."
        : "Research the task first, use the user's answers, uploaded file context, and saved memory to clarify constraints, turn the research into a short plan, and only then deliver the final result.",
    research: normalizeResearch(
      [...(Array.isArray(existingResearch) ? existingResearch : []), ...seededResearch],
      prompt
    ),
    workflow,
    executionPlan: trackerMode
      ? [
          "Read the latest check-in, reusable memory, and recent timeline.",
          "Analyze the relevant life areas and fixed commitments.",
          "Build a realistic timetable and next-action guidance.",
        ]
      : browserMode
        ? [
            "Research the goal, constraints, and target site.",
            "Inspect the browser starting point and confirm page state.",
            "Execute the safest next browser steps and verify the result.",
          ]
        : [
            "Research the task and collect the strongest facts and constraints.",
            "Turn the findings into a practical workflow plan.",
            "Review and deliver the final result clearly.",
          ],
    previewPrompts: normalizePreviewPrompts(
      trackerMode
        ? []
        : browserMode
          ? [
              `Use the workflow to complete: ${shortPrompt}`,
              `Inspect the target site, explain the plan, and carry out the next safe step for: ${shortPrompt}`,
            ]
          : [
              `Research and plan this request: ${shortPrompt}`,
              `Explain the key points and next best action for: ${shortPrompt}`,
            ],
      trackerMode
    ),
  };
}

const PROMPT = `You are an expert AI workflow architect.
You must do deep research first, summarize the key points, and only then design the workflow.
Return only valid JSON matching this exact shape:
{
  "agentName": "",
  "assistantMessage": "",
  "systemPrompt": "",
  "research": [
    {
      "title": "",
      "point": "",
      "whyItMatters": ""
    }
  ],
  "workflow": {
    "nodes": [
      {
        "id": "",
        "type": "ResearcherAgentNode",
        "label": "",
        "settings": {}
      }
    ],
    "edges": [
      {
        "source": "",
        "target": "",
        "sourceHandle": "if"
      }
    ]
  },
  "executionPlan": ["", ""],
  "previewPrompts": ["", ""]
}

Requirements:
- Research must come first. The workflow should begin with a deep-research step, then a planning/synthesis step, then execution or delivery.
- The platform supports planning, problem-solving, decision support, automation, scripting, research, browsing, and creative collaboration. Only add browser or API steps when they materially help the result.
- Treat uploaded raw files and extracted file intelligence as first-class workflow inputs. If the files already reveal constraints, schedules, categories, or formats, preserve that structure in the generated questions, forms, and runtime setup.
- If the task is ambiguous or needs user preferences, insert a QuestionNode or FormNode before or between research/planning steps.
- When the task already implies concrete structured inputs, prefer one FormNode that captures them all at once.
- Always include at least two agent steps before the final EndNode.
- If the task depends on browsing, web apps, inboxes, or dashboards, use a ViewerAgentNode or ExecutorAgentNode for the browser work.
- If a browser workflow is likely to hit a CAPTCHA or human verification wall, insert a CaptchaNode after the risky browser step so the run can pause cleanly and wait for the user to finish the challenge in the browser workspace.
- If the task is about daily planning, sleep, energy, focus, errands, or a personal tracker workflow, bias toward a Daily Check-in form, selected life-area analysis blocks, a Google connector placeholder form, and a timetable-planning final node.

## Node Types — Use the most specific type for each step:

### AgentNode
General-purpose node for steps that do not fit a more specific role.
Settings: name, instruction, includeHistory, model, output, schema
Default model: qwen3:14b-q4_K_M

### ResearcherAgentNode
Use for all research and evidence-gathering steps. Searches the web, fetches pages, compiles findings.
Do NOT give it browser navigation tasks — use ViewerAgentNode for that.
Settings: name, instruction, includeHistory, model, output, schema
Example instruction: "Research the latest trends in renewable energy. Compile sources, key statistics, and expert quotes."
Tools available: internet_search, web_research, fetch_webpage, ask_agent

### WriterAgentNode
Use for drafting, generating, or formatting content from research already in the workflow state.
Do NOT give it web search tasks — it should work from the state only.
Settings: name, instruction, includeHistory, model, output, schema
Example instruction: "Using the research from the previous step, write a 500-word executive summary."
Tools available: ask_agent

### ViewerAgentNode
Use for reading browser pages, extracting data, observing UI state.
Use browser_visit for direct page opens. Use browser_task for multi-step navigation.
Settings: name, instruction, includeHistory, model, output, schema, reuseSignedInSession
Example instruction: "Open the Gmail inbox, read the last 5 unread emails, and return their subjects and senders."
Tools available: browser_visit, browser_task, ask_agent

### ReviewerAgentNode
Use to validate, critique, or fact-check the outputs of previous steps.
Settings: name, instruction, includeHistory, model, output, schema
Example instruction: "Review the draft from the Writer step. Check for clarity, accuracy, and alignment with the task goal. List any issues."
Tools available: ask_agent

### ExecutorAgentNode
Use for carrying out planned actions: form submissions, clicks, browser automation, API calls.
Run AFTER a plan has been established in a previous step.
Settings: name, instruction, includeHistory, model, output, schema, reuseSignedInSession
Example instruction: "Execute the browser plan: open the checkout page, fill in the form, and confirm the order."
Tools available: browser_visit, browser_task, internet_search, ask_agent

### SignInAgentNode
Use before browser steps that require an authenticated session.
Settings: name, instruction, model
Automatically opens the site in the signed-in user browser profile.

### ApiNode
Use when the workflow needs external APIs, integrations, or fresh external data.
Settings: name, method, url, includeApiKey, apiKey, bodyparams

### IfElseNode
Settings: ifCondition

### WhileNode
Settings: whileCondition

### UserApprovalNode
For actions that are risky, irreversible, or need human sign-off.
Settings: name, message

### QuestionNode
For gathering a single user input.
Settings: name, question, responseType ("short-answer" or "mcq"), options, required

### FormNode
For gathering multiple inputs at once.
Settings: name, description, submitLabel, fields
Each field: id, label, type ("short-text" | "long-text" | "single-select" | "multi-select" | "number" | "url"), required, options, placeholder, memoryKey, reusable

### CaptchaNode
For browser workflows that may pause on CAPTCHA or human verification.
Settings: name, message, pauseWithoutBrowser, pauseOnAnyVerification
This node does not solve challenges. It checks the current browser page and pauses the workflow so the user can finish verification manually, then resume.

### EndNode
Settings: schema

## Graph Rules:
- Keep the graph compact: 3 to 9 nodes total.
- Preferred pattern: ResearcherAgentNode → WriterAgentNode or ReviewerAgentNode → ExecutorAgentNode → EndNode
- For browser workflows: ViewerAgentNode → CaptchaNode (when needed) → ExecutorAgentNode → EndNode
- Default every agent node to qwen3:14b-q4_K_M.
- Reserve qwen3.5:35b-a3b for fallback, review, and hard rescue steps only.

## If the task depends on browsing a dynamic site (Gmail, dashboard, web app, portal):
- Make the first step a ViewerAgentNode with websiteDiscovery: true to discover the URL automatically.
- Add the following settings to that node:
  websiteDiscovery: true
  autoOpenDiscoveredSite: true
  rememberDiscoveredUrl: true
  discoveredUrlMemoryKey: "preview_default_url"
  preferredBrowserProfile: "auto"
  browserProfileMemoryKey: "preview_browser_profile"
  reuseSignedInSession: true

## ask_agent tool:
- Any node can call ask_agent(agentRole, question) to delegate a sub-task to another specialized agent.
- ResearcherAgentNode can be called by Writer or Reviewer nodes to fetch additional facts mid-step.
- Executor can ask Viewer to read a page before acting.

- assistantMessage should sound like a chatbot explaining what the workflow does and why this structure was chosen.
- executionPlan should be a short ordered list from research through delivery.
- previewPrompts should be realistic test prompts for the agent.
- Do not generate duplicate research points or prompts.
- systemPrompt must instruct research first, planning second, execution third.
- Do not mention OpenAI, pricing, login, or SaaS onboarding.
- Return JSON only.`;

async function readGenerateRequest(req: NextRequest) {
  const contentType = String(req.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();

    return {
      prompt: String(formData.get("prompt") || ""),
      agentName: String(formData.get("agentName") || ""),
      clarificationAnswers: parseJsonFormValue<any[]>(
        formData.get("clarificationAnswers"),
        []
      ),
      builderMemory: parseJsonFormValue<any[]>(formData.get("builderMemory"), []),
      agentMemory: parseJsonFormValue<any[]>(formData.get("agentMemory"), []),
      agentMemoryTimeline: parseJsonFormValue<any[]>(
        formData.get("agentMemoryTimeline"),
        []
      ),
      existingFlowConfig: parseJsonFormValue<any>(
        formData.get("existingFlowConfig"),
        null
      ),
      existingResearch: parseJsonFormValue<any[]>(formData.get("existingResearch"), []),
      assistantFiles: formData
        .getAll("assistantFiles")
        .filter((entry): entry is File => entry instanceof File),
    };
  }

  const json = await req.json();
  return {
    ...json,
    assistantFiles: [],
  };
}

export async function POST(req: NextRequest) {
  try {
    const {
      prompt,
      agentName,
      clarificationAnswers,
      builderMemory,
      agentMemory,
      agentMemoryTimeline,
      existingFlowConfig,
      existingResearch,
      assistantFiles,
    } = await readGenerateRequest(req);

    if (!prompt || !String(prompt).trim()) {
      return NextResponse.json(
        { error: "Add some task context before building the workflow." },
        { status: 400 }
      );
    }

    const assistantUploadIntelligence = await analyzeAssistantUploads({
      prompt: String(prompt).trim(),
      files: Array.isArray(assistantFiles) ? assistantFiles : [],
    });
    const mergedBuilderMemory = [
      ...(Array.isArray(builderMemory) ? builderMemory : []),
      ...assistantUploadIntelligence.builderMemoryEntries,
    ];

    const answersText = Array.isArray(clarificationAnswers)
      ? clarificationAnswers
          .map(
            (answer: any, index: number) =>
              `${index + 1}. ${answer?.label || answer?.question || "Question"}: ${answer?.answer || ""}`
          )
          .join("\n")
      : "No clarification answers supplied.";

    const memoryText = Array.isArray(mergedBuilderMemory)
      ? mergedBuilderMemory
          .map((entry: any) => `${entry?.label || entry?.key || "Memory"}: ${entry?.value || ""}`)
          .filter(Boolean)
          .join("\n")
      : "No saved builder memory yet.";
    const agentMemoryText = buildTrackerMemoryContext(
      Array.isArray(agentMemory) ? agentMemory : []
    );
    const agentMemoryTimelineText = buildTrackerMemoryTimelineContext(
      Array.isArray(agentMemoryTimeline) ? agentMemoryTimeline : []
    );
    const trackerMode = isTrackerWorkflowRequest(
      String(prompt).trim(),
      answersText,
      agentMemoryText,
      assistantUploadIntelligence.assistantContext
    );

    const researchText = Array.isArray(existingResearch) && existingResearch.length > 0
      ? existingResearch
          .map(
            (item: any, index: number) =>
              `${index + 1}. ${item?.title || "Point"}: ${item?.point || ""} ${
                item?.whyItMatters ? `(Why it matters: ${item.whyItMatters})` : ""
              }`
          )
          .join("\n")
      : "No existing research notes yet.";

    let realTimeResearchContext = "";
    if (!Array.isArray(existingResearch) || existingResearch.length === 0) {
      try {
        const researchQuery = `${String(prompt).trim()} ${answersText !== "No clarification answers supplied." ? clarificationAnswers.map((a: any) => a?.answer).join(" ") : ""}`.slice(0, 120);
        const externalResearch = await researchInternet(researchQuery, 5);
        if (externalResearch.ok && externalResearch.summary) {
          realTimeResearchContext = `\n\nReal-time web research findings for context:\n${externalResearch.summary}\nCandidate URLs from search to consider as start points:\n${externalResearch.results.map(r => r.url).join("\n")}`;
        }
      } catch (err) {
        // ignore web search fail
      }
    }

    const fullPrompt = `${PROMPT}

Existing agent name: ${agentName || "New local agent"}

User task and context:
${String(prompt).trim()}

Clarification answers:
${answersText}

Saved builder memory:
${memoryText}

Persisted agent memory:
${agentMemoryText}

Recent memory timeline:
${agentMemoryTimelineText}

Uploaded file intelligence:
${assistantUploadIntelligence.assistantContext || "No uploaded files were provided."}

Per-file notes:
${assistantUploadIntelligence.fileSummaries.length
  ? assistantUploadIntelligence.fileSummaries
      .map(
        (item, index) =>
          `${index + 1}. ${item.fileName}: ${item.summary}${
            item.usefulFacts.length ? `\nFacts: ${item.usefulFacts.join("; ")}` : ""
          }`
      )
      .join("\n")
  : "No per-file notes."}

Existing research notes (combine with real-time if taking action):
${researchText}${realTimeResearchContext}

Raw uploaded files are attached to this request. Use both the attachments and the extracted file intelligence when deciding what the workflow should ask, remember, or prefill.

Tracker mode:
${trackerMode ? "Yes. Favor a daily planning workflow that uses prior check-ins and ends with a timetable planner." : "No."}

Existing workflow JSON:
${existingFlowConfig ? JSON.stringify(existingFlowConfig, null, 2) : "No existing workflow yet."}`;

    const fallbackPlan = buildDeterministicGeneratedPlan({
      prompt: String(prompt).trim(),
      agentName: String(agentName || ""),
      clarificationAnswers: Array.isArray(clarificationAnswers)
        ? clarificationAnswers
        : [],
      answersText,
      assistantContext: assistantUploadIntelligence.assistantContext,
      existingResearch: Array.isArray(existingResearch) ? existingResearch : [],
      trackerMode,
    });
    let rawPlan: any = null;

    try {
      rawPlan = await requestChatGptBuilderJson<any>({
        prompt: fullPrompt,
        action: "build the workflow",
        attachments: assistantUploadIntelligence.attachmentPaths,
      });
    } catch (error) {
      console.warn("ChatGPT builder generate failed, using deterministic fallback.", error);
    }

    const trackerWorkflow = trackerMode
      ? buildTrackerWorkflowBlueprint({
          prompt: String(prompt).trim(),
          clarificationAnswers: Array.isArray(clarificationAnswers)
            ? clarificationAnswers
            : [],
        })
      : null;
    const nextWorkflow = trackerWorkflow
      ? {
          nodes: trackerWorkflow.nodes,
          edges: trackerWorkflow.edges,
        }
      : ensureWebsiteStartStep(rawPlan?.workflow || fallbackPlan.workflow);
    const safeFallbackWorkflow = trackerWorkflow
      ? {
          nodes: trackerWorkflow.nodes,
          edges: trackerWorkflow.edges,
        }
      : ensureWebsiteStartStep(fallbackPlan.workflow);
    let parsed;

    try {
      parsed = GeneratedPlanSchema.parse({
        ...(rawPlan && typeof rawPlan === "object" ? rawPlan : fallbackPlan),
        workflow: nextWorkflow,
        agentName:
          rawPlan?.agentName || fallbackPlan.agentName || agentName || "Research Workflow Agent",
        assistantMessage:
          rawPlan?.assistantMessage ||
          fallbackPlan.assistantMessage ||
          (trackerMode
            ? "I turned this into a tracker workflow with a daily check-in, reusable Google placeholders, targeted life-area analysis blocks, and a timetable planner at the end."
            : "I researched the request, pulled out the critical details, and turned them into a workflow you can keep editing."),
        systemPrompt:
          rawPlan?.systemPrompt ||
          fallbackPlan.systemPrompt ||
          (trackerMode
            ? "Read today's check-in and reusable memory first, use the recent memory timeline as prior history, analyze the selected life areas, and finish by generating timetable JSON."
            : "Research the task first, list the important points, create the workflow plan, and only then execute or answer."),
        research: normalizeResearch(
          rawPlan?.research || fallbackPlan.research,
          String(prompt).trim()
        ),
        previewPrompts: normalizePreviewPrompts(
          rawPlan?.previewPrompts || fallbackPlan.previewPrompts,
          trackerMode
        ),
      });
    } catch (error) {
      console.warn("Generated plan validation failed, using deterministic fallback.", error);
      parsed = GeneratedPlanSchema.parse({
        ...fallbackPlan,
        workflow: safeFallbackWorkflow,
        research: normalizeResearch(fallbackPlan.research, String(prompt).trim()),
        previewPrompts: normalizePreviewPrompts(
          fallbackPlan.previewPrompts,
          trackerMode
        ),
      });
    }
    let canvas = buildCanvasGraphFromBlueprint(
      parsed.workflow.nodes,
      parsed.workflow.edges
    );
    if (trackerMode) {
      canvas = layoutTrackerCanvasGraph(canvas);
    }
    const flowConfig = buildFlowConfigFromCanvas(canvas.nodes, canvas.edges);
    const executionPlan = normalizeExecutionPlan(parsed.executionPlan, flowConfig);

    return NextResponse.json({
      agentName: parsed.agentName,
      assistantMessage: parsed.assistantMessage,
      systemPrompt: parsed.systemPrompt,
      research: parsed.research,
      executionPlan,
      previewPrompts: parsed.previewPrompts ?? [],
      autoMemoryEntries: assistantUploadIntelligence.builderMemoryEntries,
      fileWarnings: assistantUploadIntelligence.warnings,
      nodes: canvas.nodes,
      edges: canvas.edges,
      flowConfig,
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        error: details || "Unable to build the workflow through the ChatGPT builder proxy.",
        details,
      },
      { status: 503 }
    );
  }
}
