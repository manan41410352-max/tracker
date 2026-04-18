export type AgentTool = {
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

export type QuestionBlock = {
  id: string;
  name: string;
  question: string;
  responseType: "short-answer" | "mcq";
  options: string[];
  required: boolean;
  memoryKey?: string;
};

export type PrefilledQuestionAnswer = {
  id?: string;
  answer: string;
};

export type FormFieldType =
  | "short-text"
  | "long-text"
  | "single-select"
  | "multi-select"
  | "number"
  | "url";

export type FormField = {
  id: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  options: string[];
  placeholder?: string;
  memoryKey?: string;
  reusable?: boolean;
};

export type RunSetupField = FormField & {
  sourceNodeId?: string;
  sourceNodeName?: string;
  sourceNodeType?: "QuestionNode" | "FormNode";
  description?: string;
};

export type RunSetup = {
  title: string;
  description?: string;
  fields: RunSetupField[];
};

export type RunSetupAnswer = {
  id: string;
  value: string | string[];
  memoryKey?: string;
};

export type FormNodeSettings = {
  name: string;
  description?: string;
  fields: FormField[];
  submitLabel?: string;
};

export type RuntimeFlowNodeType =
  | "StartNode"
  | "AgentNode"
  | "SignInAgentNode"
  | "ResearcherAgentNode"
  | "WriterAgentNode"
  | "ViewerAgentNode"
  | "ReviewerAgentNode"
  | "ExecutorAgentNode"
  | "ApiNode"
  | "IfElseNode"
  | "WhileNode"
  | "UserApprovalNode"
  | "QuestionNode"
  | "FormNode"
  | "CaptchaNode"
  | "EndNode";

export type RuntimeFlowNode = {
  id: string;
  type: RuntimeFlowNodeType;
  label: string;
  settings?: Record<string, any>;
  next?: string | string[] | Record<string, string | null> | null;
};

export type RuntimeFlowConfig = {
  startNode: string;
  flow: RuntimeFlowNode[];
};

export type RuntimeAgentDefinition = {
  id?: string;
  name?: string;
  instruction?: string;
  instructions?: string;
  model?: string;
  includeHistory?: boolean;
  tools?: string[];
};

export type AgentRuntimeConfig = {
  version?: number;
  systemPrompt?: string;
  primaryAgentName?: string;
  questionBlocks?: QuestionBlock[];
  runSetup?: RunSetup;
  agents?: RuntimeAgentDefinition[];
  tools?: AgentTool[];
  flow?: RuntimeFlowConfig;
  memory?: {
    reusableByDefault?: boolean;
  };
  executionPolicy?: {
    webSearchMode: "standard" | "always_on";
    builderResearchDepth: "standard" | "aggressive";
    autoRewriteRecoveredBrowserFailures: boolean;
    browserFailureMemoryKey: string;
  };
};

export type BrowserFailureLesson = {
  nodeId: string;
  provider: string;
  hostname: string;
  failurePattern: string;
  avoidanceRule: string;
  recoveryAction: string;
  updatedAt: string;
  successCount: number;
};

export type FallbackHistoryEntry = {
  nodeId: string;
  nodeName: string;
  problem: string;
  resolved: boolean;
  action: string;
  message: string;
  browserUrl?: string;
  createdAt: string;
  lessonCreated?: boolean;
  workflowRewritten?: boolean;
  lessonSignature?: string;
};

export type WorkflowTraceStatus = "completed" | "pending" | "error" | "skipped";

export type WorkflowTraceItem = {
  nodeId: string;
  nodeName: string;
  nodeType: RuntimeFlowNodeType;
  status: WorkflowTraceStatus;
  summary?: string;
  updatedAt: string;
};

export type PendingFormPayload = {
  nodeId: string;
  nodeName: string;
  description?: string;
  submitLabel?: string;
  fields: FormField[];
  values?: Record<string, string | string[]>;
};

export type PendingApprovalPayload = {
  nodeId: string;
  nodeName: string;
  message: string;
  approveLabel?: string;
  rejectLabel?: string;
};

export type PendingBrowserPayload = {
  nodeId: string;
  nodeName: string;
  reason: string;
  url?: string;
  title?: string;
  suggestedAction?: string;
  provider?: BrowserProvider;
  tabId?: string;
  profile?: string;
};

export type BrowserProvider = "brave_cdp";

export type BrowserServiceStatus = "offline" | "warming" | "ready";

export type BrowserSiteSource =
  | "override"
  | "current_page"
  | "memory"
  | "discovery";

export type DiscoveredBrowserSite = {
  query?: string;
  recommendedUrl?: string;
  siteName?: string;
  reason?: string;
  nextStep?: string;
  rememberedUrlMatchedTask?: boolean;
  sources?: Array<{
    title?: string;
    url?: string;
    snippet?: string;
  }>;
};

export type BrowserSnapshotRef = {
  ref: string;
  role?: string;
  name?: string;
  nth?: number;
  text?: string;
  selector?: string;
};

export type BrowserWorkspaceState = {
  url?: string;
  title?: string;
  lastError?: string;
  mode?: "live" | "detached";
  provider?: BrowserProvider;
  profile?: string;
  tabId?: string;
  targetId?: string;
  serviceStatus?: BrowserServiceStatus;
  availableRefs?: BrowserSnapshotRef[];
  resolvedUrl?: string;
  resolvedSiteSource?: BrowserSiteSource;
  discoveredSite?: DiscoveredBrowserSite;
};

export type TrackerDashboardMetricKey =
  | "sleep"
  | "energy"
  | "focus"
  | "work"
  | "money"
  | "friendsFamily"
  | "health"
  | "littleJobs";

export type TrackerDashboardMetric = {
  key: TrackerDashboardMetricKey;
  label: string;
  score: number | null;
  latestValue: string;
  historyCount: number;
};

export type TrackerTimetableCategory =
  | "Sleep"
  | "Energy"
  | "Focus"
  | "Work"
  | "Money"
  | "Friends & family"
  | "Health"
  | "Little jobs";

export type TrackerDashboardPlanItem = {
  start: string;
  end: string;
  title: string;
  category: TrackerTimetableCategory | string;
  reason?: string;
};

export type TrackerDashboardInsights = {
  progressBlocker: string;
  stressHabits: string;
  timeLeaks: string;
  automateDeferRemove: string;
  unlockDecision: string;
};

export type TrackerTimetableOutput = {
  scores: Partial<Record<TrackerDashboardMetricKey, number>>;
  suggestedAction: string;
  reasoning: string;
  insights: TrackerDashboardInsights;
  warnings: string[];
  carryForward: string[];
  todayPlan: TrackerDashboardPlanItem[];
};

export type TrackerPlanSource = "workflow" | "change_assistant";

export type TrackerUnexpectedChangeType =
  | "meeting_rescheduled"
  | "new_commitment"
  | "cancelled_item"
  | "delay_or_overrun"
  | "priority_shift"
  | "health_or_energy_change"
  | "travel_or_commute_change"
  | "other";

export type TrackerUnexpectedChangeFlexibility =
  | "fixed"
  | "semi_flexible"
  | "flexible";

export type TrackerUnexpectedChangeImpact = "low" | "medium" | "high";

export type TrackerUnexpectedChangeInput = {
  changeType: TrackerUnexpectedChangeType;
  itemTitle: string;
  originalTime?: string;
  newTime?: string;
  flexibility?: TrackerUnexpectedChangeFlexibility;
  impact?: TrackerUnexpectedChangeImpact;
  notes?: string;
};

export type TrackerMemoryWrite = {
  memoryKey: string;
  value: string;
};

export type TrackerChangeAssistantRecord = {
  updatedAt: string;
  assistantMessage: string;
  changeSummary: string;
  latestPlan: TrackerTimetableOutput;
  lastChange: TrackerUnexpectedChangeInput;
  memoryUpdates: TrackerMemoryWrite[];
  history: Array<{
    updatedAt: string;
    assistantMessage: string;
    changeSummary: string;
    lastChange: TrackerUnexpectedChangeInput;
  }>;
};

export type TrackerUnexpectedChangeResponse = {
  ok: true;
  assistantMessage: string;
  changeSummary: string;
  updatedAt: string;
  updatedPlan: TrackerTimetableOutput;
  memoryUpdates: TrackerMemoryWrite[];
  planSource: TrackerPlanSource;
};

export type TrackerDashboardModel = {
  ready: boolean;
  metrics: TrackerDashboardMetric[];
  suggestedAction: string;
  reasoning: string;
  insights: TrackerDashboardInsights;
  warnings: string[];
  carryForward: string[];
  todayPlan: TrackerDashboardPlanItem[];
  planSource: TrackerPlanSource;
  lastUpdatedAt?: string;
  changeSummary?: string;
  changeAssistantMessage?: string;
  activeNodeId?: string | null;
};

export type AgentRunStatus =
  | "running"
  | "pending_form"
  | "pending_approval"
  | "pending_browser"
  | "completed"
  | "error";

export type ResumeAction =
  | {
      type: "form";
      values: Record<string, string | string[]>;
    }
  | {
      type: "approval";
      decision: "approve" | "reject";
    }
  | {
      type: "browser";
      note?: string;
      currentUrl?: string;
    };

export type AgentChatEnvelope = {
  status: AgentRunStatus;
  conversationId: string;
  currentNodeId?: string | null;
  message: string;
  form?: PendingFormPayload;
  approval?: PendingApprovalPayload;
  browser?: PendingBrowserPayload;
  browserState?: BrowserWorkspaceState;
  trace?: WorkflowTraceItem[];
};
