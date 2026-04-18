export type BuilderResearchPoint = {
  title: string;
  point: string;
  whyItMatters?: string;
};

export type BuilderChatRole = "user" | "assistant";

export type BuilderChatMessage = {
  id: string;
  role: BuilderChatRole;
  content: string;
  createdAt: string;
};

export type BuilderClarificationQuestion = {
  id: string;
  label: string;
  question: string;
  responseType: "short-answer" | "mcq";
  options: string[];
  required: boolean;
  placeholder?: string;
  memoryKey?: string;
};

export type BuilderMemoryEntry = {
  key: string;
  label: string;
  value: string;
  updatedAt: string;
};

export type BuilderQuestionBlock = {
  id: string;
  name: string;
  question: string;
  responseType: "short-answer" | "mcq";
  options: string[];
  required: boolean;
  memoryKey?: string;
};

export type BuilderFormField = {
  id: string;
  label: string;
  type:
    | "short-text"
    | "long-text"
    | "single-select"
    | "multi-select"
    | "number"
    | "url";
  required: boolean;
  options: string[];
  placeholder?: string;
  memoryKey?: string;
  reusable?: boolean;
};

export type BuilderRunSetupField = BuilderFormField & {
  sourceNodeId?: string;
  sourceNodeName?: string;
  sourceNodeType?: "QuestionNode" | "FormNode";
  description?: string;
};

export type BuilderRunSetup = {
  title: string;
  description: string;
  fields: BuilderRunSetupField[];
};

export type BuilderNodeType =
  | "AgentNode"
  | "ApiNode"
  | "IfElseNode"
  | "WhileNode"
  | "UserApprovalNode"
  | "QuestionNode"
  | "FormNode"
  | "CaptchaNode"
  | "SignInAgentNode"
  | "ResearcherAgentNode"
  | "WriterAgentNode"
  | "ViewerAgentNode"
  | "ReviewerAgentNode"
  | "ExecutorAgentNode"
  | "EndNode";

export type BuilderBlueprintNode = {
  id: string;
  type: BuilderNodeType;
  label: string;
  settings?: Record<string, any>;
};

export type BuilderBlueprintEdge = {
  source: string;
  target: string;
  sourceHandle?: string;
};

export type CanvasNode = {
  id: string;
  type: string;
  position: {
    x: number;
    y: number;
  };
  data: Record<string, any>;
  deletable?: boolean;
};

export type CanvasEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
};

export const NODE_STYLE_MAP: Record<
  BuilderNodeType | "start",
  { bgColor: string; paletteId: string; label: string }
> = {
  start: {
    bgColor: "#FEF3C7",
    paletteId: "start",
    label: "Start",
  },
  AgentNode: {
    bgColor: "#CDF7E3",
    paletteId: "agent",
    label: "Agent",
  },
  ApiNode: {
    bgColor: "#D1F0FF",
    paletteId: "api",
    label: "API",
  },
  IfElseNode: {
    bgColor: "#FFF3CD",
    paletteId: "ifElse",
    label: "If / Else",
  },
  WhileNode: {
    bgColor: "#E3F2FD",
    paletteId: "while",
    label: "While",
  },
  UserApprovalNode: {
    bgColor: "#EADCF8",
    paletteId: "approval",
    label: "User Approval",
  },
  QuestionNode: {
    bgColor: "#FDE7C7",
    paletteId: "question",
    label: "Ask User",
  },
  FormNode: {
    bgColor: "#FEE2E2",
    paletteId: "form",
    label: "Form",
  },
  CaptchaNode: {
    bgColor: "#FDE68A",
    paletteId: "captcha",
    label: "CAPTCHA Gate",
  },
  SignInAgentNode: {
    bgColor: "#D6F5E3",
    paletteId: "signIn",
    label: "Sign-In Agent",
  },
  ResearcherAgentNode: {
    bgColor: "#D6EAF8",
    paletteId: "researcher",
    label: "Researcher",
  },
  WriterAgentNode: {
    bgColor: "#EDE7F6",
    paletteId: "writer",
    label: "Writer",
  },
  ViewerAgentNode: {
    bgColor: "#E0F2F1",
    paletteId: "viewer",
    label: "Viewer",
  },
  ReviewerAgentNode: {
    bgColor: "#FFF8E1",
    paletteId: "reviewer",
    label: "Reviewer",
  },
  ExecutorAgentNode: {
    bgColor: "#FBE9E7",
    paletteId: "executor",
    label: "Executor",
  },
  EndNode: {
    bgColor: "#FFE3E3",
    paletteId: "end",
    label: "End",
  },
};

const DEFAULT_END_SCHEMA =
  '{ "response": "string", "researchPoints": ["string"], "workflow": ["string"] }';

function toSafeId(value: string, fallback: string) {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

export function toNormalizedLookupKey(value: string, fallback = "field") {
  return toSafeId(value, fallback).replace(/-/g, "_");
}

function normalizeTextValue(value: unknown) {
  return String(value || "").trim();
}

function dedupeStringList(values: unknown[], limit?: number) {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const trimmed = normalizeTextValue(value);
    if (!trimmed) {
      continue;
    }

    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(trimmed);
  }

  return typeof limit === "number" ? deduped.slice(0, limit) : deduped;
}

function choosePreferredFieldType(
  currentType: BuilderFormField["type"],
  nextType: BuilderFormField["type"]
) {
  const rank: Record<BuilderFormField["type"], number> = {
    "short-text": 1,
    "long-text": 2,
    "single-select": 4,
    "multi-select": 5,
    number: 3,
    url: 3,
  };

  return rank[nextType] > rank[currentType] ? nextType : currentType;
}

function mergeRunSetupField(
  current: BuilderRunSetupField,
  next: BuilderRunSetupField
): BuilderRunSetupField {
  const mergedOptions = dedupeStringList(
    [...current.options, ...next.options],
    12
  );
  const mergedType =
    mergedOptions.length && next.type === "short-text" && current.type !== "short-text"
      ? current.type
      : choosePreferredFieldType(current.type, next.type);

  return {
    ...current,
    ...next,
    id: current.id || next.id,
    label:
      next.label.length > current.label.length ? next.label : current.label,
    type: mergedType,
    required: current.required || next.required,
    options: mergedOptions,
    placeholder: next.placeholder || current.placeholder,
    memoryKey: next.memoryKey || current.memoryKey,
    reusable: current.reusable || next.reusable,
    description: next.description || current.description,
    sourceNodeId: next.sourceNodeId || current.sourceNodeId,
    sourceNodeName: next.sourceNodeName || current.sourceNodeName,
    sourceNodeType: next.sourceNodeType || current.sourceNodeType,
  };
}

export function dedupeRunSetupFields(fields: BuilderRunSetupField[]) {
  const deduped = new Map<string, BuilderRunSetupField>();

  for (const field of fields) {
    const normalizedField = {
      ...field,
      id: normalizeTextValue(field.id) || toNormalizedLookupKey(field.label, "field"),
      label: normalizeTextValue(field.label) || "Field",
      options: dedupeStringList(field.options, 12),
      memoryKey: field.memoryKey
        ? toNormalizedLookupKey(field.memoryKey, "memory")
        : undefined,
      placeholder: field.placeholder?.trim() || undefined,
      description: field.description?.trim() || undefined,
    } satisfies BuilderRunSetupField;
    const dedupeKey =
      normalizedField.memoryKey ||
      toNormalizedLookupKey(normalizedField.label, normalizedField.id);
    const existing = deduped.get(dedupeKey);

    if (!existing) {
      deduped.set(dedupeKey, normalizedField);
      continue;
    }

    deduped.set(dedupeKey, mergeRunSetupField(existing, normalizedField));
  }

  return Array.from(deduped.values());
}

export function normalizePreviewPromptList(rawPrompts: unknown, limit = 6) {
  return dedupeStringList(Array.isArray(rawPrompts) ? rawPrompts : [], limit);
}

export function normalizeResearchPoints(rawResearch: unknown, limit = 8) {
  if (!Array.isArray(rawResearch)) {
    return [];
  }

  const deduped = new Map<string, BuilderResearchPoint>();

  for (const entry of rawResearch) {
    const typedEntry =
      entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    const title = normalizeTextValue(typedEntry.title || "Research point");
    const point = normalizeTextValue(
      typedEntry.point || typedEntry.whyItMatters || ""
    );
    const whyItMatters = normalizeTextValue(typedEntry.whyItMatters || "");
    const key = toNormalizedLookupKey(title || point, "research");

    if (!point) {
      continue;
    }

    const nextValue = {
      title,
      point,
      whyItMatters: whyItMatters || undefined,
    } satisfies BuilderResearchPoint;
    const existing = deduped.get(key);

    if (!existing) {
      deduped.set(key, nextValue);
      continue;
    }

    deduped.set(key, {
      title:
        nextValue.title.length > existing.title.length
          ? nextValue.title
          : existing.title,
      point:
        nextValue.point.length > existing.point.length
          ? nextValue.point
          : existing.point,
      whyItMatters: nextValue.whyItMatters || existing.whyItMatters,
    });
  }

  return Array.from(deduped.values()).slice(0, limit);
}

export function normalizeClarificationQuestions(rawQuestions: unknown, limit = 6) {
  if (!Array.isArray(rawQuestions)) {
    return [];
  }

  const deduped = new Map<string, BuilderClarificationQuestion>();

  for (const question of rawQuestions) {
    const typedQuestion =
      question && typeof question === "object"
        ? (question as Record<string, unknown>)
        : {};
    const label = normalizeTextValue(
      typedQuestion.label || typedQuestion.question || "Question"
    );
    const prompt = normalizeTextValue(
      typedQuestion.question || typedQuestion.label || "What should the agent ask?"
    );
    const memoryKey = normalizeTextValue(typedQuestion.memoryKey || "");
    const options = dedupeStringList(
      Array.isArray(typedQuestion.options) ? typedQuestion.options : [],
      8
    );
    const responseType =
      typedQuestion.responseType === "mcq" && options.length
        ? "mcq"
        : "short-answer";
    const key =
      toNormalizedLookupKey(memoryKey || label, "question");
    const nextQuestion = {
      id:
        normalizeTextValue(typedQuestion.id) ||
        toNormalizedLookupKey(memoryKey || label, "question"),
      label,
      question: prompt,
      responseType,
      options,
      required:
        typeof typedQuestion.required === "boolean"
          ? typedQuestion.required
          : true,
      placeholder: normalizeTextValue(typedQuestion.placeholder || "") || undefined,
      memoryKey: memoryKey ? toNormalizedLookupKey(memoryKey, "memory") : undefined,
    } satisfies BuilderClarificationQuestion;
    const existing = deduped.get(key);

    if (!existing) {
      deduped.set(key, nextQuestion);
      continue;
    }

    deduped.set(key, {
      ...existing,
      ...nextQuestion,
      label:
        nextQuestion.label.length > existing.label.length
          ? nextQuestion.label
          : existing.label,
      question:
        nextQuestion.question.length > existing.question.length
          ? nextQuestion.question
          : existing.question,
      responseType:
        nextQuestion.responseType === "mcq" && nextQuestion.options.length
          ? "mcq"
          : existing.responseType,
      options: dedupeStringList([...existing.options, ...nextQuestion.options], 8),
      required: existing.required || nextQuestion.required,
      placeholder: nextQuestion.placeholder || existing.placeholder,
      memoryKey: nextQuestion.memoryKey || existing.memoryKey,
    });
  }

  return Array.from(deduped.values()).slice(0, limit);
}

function createUniqueId(base: string, usedIds: Set<string>) {
  let candidate = base;
  let index = 2;

  while (usedIds.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }

  usedIds.add(candidate);
  return candidate;
}

function normalizeOutput(output?: string) {
  return output?.toLowerCase() === "json" ? "json" : "text";
}

function normalizeQuestionResponseType(responseType?: string) {
  return responseType === "mcq" ? "mcq" : "short-answer";
}

export function normalizeBuilderMemoryEntries(rawEntries: unknown): BuilderMemoryEntry[] {
  if (!Array.isArray(rawEntries)) {
    return [];
  }

  const deduped = new Map<string, BuilderMemoryEntry>();

  for (const entry of rawEntries) {
    const typedEntry = entry && typeof entry === "object" ? entry : {};
    const record = typedEntry as Record<string, unknown>;
    const key = toNormalizedLookupKey(String(record.key || record.label || ""), "memory");
    const value = String(record.value || "").trim();

    if (!key || !value) {
      continue;
    }

    deduped.set(key, {
      key,
      label: String(record.label || record.key || "Memory").trim(),
      value,
      updatedAt: String(record.updatedAt || new Date().toISOString()),
    });
  }

  return Array.from(deduped.values());
}

export function normalizeBuilderChatMessages(rawMessages: unknown): BuilderChatMessage[] {
  if (!Array.isArray(rawMessages)) {
    return [];
  }

  return rawMessages
    .map((message, index) => {
      const typedMessage = message && typeof message === "object" ? message : {};
      const record = typedMessage as Record<string, unknown>;

      return {
        id: String(record.id || `message-${index + 1}`),
        role: record.role === "assistant" ? "assistant" : "user",
        content: String(record.content || "").trim(),
        createdAt: String(record.createdAt || new Date().toISOString()),
      } satisfies BuilderChatMessage;
    })
    .filter((message) => message.content);
}

export function normalizeBuilderExecutionPlan(rawPlan: unknown) {
  if (!Array.isArray(rawPlan)) {
    return [];
  }

  return dedupeStringList(rawPlan, 8);
}

export function buildExecutionPlanFromFlowConfig(flowConfig: any) {
  const flow = Array.isArray(flowConfig?.flow) ? flowConfig.flow : [];

  return flow
    .filter((node: any) => node?.type && node.type !== "StartNode")
    .map((node: any, index: number) => {
      const stepName = String(node?.settings?.name || node?.label || node?.type || `Step ${index + 1}`);
      const stepType = String(node?.type || "");

      if (stepType === "AgentNode") {
        if (node?.settings?.websiteDiscovery) {
          return `${index + 1}. ${stepName}: choose the starting website, open it, and store the browser starting point.`;
        }

        return `${index + 1}. ${stepName}: research or execute the next part of the task.`;
      }

      if (stepType === "QuestionNode" || stepType === "FormNode") {
        return `${index + 1}. ${stepName}: collect missing user inputs before continuing.`;
      }

      if (stepType === "CaptchaNode") {
        return `${index + 1}. ${stepName}: pause for manual CAPTCHA or verification only when the browser shows a challenge.`;
      }

      if (stepType === "ApiNode") {
        return `${index + 1}. ${stepName}: call an external service and store the result.`;
      }

      if (stepType === "UserApprovalNode") {
        return `${index + 1}. ${stepName}: pause for confirmation before risky work.`;
      }

      if (stepType === "IfElseNode" || stepType === "WhileNode") {
        return `${index + 1}. ${stepName}: control branching or repetition in the workflow.`;
      }

      if (stepType === "EndNode") {
        return `${index + 1}. ${stepName}: compose and return the final outcome.`;
      }

      return `${index + 1}. ${stepName}`;
    })
    .slice(0, 8);
}

function normalizeFormFieldType(
  fieldType?: string
): BuilderFormField["type"] {
  if (
    [
      "short-text",
      "long-text",
      "single-select",
      "multi-select",
      "number",
      "url",
    ].includes(String(fieldType))
  ) {
    return fieldType as BuilderFormField["type"];
  }

  return "short-text";
}

function normalizeFormFields(rawFields: unknown): BuilderFormField[] {
  if (!Array.isArray(rawFields)) {
    return [];
  }

  return rawFields.map((field, index) => {
    const rawField = field && typeof field === "object" ? field : {};
    const typedField = rawField as Record<string, unknown>;

    return {
      id: String(typedField.id || `field-${index + 1}`),
      label: String(typedField.label || `Field ${index + 1}`),
      type: normalizeFormFieldType(String(typedField.type || "")),
      required:
        typeof typedField.required === "boolean" ? typedField.required : true,
      options: Array.isArray(typedField.options)
        ? typedField.options
            .map((option: unknown) => String(option || "").trim())
            .filter(Boolean)
        : [],
      placeholder: typedField.placeholder
        ? String(typedField.placeholder)
        : undefined,
      memoryKey: typedField.memoryKey ? String(typedField.memoryKey) : undefined,
      reusable: Boolean(typedField.reusable),
    };
  });
}

function normalizeAgentModel(model?: string) {
  const localModel = model?.trim();
  if (!localModel) return "qwen3:14b-q4_K_M";

  if (
    [
      "qwen3:14b-q4_K_M",
      "qwen3.5:35b-a3b",
      "llama3.1:8b",
      "qwen2.5vl:7b",
    ].includes(localModel)
  ) {
    return localModel;
  }

  return "qwen3:14b-q4_K_M";
}

function normalizeNodeSettings(node: BuilderBlueprintNode) {
  const settings = node.settings ?? {};

  switch (node.type) {
    case "AgentNode":
      return {
        ...settings,
        name: settings.name || node.label || "Workflow Agent",
        instruction:
          settings.instruction ||
          "Study the context, list the key research points, then move the task forward.",
        includeHistory: settings.includeHistory ?? true,
        model: normalizeAgentModel(settings.model),
        output: normalizeOutput(settings.output),
        schema: settings.schema || "",
        websiteDiscovery: Boolean(settings.websiteDiscovery),
        discoveryQuery:
          typeof settings.discoveryQuery === "string" ? settings.discoveryQuery : "",
        autoOpenDiscoveredSite: settings.autoOpenDiscoveredSite ?? true,
        rememberDiscoveredUrl: settings.rememberDiscoveredUrl ?? true,
        discoveredUrlMemoryKey:
          typeof settings.discoveredUrlMemoryKey === "string" &&
          settings.discoveredUrlMemoryKey.trim()
            ? settings.discoveredUrlMemoryKey.trim()
            : "preview_default_url",
        preferredBrowserProfile:
          typeof settings.preferredBrowserProfile === "string" &&
          settings.preferredBrowserProfile.trim()
            ? settings.preferredBrowserProfile.trim()
            : "auto",
        browserProfileMemoryKey:
          typeof settings.browserProfileMemoryKey === "string" &&
          settings.browserProfileMemoryKey.trim()
            ? settings.browserProfileMemoryKey.trim()
            : "preview_browser_profile",
        reuseSignedInSession: settings.reuseSignedInSession ?? true,
        initialBrowserActions:
          settings.initialBrowserActions !== undefined
            ? settings.initialBrowserActions
            : undefined,
      };
    case "SignInAgentNode":
      return {
        ...settings,
        name: settings.name || node.label || "Sign-In Agent",
        instruction:
          settings.instruction ||
          "Open the target site in the signed-in user browser profile. Check if already authenticated. If not, complete the login flow using saved sessions or SSO. Return success once authenticated.",
        includeHistory: false,
        model: normalizeAgentModel(settings.model),
        output: normalizeOutput(settings.output),
        schema: settings.schema || "",
        preferredBrowserProfile: "user",
        requiresSignedInSession: true,
        reuseSignedInSession: true,
        allowedTools: ["browser_visit", "browser_task"],
      };
    case "ResearcherAgentNode":
      return {
        ...settings,
        name: settings.name || node.label || "Researcher",
        instruction:
          settings.instruction ||
          "Perform deep research on the task using internet search, web research, and webpage fetching. Compile evidence, sources, key facts, and a structured summary. Do NOT browse interactive pages — stay on public informational sources.",
        includeHistory: settings.includeHistory ?? true,
        model: normalizeAgentModel(settings.model),
        output: normalizeOutput(settings.output),
        schema: settings.schema || "",
        allowedTools: ["internet_search", "web_research", "fetch_webpage", "ask_agent"],
        agentRole: "researcher",
      };
    case "WriterAgentNode":
      return {
        ...settings,
        name: settings.name || node.label || "Writer",
        instruction:
          settings.instruction ||
          "Using the research, facts, and context from previous workflow steps, draft a clear, well-structured output. Do not search the web for additional information — work only from what is in the workflow state. Produce the output in the format required by the schema or instructions.",
        includeHistory: settings.includeHistory ?? true,
        model: normalizeAgentModel(settings.model),
        output: normalizeOutput(settings.output),
        schema: settings.schema || "",
        allowedTools: ["ask_agent"],
        agentRole: "writer",
      };
    case "ViewerAgentNode":
      return {
        ...settings,
        name: settings.name || node.label || "Viewer",
        instruction:
          settings.instruction ||
          "Open the target browser page and extract the required information. Read page content, tables, lists, or specific elements as needed. Return a structured summary or the raw extracted data. Use browser_visit for direct opens and browser_task for multi-step navigation.",
        includeHistory: settings.includeHistory ?? true,
        model: normalizeAgentModel(settings.model),
        output: normalizeOutput(settings.output),
        schema: settings.schema || "",
        allowedTools: ["browser_visit", "browser_task", "ask_agent"],
        agentRole: "viewer",
        reuseSignedInSession: settings.reuseSignedInSession ?? true,
      };
    case "ReviewerAgentNode":
      return {
        ...settings,
        name: settings.name || node.label || "Reviewer",
        instruction:
          settings.instruction ||
          "Review the output of previous workflow steps. Check for accuracy, completeness, clarity, and alignment with the original goal. List any issues or improvements needed. If the output is satisfactory, confirm it. If not, describe exactly what needs to change.",
        includeHistory: settings.includeHistory ?? true,
        model: normalizeAgentModel(settings.model),
        output: normalizeOutput(settings.output),
        schema: settings.schema || "",
        allowedTools: ["ask_agent"],
        agentRole: "reviewer",
      };
    case "ExecutorAgentNode":
      return {
        ...settings,
        name: settings.name || node.label || "Executor",
        instruction:
          settings.instruction ||
          "Execute the planned actions in the browser or via tools. Follow the execution plan from previous steps. Use browser_task for multi-step automated workflows, browser_visit for direct navigation, and internet_search to look up data needed before acting. After each action, verify the result before proceeding.",
        includeHistory: settings.includeHistory ?? true,
        model: normalizeAgentModel(settings.model),
        output: normalizeOutput(settings.output),
        schema: settings.schema || "",
        allowedTools: ["browser_visit", "browser_task", "internet_search", "ask_agent"],
        agentRole: "executor",
        reuseSignedInSession: settings.reuseSignedInSession ?? true,
      };
    case "ApiNode":
      return {
        name: settings.name || node.label || "API Step",
        method:
          String(settings.method || "GET").toUpperCase() === "POST"
            ? "POST"
            : "GET",
        url: settings.url || "",
        apiKey: settings.apiKey || "",
        includeApiKey: settings.includeApiKey ?? false,
        bodyparams:
          typeof settings.bodyparams === "string" ? settings.bodyparams : "",
      };
    case "IfElseNode":
      return {
        ifCondition:
          settings.ifCondition ||
          "If the research shows more evidence is needed, follow the yes branch.",
      };
    case "WhileNode":
      return {
        whileCondition:
          settings.whileCondition ||
          "Repeat until the plan is complete and checked.",
      };
    case "UserApprovalNode":
      return {
        name: settings.name || node.label || "Approval Gate",
        message:
          settings.message ||
          "Review the proposed workflow before continuing to execution.",
      };
    case "QuestionNode": {
      const normalizedOptions = Array.isArray(settings.options)
        ? settings.options
            .map((option: unknown) => String(option || "").trim())
            .filter(Boolean)
        : typeof settings.optionsText === "string"
          ? settings.optionsText
              .split(/\r?\n/)
              .map((option: string) => option.trim())
              .filter(Boolean)
          : [];

      return {
        name: settings.name || node.label || "Clarify requirement",
        question:
          settings.question ||
          "What requirement should the agent confirm before continuing?",
        responseType: normalizeQuestionResponseType(settings.responseType),
        options: normalizedOptions,
        required: settings.required ?? true,
        memoryKey:
          settings.memoryKey ||
          toNormalizedLookupKey(
            String(settings.name || node.label || settings.question || "question"),
            "memory"
          ),
      };
    }
    case "FormNode":
      return {
        name: settings.name || node.label || "Collect details",
        description:
          settings.description ||
          "Gather the information needed before the workflow continues.",
        fields: normalizeFormFields(settings.fields),
        submitLabel: settings.submitLabel || "Continue",
      };
    case "CaptchaNode":
      return {
        name: settings.name || node.label || "CAPTCHA Gate",
        message:
          settings.message ||
          "If a CAPTCHA or human verification page is visible, pause the workflow and ask the user to complete it in the browser workspace before resuming.",
        pauseWithoutBrowser: settings.pauseWithoutBrowser ?? false,
        pauseOnAnyVerification: settings.pauseOnAnyVerification ?? true,
      };
    case "EndNode":
      return {
        schema:
          typeof settings.schema === "string" && settings.schema.trim()
            ? settings.schema
            : DEFAULT_END_SCHEMA,
      };
    default:
      return settings;
  }
}

function buildCanvasNode(node: BuilderBlueprintNode, position: { x: number; y: number }) {
  const style = NODE_STYLE_MAP[node.type];
  const settings = normalizeNodeSettings(node);

  return {
    id: node.id,
    type: node.type,
    position,
    data: {
      label:
        settings.name ||
        node.label ||
        style.label,
      bgColor: style.bgColor,
      id: style.paletteId,
      type: node.type,
      settings,
    },
  } satisfies CanvasNode;
}

function groupEdgesBySource(edges: CanvasEdge[]) {
  return edges.reduce<Record<string, CanvasEdge[]>>((acc, edge) => {
    if (!acc[edge.source]) {
      acc[edge.source] = [];
    }

    acc[edge.source].push(edge);
    return acc;
  }, {});
}

function makeEdgeId(source: string, target: string, sourceHandle?: string) {
  return `edge-${source}-${sourceHandle || "default"}-${target}`;
}

function dedupeEdges(edges: CanvasEdge[]) {
  const seen = new Set<string>();

  return edges.filter((edge) => {
    const key = makeEdgeId(edge.source, edge.target, edge.sourceHandle);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function normalizeIfElseHandle(sourceHandle?: string, fallback?: "if" | "else") {
  if (sourceHandle === "if" || sourceHandle === "yes" || sourceHandle === "true") {
    return "if";
  }

  if (sourceHandle === "else" || sourceHandle === "no" || sourceHandle === "false") {
    return "else";
  }

  return fallback;
}

function normalizeApprovalHandle(
  sourceHandle?: string,
  fallback?: "approve" | "reject"
) {
  if (
    sourceHandle === "approve" ||
    sourceHandle === "approved" ||
    sourceHandle === "confirm" ||
    sourceHandle === "confirmed" ||
    sourceHandle === "yes"
  ) {
    return "approve";
  }

  if (
    sourceHandle === "reject" ||
    sourceHandle === "rejected" ||
    sourceHandle === "decline" ||
    sourceHandle === "denied" ||
    sourceHandle === "no"
  ) {
    return "reject";
  }

  return fallback;
}

function findBranchTarget(
  edges: any[],
  acceptedHandles: string[],
  fallbackIndex: number
) {
  return (
    edges.find((edge) => acceptedHandles.includes(edge.sourceHandle))?.target ||
    edges[fallbackIndex]?.target ||
    null
  );
}

export function buildCanvasGraphFromBlueprint(
  workflowNodes: BuilderBlueprintNode[],
  workflowEdges: BuilderBlueprintEdge[]
) {
  const usedIds = new Set<string>(["start"]);
  const nodeIdMap = new Map<string, string>();

  const sanitizedNodes = workflowNodes.map((node, index) => {
    const originalId = node.id || `${node.type}-${index + 1}`;
    const nextId = createUniqueId(
      toSafeId(originalId || node.label || node.type, `${node.type.toLowerCase()}-${index + 1}`),
      usedIds
    );

    nodeIdMap.set(originalId, nextId);

    return {
      ...node,
      id: nextId,
      label: node.label || NODE_STYLE_MAP[node.type].label,
      settings: normalizeNodeSettings({
        ...node,
        id: nextId,
      }),
    };
  });

  const nodeTypeById = new Map(sanitizedNodes.map((node) => [node.id, node.type]));
  let sanitizedEdges = workflowEdges
    .map((edge) => ({
      source: nodeIdMap.get(edge.source) || edge.source,
      target: nodeIdMap.get(edge.target) || edge.target,
      sourceHandle: edge.sourceHandle,
    }))
    .filter(
      (edge) =>
        nodeTypeById.has(edge.source) &&
        nodeTypeById.has(edge.target) &&
        edge.source !== edge.target
    )
    .map((edge) => ({
      id: makeEdgeId(edge.source, edge.target, edge.sourceHandle),
      ...edge,
    }));

  const outgoingBySource = groupEdgesBySource(sanitizedEdges);
  sanitizedEdges = sanitizedEdges.map((edge) => {
    const sourceType = nodeTypeById.get(edge.source);
    const edgeIndex = outgoingBySource[edge.source]?.findIndex(
      (candidate) => candidate.id === edge.id
    );

    if (sourceType === "IfElseNode" && !edge.sourceHandle) {
      const normalizedHandle = normalizeIfElseHandle(
        edge.sourceHandle,
        edgeIndex === 0 ? "if" : "else"
      );
      return {
        ...edge,
        sourceHandle: normalizedHandle,
        id: makeEdgeId(edge.source, edge.target, normalizedHandle),
      };
    }

    if (sourceType === "UserApprovalNode") {
      const normalizedHandle = normalizeApprovalHandle(
        edge.sourceHandle,
        edgeIndex === 0 ? "approve" : "reject"
      );
      return {
        ...edge,
        sourceHandle: normalizedHandle,
        id: makeEdgeId(edge.source, edge.target, normalizedHandle),
      };
    }

    if (sourceType === "IfElseNode") {
      const normalizedHandle = normalizeIfElseHandle(edge.sourceHandle);
      return {
        ...edge,
        sourceHandle: normalizedHandle,
        id: makeEdgeId(edge.source, edge.target, normalizedHandle),
      };
    }

    return {
      ...edge,
      sourceHandle: undefined,
      id: makeEdgeId(edge.source, edge.target),
    };
  });

  let endNode = sanitizedNodes.find((node) => node.type === "EndNode");
  if (!endNode) {
    const endId = createUniqueId("end", usedIds);
    endNode = {
      id: endId,
      type: "EndNode" as const,
      label: "Complete",
      settings: normalizeNodeSettings({
        id: endId,
        type: "EndNode",
        label: "Complete",
      }),
    };
    sanitizedNodes.push(endNode);
    nodeTypeById.set(endId, "EndNode");
  }

  const edgesBySource = groupEdgesBySource(sanitizedEdges);
  for (const node of sanitizedNodes) {
    if (node.type === "EndNode") {
      continue;
    }

    if (!edgesBySource[node.id]?.length) {
      sanitizedEdges.push({
        id: makeEdgeId(node.id, endNode.id),
        source: node.id,
        target: endNode.id,
        sourceHandle: undefined,
      });
    }
  }

  const incomingTargets = new Set(sanitizedEdges.map((edge) => edge.target));
  const entryNode =
    sanitizedNodes.find((node) => node.type !== "EndNode" && !incomingTargets.has(node.id)) ||
    sanitizedNodes[0];

  const allEdges = dedupeEdges([
    {
      id: makeEdgeId("start", entryNode.id),
      source: "start",
      target: entryNode.id,
      sourceHandle: undefined,
    },
    ...sanitizedEdges,
  ]);

  const adjacency = allEdges.reduce<Record<string, string[]>>((acc, edge) => {
    if (!acc[edge.source]) {
      acc[edge.source] = [];
    }

    acc[edge.source].push(edge.target);
    return acc;
  }, {});

  const depthMap = new Map<string, number>([["start", 0]]);
  const queue = ["start"];

  while (queue.length) {
    const current = queue.shift() as string;
    const currentDepth = depthMap.get(current) ?? 0;

    for (const target of adjacency[current] ?? []) {
      if (!depthMap.has(target)) {
        depthMap.set(target, currentDepth + 1);
        queue.push(target);
      }
    }
  }

  let fallbackDepth =
    Math.max(...Array.from(depthMap.values()), 0) + 1;
  for (const node of sanitizedNodes) {
    if (!depthMap.has(node.id)) {
      depthMap.set(node.id, fallbackDepth);
      fallbackDepth += 1;
    }
  }

  const groupedByDepth = sanitizedNodes.reduce<Record<number, BuilderBlueprintNode[]>>(
    (acc, node) => {
      const depth = depthMap.get(node.id) ?? 1;
      if (!acc[depth]) {
        acc[depth] = [];
      }

      acc[depth].push(node);
      return acc;
    },
    {}
  );

  const canvasNodes: CanvasNode[] = [
    {
      id: "start",
      type: "start",
      position: { x: 80, y: 220 },
      data: {
        label: "Start",
      },
      deletable: false,
    },
  ];

  for (const [depthKey, nodesAtDepth] of Object.entries(groupedByDepth)) {
    const depth = Number(depthKey);
    nodesAtDepth.forEach((node, index) => {
      canvasNodes.push(
        buildCanvasNode(node, {
          x: 80 + depth * 320,
          y: 120 + index * 190,
        })
      );
    });
  }

  return {
    nodes: canvasNodes,
    edges: allEdges,
  };
}

export function buildFlowConfigFromCanvas(nodes: any[] = [], edges: any[] = []) {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const safeEdges = Array.isArray(edges) ? edges : [];
  const edgeMap = safeEdges.reduce<Record<string, any[]>>((acc, edge) => {
    if (!acc[edge.source]) {
      acc[edge.source] = [];
    }

    acc[edge.source].push(edge);
    return acc;
  }, {});

  const flow = safeNodes.map((node) => {
    const connectedEdges = edgeMap[node.id] || [];
    let next: any = null;

    if (node.type === "IfElseNode") {
      next = {
        if: findBranchTarget(connectedEdges, ["if", "yes", "true"], 0),
        else: findBranchTarget(connectedEdges, ["else", "no", "false"], 1),
      };
    } else if (node.type === "UserApprovalNode") {
      next = {
        approve: findBranchTarget(
          connectedEdges,
          ["approve", "approved", "confirm", "confirmed", "yes"],
          0
        ),
        reject: findBranchTarget(
          connectedEdges,
          ["reject", "rejected", "decline", "denied", "no"],
          1
        ),
      };
    } else if (connectedEdges.length === 1) {
      next = connectedEdges[0].target;
    } else if (connectedEdges.length > 1) {
      next = connectedEdges.map((edge) => edge.target);
    }

    return {
      id: node.id,
      type: node.type === "start" ? "StartNode" : node.type,
      label: node.data?.label || node.type,
      settings: node.data?.settings || {},
      next,
    };
  });

  const startNode = safeNodes.find(
    (node) => node.type === "start" || node.type === "StartNode" || node.id === "start"
  );

  return {
    startNode: startNode?.id || "start",
    flow,
  };
}

export function extractQuestionBlocksFromFlowConfig(
  flowConfig: any
): BuilderQuestionBlock[] {
  const flow = Array.isArray(flowConfig?.flow) ? flowConfig.flow : [];

  return flow
    .filter((node: any) => node?.type === "QuestionNode")
    .map((node: any, index: number) => {
      const settings = node?.settings ?? {};
      const options = Array.isArray(settings.options)
        ? settings.options
            .map((option: unknown) => String(option || "").trim())
            .filter(Boolean)
        : [];

      return {
        id: String(node?.id || `question-${index + 1}`),
        name: String(settings.name || node?.label || `Question ${index + 1}`),
        question: String(
          settings.question || "What requirement should the agent confirm?"
        ),
        responseType: normalizeQuestionResponseType(settings.responseType),
        options,
        required: settings.required ?? true,
        memoryKey: settings.memoryKey
          ? toNormalizedLookupKey(String(settings.memoryKey), "memory")
          : undefined,
      };
    });
}

export function extractRunSetupFromFlowConfig(flowConfig: any): BuilderRunSetup {
  const flow = Array.isArray(flowConfig?.flow) ? flowConfig.flow : [];
  const fields: BuilderRunSetupField[] = [];

  for (const node of flow) {
    const settings = node?.settings ?? {};

    if (node?.type === "QuestionNode") {
      const responseType = normalizeQuestionResponseType(settings.responseType);
      const options = Array.isArray(settings.options)
        ? settings.options
            .map((option: unknown) => String(option || "").trim())
            .filter(Boolean)
        : [];

      fields.push({
        id: String(node?.id || settings.memoryKey || settings.name || "question"),
        label: String(settings.name || node?.label || "Required input"),
        type:
          responseType === "mcq"
            ? "single-select"
            : "short-text",
        required: settings.required ?? true,
        options,
        placeholder:
          responseType === "mcq"
            ? "Choose an option"
            : "Enter the required detail",
        memoryKey:
          settings.memoryKey ||
          toNormalizedLookupKey(
            String(settings.name || node?.label || settings.question || "question"),
            "memory"
          ),
        reusable: true,
        sourceNodeId: String(node?.id || ""),
        sourceNodeName: String(settings.name || node?.label || "Question"),
        sourceNodeType: "QuestionNode",
        description: String(
          settings.question || "Answer this before the workflow starts."
        ),
      });
    }

    if (node?.type === "FormNode") {
      const formFields = Array.isArray(settings.fields) ? settings.fields : [];

      for (const field of formFields) {
        const typedField =
          field && typeof field === "object" ? (field as Record<string, unknown>) : {};

        fields.push({
          id: String(
            typedField.id ||
              typedField.memoryKey ||
              typedField.label ||
              `${node?.id || "form"}-field`
          ),
          label: String(typedField.label || "Required input"),
          type: normalizeFormFieldType(String(typedField.type || "short-text")),
          required:
            typeof typedField.required === "boolean" ? typedField.required : true,
          options: Array.isArray(typedField.options)
            ? typedField.options
                .map((option: unknown) => String(option || "").trim())
                .filter(Boolean)
            : [],
          placeholder: typedField.placeholder
            ? String(typedField.placeholder)
            : undefined,
          memoryKey: typedField.memoryKey
            ? toNormalizedLookupKey(String(typedField.memoryKey), "memory")
            : toNormalizedLookupKey(
                String(typedField.label || typedField.id || "field"),
                "memory"
              ),
          reusable:
            typeof typedField.reusable === "boolean"
              ? typedField.reusable
              : true,
          sourceNodeId: String(node?.id || ""),
          sourceNodeName: String(settings.name || node?.label || "Form"),
          sourceNodeType: "FormNode",
          description: String(
            settings.description || "Provide this before the workflow starts."
          ),
        });
      }
    }
  }

  return {
    title: "Run setup",
    description:
      "Collect the required details once before the workflow starts so the agent can execute without repeating the same questions.",
    fields: dedupeRunSetupFields(fields),
  };
}
