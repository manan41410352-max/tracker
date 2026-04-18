import type {
  TrackerChangeAssistantRecord,
  TrackerDashboardModel,
  TrackerDashboardPlanItem,
  TrackerPlanSource,
  TrackerUnexpectedChangeFlexibility,
  TrackerUnexpectedChangeImpact,
  TrackerUnexpectedChangeInput,
  TrackerUnexpectedChangeType,
} from "@/lib/runtime-types";

type ManualNodePreset = {
  name: string;
  emoji?: string;
  bgColor: string;
  id: string;
  type: "AgentNode" | "FormNode";
  summary: string;
  defaultSettings: Record<string, any>;
};

type TrackerClarificationAnswer = {
  label?: string;
  question?: string;
  answer?: string;
};

type TrackerMemoryEntry = {
  memoryKey: string;
  value: any;
  updatedAt?: string;
};

type TrackerMemoryEvent = {
  memoryKey: string;
  value: any;
  updatedAt?: string;
};

type PersistedRunLike = {
  currentNodeId?: string | null;
  state?: Record<string, any>;
};

const SCORE_OPTIONS = Array.from({ length: 10 }, (_, index) => String(index + 1));

export const TRACKER_METRIC_DEFINITIONS = [
  {
    key: "sleep",
    label: "Sleep",
    memoryKey: "sleep_hours",
  },
  {
    key: "energy",
    label: "Energy",
    memoryKey: "energy_level",
  },
  {
    key: "focus",
    label: "Focus",
    memoryKey: "focus_level",
  },
  {
    key: "work",
    label: "Work",
    memoryKey: "work_load",
  },
  {
    key: "money",
    label: "Money",
    memoryKey: "money_state",
  },
  {
    key: "friendsFamily",
    label: "Friends & family",
    memoryKey: "friends_family_state",
  },
  {
    key: "health",
    label: "Health",
    memoryKey: "health_state",
  },
  {
    key: "littleJobs",
    label: "Little jobs",
    memoryKey: "little_jobs_state",
  },
] as const;

export const TRACKER_UNEXPECTED_CHANGE_TYPES: Array<{
  value: TrackerUnexpectedChangeType;
  label: string;
}> = [
  { value: "meeting_rescheduled", label: "Meeting rescheduled" },
  { value: "new_commitment", label: "New commitment" },
  { value: "cancelled_item", label: "Cancelled item" },
  { value: "delay_or_overrun", label: "Delay or overrun" },
  { value: "priority_shift", label: "Priority shift" },
  { value: "health_or_energy_change", label: "Health or energy change" },
  { value: "travel_or_commute_change", label: "Travel or commute change" },
  { value: "other", label: "Other" },
];

export const TRACKER_UNEXPECTED_CHANGE_FLEXIBILITY_OPTIONS: Array<{
  value: TrackerUnexpectedChangeFlexibility;
  label: string;
}> = [
  { value: "fixed", label: "Fixed" },
  { value: "semi_flexible", label: "Semi-flexible" },
  { value: "flexible", label: "Flexible" },
];

export const TRACKER_UNEXPECTED_CHANGE_IMPACT_OPTIONS: Array<{
  value: TrackerUnexpectedChangeImpact;
  label: string;
}> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export const TRACKER_TIMETABLE_SCHEMA = `{
  "scores": {
    "sleep": 1,
    "energy": 1,
    "focus": 1,
    "work": 1,
    "money": 1,
    "friendsFamily": 1,
    "health": 1,
    "littleJobs": 1
  },
  "suggestedAction": "string",
  "reasoning": "string",
  "insights": {
    "progressBlocker": "string",
    "stressHabits": "string",
    "timeLeaks": "string",
    "automateDeferRemove": "string",
    "unlockDecision": "string"
  },
  "todayPlan": [
    {
      "start": "09:00",
      "end": "10:00",
      "title": "string",
      "category": "Sleep | Energy | Focus | Work | Money | Friends & family | Health | Little jobs",
      "reason": "string"
    }
  ],
  "carryForward": ["string"],
  "warnings": ["string"]
}`;

export const TRACKER_DAILY_CHECK_IN_FIELDS = [
  {
    id: "sleep_hours",
    label: "Sleep hours",
    type: "number",
    required: true,
    options: [],
    placeholder: "8",
    memoryKey: "sleep_hours",
    reusable: true,
  },
  {
    id: "energy_level",
    label: "Energy level",
    type: "single-select",
    required: true,
    options: SCORE_OPTIONS,
    placeholder: "Choose today's energy level",
    memoryKey: "energy_level",
    reusable: true,
  },
  {
    id: "focus_level",
    label: "Focus level",
    type: "single-select",
    required: true,
    options: SCORE_OPTIONS,
    placeholder: "Choose today's focus level",
    memoryKey: "focus_level",
    reusable: true,
  },
  {
    id: "work_load",
    label: "Work load",
    type: "single-select",
    required: true,
    options: SCORE_OPTIONS,
    placeholder: "Choose today's work load",
    memoryKey: "work_load",
    reusable: true,
  },
  {
    id: "money_state",
    label: "Money state",
    type: "single-select",
    required: true,
    options: SCORE_OPTIONS,
    placeholder: "Choose today's money state",
    memoryKey: "money_state",
    reusable: true,
  },
  {
    id: "friends_family_state",
    label: "Friends & family state",
    type: "single-select",
    required: true,
    options: SCORE_OPTIONS,
    placeholder: "Choose today's relationship state",
    memoryKey: "friends_family_state",
    reusable: true,
  },
  {
    id: "health_state",
    label: "Health state",
    type: "single-select",
    required: true,
    options: SCORE_OPTIONS,
    placeholder: "Choose today's health state",
    memoryKey: "health_state",
    reusable: true,
  },
  {
    id: "little_jobs_state",
    label: "Little jobs state",
    type: "single-select",
    required: true,
    options: SCORE_OPTIONS,
    placeholder: "Choose today's errands/admin pressure",
    memoryKey: "little_jobs_state",
    reusable: true,
  },
  {
    id: "today_tasks",
    label: "Today's tasks",
    type: "long-text",
    required: true,
    options: [],
    placeholder: "List the must-do tasks, priorities, and deadlines for today.",
    memoryKey: "today_tasks",
    reusable: true,
  },
  {
    id: "fixed_commitments",
    label: "Fixed commitments",
    type: "long-text",
    required: false,
    options: [],
    placeholder: "Meetings, classes, calls, travel, or any fixed time blocks.",
    memoryKey: "fixed_commitments",
    reusable: true,
  },
  {
    id: "available_hours_today",
    label: "Available hours today",
    type: "number",
    required: true,
    options: [],
    placeholder: "6",
    memoryKey: "available_hours_today",
    reusable: true,
  },
] as const;

export const TRACKER_TIMETABLE_PREFERENCE_FIELDS = [
  {
    id: "preferred_day_start",
    label: "Preferred day start",
    type: "short-text",
    required: false,
    options: [],
    placeholder: "07:30",
    memoryKey: "preferred_day_start",
    reusable: true,
  },
  {
    id: "preferred_day_end",
    label: "Preferred day end",
    type: "short-text",
    required: false,
    options: [],
    placeholder: "22:30",
    memoryKey: "preferred_day_end",
    reusable: true,
  },
  {
    id: "deep_work_block_minutes",
    label: "Deep work block length",
    type: "number",
    required: false,
    options: [],
    placeholder: "60",
    memoryKey: "deep_work_block_minutes",
    reusable: true,
  },
  {
    id: "break_style",
    label: "Break style",
    type: "single-select",
    required: false,
    options: ["25/5", "50/10", "90/20", "Flexible"],
    placeholder: "Choose how you prefer to break",
    memoryKey: "break_style",
    reusable: true,
  },
  {
    id: "schedule_style",
    label: "Schedule style",
    type: "single-select",
    required: false,
    options: ["Structured", "Balanced", "Flexible"],
    placeholder: "Choose your schedule style",
    memoryKey: "schedule_style",
    reusable: true,
  },
  {
    id: "existing_timetable_notes",
    label: "Existing timetable notes",
    type: "long-text",
    required: false,
    options: [],
    placeholder: "Describe the routine or timetable you already want the planner to respect.",
    memoryKey: "existing_timetable_notes",
    reusable: true,
  },
  {
    id: "fitbit_health_notes",
    label: "Fitbit or health notes",
    type: "long-text",
    required: false,
    options: [],
    placeholder: "Health trends, Fitbit summaries, sleep score, steps, soreness, recovery signals.",
    memoryKey: "fitbit_health_notes",
    reusable: true,
  },
] as const;

export const TRACKER_GOOGLE_CONNECTOR_FIELDS = [
  {
    id: "google_account_email",
    label: "Google account email",
    type: "short-text",
    required: false,
    options: [],
    placeholder: "name@example.com",
    memoryKey: "google_account_email",
    reusable: true,
  },
  {
    id: "google_calendar_id",
    label: "Google Calendar ID",
    type: "short-text",
    required: false,
    options: [],
    placeholder: "primary or a shared calendar id",
    memoryKey: "google_calendar_id",
    reusable: true,
  },
  {
    id: "gmail_label_filter",
    label: "Gmail label filter",
    type: "short-text",
    required: false,
    options: [],
    placeholder: "Inbox, Important, Follow-up",
    memoryKey: "gmail_label_filter",
    reusable: true,
  },
  {
    id: "calendar_sync_notes",
    label: "Calendar sync notes",
    type: "long-text",
    required: false,
    options: [],
    placeholder: "How should calendar events shape the daily plan later on?",
    memoryKey: "calendar_sync_notes",
    reusable: true,
  },
  {
    id: "fitbit_dashboard_url",
    label: "Fitbit dashboard URL",
    type: "url",
    required: false,
    options: [],
    placeholder: "https://www.fitbit.com/global/us/home",
    memoryKey: "fitbit_dashboard_url",
    reusable: true,
  },
  {
    id: "fitbit_sync_notes",
    label: "Fitbit sync notes",
    type: "long-text",
    required: false,
    options: [],
    placeholder: "How should Fitbit data influence sleep, energy, health, and timetable suggestions later on?",
    memoryKey: "fitbit_sync_notes",
    reusable: true,
  },
  {
    id: "fitbit_sync_status",
    label: "Fitbit sync status",
    type: "single-select",
    required: false,
    options: ["not_connected", "connect_later", "ready_for_oauth"],
    placeholder: "Choose the current Fitbit integration status",
    memoryKey: "fitbit_sync_status",
    reusable: true,
  },
  {
    id: "integration_status",
    label: "Integration status",
    type: "single-select",
    required: true,
    options: ["not_connected", "connect_later", "ready_for_oauth"],
    placeholder: "Choose the current Google integration status",
    memoryKey: "integration_status",
    reusable: true,
  },
] as const;

const TRACKER_DOMAIN_PRESETS: ManualNodePreset[] = [
  {
    name: "Sleep",
    emoji: "\u{1F6CC}",
    bgColor: "#C7D2FE",
    id: "sleep",
    type: "AgentNode",
    summary: "Analyze today's rest quality and recovery impact.",
    defaultSettings: {
      name: "Sleep",
      domain: "sleep",
      instruction:
        "Diagnose the user's sleep system for today. Read the daily check-in, reusable memory, recent memory timeline, and prior node outputs. Explain how rest quality changes energy, focus, health, work, and relationships today. Return today's main sleep insight, the biggest leverage change, and what should be protected in the timetable.",
      includeHistory: true,
      model: "qwen3:14b-q4_K_M",
      output: "text",
    },
  },
  {
    name: "Energy",
    emoji: "\u26A1",
    bgColor: "#FDE68A",
    id: "energy",
    type: "AgentNode",
    summary: "Map likely peaks, dips, and recovery windows.",
    defaultSettings: {
      name: "Energy",
      domain: "energy",
      instruction:
        "Map today's energy pattern using the latest check-in, reusable memory, memory timeline, and previous workflow outputs. Identify when the user is likely to do deep work well, when recovery is needed, and what should be delayed. Return timing advice the timetable planner can use directly.",
      includeHistory: true,
      model: "qwen3:14b-q4_K_M",
      output: "text",
    },
  },
  {
    name: "Focus",
    emoji: "\u{1F3AF}",
    bgColor: "#BAE6FD",
    id: "focus",
    type: "AgentNode",
    summary: "Prioritize high-value attention and reduce context switching.",
    defaultSettings: {
      name: "Focus",
      domain: "focus",
      instruction:
        "Analyze what will help or hurt focus today. Use the check-in, current tasks, reusable memory, and recent history to separate urgent noise from meaningful progress. Return the best deep-work target, the boundary that matters most, and what should be deprioritized.",
      includeHistory: true,
      model: "qwen3:14b-q4_K_M",
      output: "text",
    },
  },
  {
    name: "Work",
    emoji: "\u{1F4BC}",
    bgColor: "#BFDBFE",
    id: "work",
    type: "AgentNode",
    summary: "Choose the work that creates the most downstream benefit.",
    defaultSettings: {
      name: "Work",
      domain: "work",
      instruction:
        "Review today's work obligations as a system. Use the check-in, reusable memory, recent history, and tasks to identify what creates the most downstream value. Return the one work priority that should anchor today's timetable plus anything that can wait.",
      includeHistory: true,
      model: "qwen3:14b-q4_K_M",
      output: "text",
    },
  },
  {
    name: "Money",
    emoji: "\u{1F4B0}",
    bgColor: "#BBF7D0",
    id: "money",
    type: "AgentNode",
    summary: "Surface money pressure and what deserves attention now.",
    defaultSettings: {
      name: "Money",
      domain: "money",
      instruction:
        "Diagnose today's money pressure using the latest check-in, reusable memory, and recent history. Highlight whether money stress should change today's priorities, what finance action matters most, and what can safely wait.",
      includeHistory: true,
      model: "qwen3:14b-q4_K_M",
      output: "text",
    },
  },
  {
    name: "Friends & family",
    emoji: "\u2764\uFE0F",
    bgColor: "#FBCFE8",
    id: "friendsFamily",
    type: "AgentNode",
    summary: "Protect important relationship follow-through without overloading the day.",
    defaultSettings: {
      name: "Friends & family",
      domain: "friends_family",
      instruction:
        "Review relationship obligations and support needs for today. Use the check-in, reusable memory, recent history, and tasks to identify the one care action, message, or boundary that would reduce friction without overwhelming the schedule.",
      includeHistory: true,
      model: "qwen3:14b-q4_K_M",
      output: "text",
    },
  },
  {
    name: "Health",
    emoji: "\u{1F3CB}\uFE0F",
    bgColor: "#A7F3D0",
    id: "health",
    type: "AgentNode",
    summary: "Recommend the smallest health action with the biggest leverage.",
    defaultSettings: {
      name: "Health",
      domain: "health",
      instruction:
        "Analyze today's health constraints and recovery needs using the check-in, reusable memory, recent history, and task pressure. Return the smallest health action with the biggest payoff plus any non-negotiable recovery boundary for the timetable.",
      includeHistory: true,
      model: "qwen3:14b-q4_K_M",
      output: "text",
    },
  },
  {
    name: "Little jobs",
    emoji: "\u{1F4CB}",
    bgColor: "#FED7AA",
    id: "littleJobs",
    type: "AgentNode",
    summary: "Batch errands and admin so they stop consuming attention.",
    defaultSettings: {
      name: "Little jobs",
      domain: "little_jobs",
      instruction:
        "Triage today's small tasks, errands, and admin using the current task list, reusable memory, recent history, and previous node outputs. Return the best errand batch, what can be postponed, and which small job would clear the most mental space.",
      includeHistory: true,
      model: "qwen3:14b-q4_K_M",
      output: "text",
    },
  },
];

export const DAILY_CHECK_IN_PRESET: ManualNodePreset = {
  name: "Daily Check-in",
  emoji: "\u2714",
  bgColor: "#DBEAFE",
  id: "dailyCheckIn",
  type: "FormNode",
  summary: "Collect today's sleep, energy, focus, tasks, and time constraints.",
  defaultSettings: {
    name: "Daily Check-in",
    description:
      "Capture today's sleep, energy, focus, task load, and time constraints once so the workflow can adapt the plan without repeating the same questions.",
    submitLabel: "Save check-in",
    fields: TRACKER_DAILY_CHECK_IN_FIELDS.map((field) => ({ ...field })),
  },
};

export const GOOGLE_CONNECTOR_PRESET: ManualNodePreset = {
  name: "Google Connector",
  emoji: "\u{1F4C5}",
  bgColor: "#E0F2FE",
  id: "googleConnector",
  type: "FormNode",
  summary: "Store Calendar and Gmail placeholders for future integration.",
  defaultSettings: {
    name: "Google Connector",
    description:
      "Store placeholder details for Calendar, Gmail, and Fitbit so the workflow can be wired to external data later without rebuilding the canvas.",
    submitLabel: "Save connector details",
    fields: TRACKER_GOOGLE_CONNECTOR_FIELDS.map((field) => ({ ...field })),
  },
};

export const TIMETABLE_PREFERENCES_PRESET: ManualNodePreset = {
  name: "Timetable Preferences",
  emoji: "\u{1F4DD}",
  bgColor: "#FDE68A",
  id: "timetablePreferences",
  type: "FormNode",
  summary: "Capture schedule style, block lengths, and visual timetable or Fitbit notes.",
  defaultSettings: {
    name: "Timetable Preferences",
    description:
      "Capture how the user prefers the day to feel so the planner can shape a timetable around real schedule style, existing routines, and Fitbit context.",
    submitLabel: "Save timetable preferences",
    fields: TRACKER_TIMETABLE_PREFERENCE_FIELDS.map((field) => ({ ...field })),
  },
};

export const TIMETABLE_PLANNER_PRESET: ManualNodePreset = {
  name: "Timetable Planner",
  emoji: "\u{1F5D3}",
  bgColor: "#DCFCE7",
  id: "timetablePlanner",
  type: "AgentNode",
  summary: "Turn the check-in, history, and domain insights into a realistic day plan.",
  defaultSettings: {
    name: "Timetable Planner",
    domain: "timetable",
    instruction:
      "Create today's timetable using the daily check-in, timetable preferences, reusable memory, recent memory timeline, Google and Fitbit placeholders, and outputs from the upstream life-area analysis nodes. Score all eight life areas from 1 to 10, choose the single best next action, create a realistic ordered schedule for today, note carry-forward items, and warn about overload or conflicts. Respect existing timetable notes, Fitbit or health notes, preferred block lengths, and scheduling style when they are present. Also return AI suggestions for what is actually blocking progress, which habits are creating stress, where time is leaking, what should be automated deferred or removed, and which single decision would unlock the most downstream benefit. Prefer continuity with past patterns when it helps, but adapt to today's sleep, energy, tasks, and fixed commitments. Return only JSON matching the schema.",
    includeHistory: true,
    model: "qwen3:14b-q4_K_M",
    output: "json",
    schema: TRACKER_TIMETABLE_SCHEMA,
  },
};

export const TRACKER_NODE_PRESETS: ManualNodePreset[] = [
  DAILY_CHECK_IN_PRESET,
  TIMETABLE_PREFERENCES_PRESET,
  GOOGLE_CONNECTOR_PRESET,
  ...TRACKER_DOMAIN_PRESETS,
  TIMETABLE_PLANNER_PRESET,
];

const TRACKER_KEYWORD_GROUPS: Record<string, string[]> = {
  sleep: ["sleep", "rest", "bedtime", "wake", "tired", "fatigue"],
  energy: ["energy", "exhausted", "slump", "stamina", "recharge"],
  focus: ["focus", "attention", "deep work", "distraction", "concentration"],
  work: ["work", "job", "project", "deadline", "meeting", "deliverable"],
  money: ["money", "finance", "budget", "expense", "bill", "income"],
  friendsFamily: ["family", "friends", "relationship", "call", "support"],
  health: ["health", "exercise", "workout", "food", "meal", "recovery", "stress"],
  littleJobs: ["errand", "admin", "chore", "small task", "little job", "todo", "task"],
};

const DEFAULT_TRACKER_DOMAIN_IDS = ["sleep", "energy", "focus", "work"];
const TRACKER_RUNTIME_MEMORY_KEYS = new Set<string>(
  [
    ...TRACKER_DAILY_CHECK_IN_FIELDS,
    ...TRACKER_TIMETABLE_PREFERENCE_FIELDS,
    ...TRACKER_GOOGLE_CONNECTOR_FIELDS,
  ]
    .map((field) => field.memoryKey)
    .filter(Boolean)
);

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function parseJsonCandidate(value: unknown) {
  if (!value) {
    return null;
  }

  if (typeof value === "object") {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toNumericScore(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Math.max(0, Math.min(10, Math.round(numeric)));
}

function isTrackerPlanCandidate(value: unknown): value is Record<string, any> {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as Record<string, unknown>).scores &&
      Array.isArray((value as Record<string, unknown>).todayPlan)
  );
}

function readTrackerChangeAssistantRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as TrackerChangeAssistantRecord)
    : null;
}

function formatMetricValue(memoryKey: string, value: unknown) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "No saved check-in yet";
  }

  if (memoryKey === "sleep_hours") {
    return `${normalized} hours logged`;
  }

  return `${normalized}/10 latest check-in`;
}

function createTrackerBlueprintNode(
  preset: ManualNodePreset,
  suffix?: string,
  overrides?: Record<string, any>
) {
  const nextId = suffix ? `${preset.id}-${suffix}` : preset.id;
  const nextSettings = {
    ...deepClone(preset.defaultSettings),
    ...(overrides || {}),
  };

  return {
    id: nextId,
    type: preset.type,
    label: preset.name,
    settings: nextSettings,
  };
}

function findPresetById(id: string) {
  return TRACKER_NODE_PRESETS.find((preset) => preset.id === id);
}

function buildTrackerSummaryText(
  prompt: string,
  clarificationAnswers: TrackerClarificationAnswer[] = []
) {
  const answerText = clarificationAnswers
    .map((answer) => `${normalizeText(answer.label || answer.question)} ${normalizeText(answer.answer)}`)
    .join(" ");

  return `${normalizeText(prompt)} ${answerText}`.trim().toLowerCase();
}

export function isTrackerWorkflowRequest(...values: unknown[]) {
  const haystack = values
    .map((value) => normalizeText(value).toLowerCase())
    .filter(Boolean)
    .join(" ");

  if (!haystack) {
    return false;
  }

  return [
    "sleep",
    "energy",
    "focus",
    "timetable",
    "calendar",
    "gmail",
    "errands",
    "little jobs",
    "day plan",
    "daily plan",
    "workflow canvas",
    "tracker",
    "work",
    "health",
    "friends",
    "family",
    "money",
  ].some((keyword) => haystack.includes(keyword));
}

export function isTrackerAgentDefinition({
  nodes = [],
  runtimeConfig,
}: {
  nodes?: any[];
  runtimeConfig?: any;
}) {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const safeRunSetupFields = Array.isArray(runtimeConfig?.runSetup?.fields)
    ? runtimeConfig.runSetup.fields
    : [];
  const safeFlow = Array.isArray(runtimeConfig?.flow?.flow)
    ? runtimeConfig.flow.flow
    : [];

  if (
    safeRunSetupFields.some((field: any) =>
      TRACKER_RUNTIME_MEMORY_KEYS.has(String(field?.memoryKey || field?.id || ""))
    )
  ) {
    return true;
  }

  if (
    safeFlow.some((node: any) => {
      const nodeId = String(node?.id || "").toLowerCase();
      const label = String(node?.label || node?.settings?.name || "").toLowerCase();
      const domain = String(node?.settings?.domain || "").toLowerCase();

      return (
        nodeId.includes("timetable") ||
        label.includes("timetable") ||
        label.includes("daily check-in") ||
        domain === "timetable"
      );
    })
  ) {
    return true;
  }

  return safeNodes.some((node: any) => {
    const nodeId = String(node?.id || "").toLowerCase();
    const paletteId = String(node?.data?.id || "").toLowerCase();
    const label = String(node?.data?.label || node?.label || "").toLowerCase();
    const domain = String(node?.data?.settings?.domain || "").toLowerCase();

    return (
      nodeId.includes("timetable") ||
      paletteId === "dailycheckin" ||
      label.includes("timetable") ||
      label.includes("daily check-in") ||
      domain === "timetable"
    );
  });
}

export function formatTrackerUnexpectedChangeSummary(
  change: TrackerUnexpectedChangeInput
) {
  const changeLabel =
    TRACKER_UNEXPECTED_CHANGE_TYPES.find((option) => option.value === change.changeType)
      ?.label || "Unexpected change";
  const parts = [changeLabel];

  if (normalizeText(change.itemTitle)) {
    parts.push(normalizeText(change.itemTitle));
  }

  const originalTime = normalizeText(change.originalTime);
  const newTime = normalizeText(change.newTime);
  if (originalTime && newTime) {
    parts.push(`${originalTime} -> ${newTime}`);
  } else if (newTime) {
    parts.push(`now at ${newTime}`);
  } else if (originalTime) {
    parts.push(`was at ${originalTime}`);
  }

  const flexibility =
    TRACKER_UNEXPECTED_CHANGE_FLEXIBILITY_OPTIONS.find(
      (option) => option.value === change.flexibility
    )?.label || "";
  if (flexibility) {
    parts.push(`${flexibility.toLowerCase()} constraint`);
  }

  const impact =
    TRACKER_UNEXPECTED_CHANGE_IMPACT_OPTIONS.find(
      (option) => option.value === change.impact
    )?.label || "";
  if (impact) {
    parts.push(`${impact.toLowerCase()} impact`);
  }

  if (normalizeText(change.notes)) {
    parts.push(normalizeText(change.notes));
  }

  return parts.filter(Boolean).join(" | ");
}

export function getManualNodePresets() {
  return TRACKER_NODE_PRESETS.map((preset) => ({
    ...preset,
    defaultSettings: deepClone(preset.defaultSettings),
  }));
}

export function createTrackerPresetNode(presetId: string, position = { x: 0, y: 100 }) {
  const preset = findPresetById(presetId);
  if (!preset) {
    return null;
  }

  const clonedSettings = deepClone(preset.defaultSettings);

  return {
    id: `${preset.id}-${Date.now()}`,
    position,
    data: {
      label: preset.name,
      emoji: preset.emoji,
      bgColor: preset.bgColor,
      id: preset.id,
      type: preset.type,
      settings: clonedSettings,
    },
    type: preset.type,
  };
}

export function pickTrackerDomainIds(
  prompt: string,
  clarificationAnswers: TrackerClarificationAnswer[] = []
) {
  const trackerText = buildTrackerSummaryText(prompt, clarificationAnswers);
  const matchedIds = Object.entries(TRACKER_KEYWORD_GROUPS)
    .filter(([, keywords]) => keywords.some((keyword) => trackerText.includes(keyword)))
    .map(([id]) => id);
  const nextIds = [...matchedIds];

  for (const defaultId of DEFAULT_TRACKER_DOMAIN_IDS) {
    if (nextIds.length >= 4) {
      break;
    }

    if (!nextIds.includes(defaultId)) {
      nextIds.push(defaultId);
    }
  }

  return nextIds.slice(0, 4);
}

export function buildTrackerWorkflowBlueprint({
  prompt,
  clarificationAnswers = [],
}: {
  prompt: string;
  clarificationAnswers?: TrackerClarificationAnswer[];
}) {
  const selectedDomainIds = pickTrackerDomainIds(prompt, clarificationAnswers);
  const dailyCheckIn = createTrackerBlueprintNode(DAILY_CHECK_IN_PRESET);
  const timetablePreferences = createTrackerBlueprintNode(TIMETABLE_PREFERENCES_PRESET);
  const googleConnector = createTrackerBlueprintNode(GOOGLE_CONNECTOR_PRESET);
  const timetablePlanner = createTrackerBlueprintNode(TIMETABLE_PLANNER_PRESET);
  const endNode = {
    id: "end",
    type: "EndNode" as const,
    label: "Complete",
    settings: {
      schema: TRACKER_TIMETABLE_SCHEMA,
    },
  };
  const domainNodes = selectedDomainIds
    .map((id) => findPresetById(id))
    .filter(Boolean)
    .map((preset) => createTrackerBlueprintNode(preset as ManualNodePreset));

  const nodes = [
    dailyCheckIn,
    timetablePreferences,
    googleConnector,
    ...domainNodes,
    timetablePlanner,
    endNode,
  ];
  const edges: Array<{ source: string; target: string; sourceHandle?: string }> = [
    { source: dailyCheckIn.id, target: timetablePreferences.id },
    { source: timetablePreferences.id, target: googleConnector.id },
  ];

  if (domainNodes.length) {
    edges.push({ source: googleConnector.id, target: domainNodes[0].id });
    domainNodes.forEach((node, index) => {
      const nextNode = domainNodes[index + 1];
      if (nextNode) {
        edges.push({ source: node.id, target: nextNode.id });
        edges.push({ source: node.id, target: timetablePlanner.id });
      } else {
        edges.push({ source: node.id, target: timetablePlanner.id });
      }
    });
  } else {
    edges.push({ source: googleConnector.id, target: timetablePlanner.id });
  }

  edges.push({ source: timetablePlanner.id, target: endNode.id });

  return {
    nodes,
    edges,
    selectedDomainIds,
  };
}

export function layoutTrackerCanvasGraph(canvas: { nodes: any[]; edges: any[] }) {
  const domainNodes = canvas.nodes.filter((node) =>
    TRACKER_DOMAIN_PRESETS.some((preset) => node.id === preset.id)
  );
  const timetableNode = canvas.nodes.find((node) => node.id === TIMETABLE_PLANNER_PRESET.id);
  const endNode = canvas.nodes.find((node) => node.type === "EndNode" || node.id === "end");
  const averageDomainY = domainNodes.length
    ? Math.round(70 + ((domainNodes.length - 1) * 180) / 2)
    : 220;
  const positionedNodes = canvas.nodes.map((node) => {
      if (node.id === "start") {
        return {
          ...node,
          position: { x: 80, y: 220 },
        };
      }

      if (node.id === DAILY_CHECK_IN_PRESET.id) {
        return {
          ...node,
          position: { x: 340, y: 120 },
        };
      }

      if (node.id === TIMETABLE_PREFERENCES_PRESET.id) {
        return {
          ...node,
          position: { x: 660, y: 120 },
        };
      }

      if (node.id === GOOGLE_CONNECTOR_PRESET.id) {
        return {
          ...node,
          position: { x: 980, y: 120 },
        };
      }

      const domainIndex = domainNodes.findIndex((candidate) => candidate.id === node.id);
      if (domainIndex >= 0) {
        return {
          ...node,
          position: {
            x: 1320,
            y: 70 + domainIndex * 180,
          },
        };
      }

      if (timetableNode && node.id === timetableNode.id) {
        return {
          ...node,
          position: {
            x: 1700,
            y: Math.max(120, averageDomainY),
          },
        };
      }

      if (endNode && node.id === endNode.id) {
        return {
          ...node,
          position: {
            x: 2040,
            y: Math.max(120, averageDomainY),
          },
        };
      }

      return node;
    });
  const preferredOrder = [
    "start",
    DAILY_CHECK_IN_PRESET.id,
    TIMETABLE_PREFERENCES_PRESET.id,
    GOOGLE_CONNECTOR_PRESET.id,
    ...TRACKER_DOMAIN_PRESETS.map((preset) => preset.id),
    TIMETABLE_PLANNER_PRESET.id,
    endNode?.id || "end",
  ];
  const orderedNodes = [
    ...preferredOrder
      .map((id) => positionedNodes.find((node) => node.id === id))
      .filter(Boolean),
    ...positionedNodes.filter((node) => !preferredOrder.includes(node.id)),
  ];

  return {
    nodes: orderedNodes,
    edges: canvas.edges,
  };
}

export function resolveLatestTrackerPlan(runState?: Record<string, any>) {
  const state = runState && typeof runState === "object" ? runState : {};
  const changeAssistant = readTrackerChangeAssistantRecord(state.trackerChangeAssistant);
  const preferredCandidates = [
    changeAssistant?.latestPlan,
    state.replannedTrackerOutput,
  ];

  for (const candidate of preferredCandidates) {
    const parsed = parseJsonCandidate(candidate);
    if (isTrackerPlanCandidate(parsed)) {
      return {
        plan: parsed,
        source: "change_assistant" as TrackerPlanSource,
        updatedAt: normalizeText(changeAssistant?.updatedAt),
        changeSummary: normalizeText(changeAssistant?.changeSummary),
        assistantMessage: normalizeText(changeAssistant?.assistantMessage),
      };
    }
  }

  const nodeOutputs =
    state.nodeOutputs && typeof state.nodeOutputs === "object" ? state.nodeOutputs : {};
  const candidates = [
    state.finalOutput,
    state.latestOutput,
    ...Object.values(nodeOutputs),
  ];

  for (const candidate of candidates) {
    const parsed = parseJsonCandidate(candidate);
    if (isTrackerPlanCandidate(parsed)) {
      return {
        plan: parsed,
        source: "workflow" as TrackerPlanSource,
        updatedAt: "",
        changeSummary: "",
        assistantMessage: "",
      };
    }
  }

  return {
    plan: null,
    source: "workflow" as TrackerPlanSource,
    updatedAt: "",
    changeSummary: "",
    assistantMessage: "",
  };
}

export function findTimetableOutputCandidate(runState?: Record<string, any>) {
  return resolveLatestTrackerPlan(runState).plan;
}

export function buildTrackerDashboardModel({
  persistedRun,
  currentRunState,
  memoryEntries = [],
  memoryTimeline = [],
}: {
  persistedRun?: PersistedRunLike | null;
  currentRunState?: Record<string, any> | null;
  memoryEntries?: TrackerMemoryEntry[];
  memoryTimeline?: TrackerMemoryEvent[];
}): TrackerDashboardModel {
  const resolvedState =
    currentRunState && typeof currentRunState === "object"
      ? currentRunState
      : persistedRun?.state && typeof persistedRun.state === "object"
        ? persistedRun.state
        : {};
  const planResolution = resolveLatestTrackerPlan(resolvedState);
  const timetableOutput = planResolution.plan;

  const metrics = TRACKER_METRIC_DEFINITIONS.map((definition) => {
    const entry = memoryEntries.find((candidate) => candidate.memoryKey === definition.memoryKey);
    const history = memoryTimeline.filter(
      (candidate) => candidate.memoryKey === definition.memoryKey
    );
    const rawScore =
      timetableOutput && timetableOutput.scores
        ? (timetableOutput.scores as Record<string, unknown>)[definition.key]
        : undefined;

    return {
      key: definition.key,
      label: definition.label,
      score: toNumericScore(rawScore),
      latestValue: formatMetricValue(definition.memoryKey, entry?.value),
      historyCount: history.length,
    };
  });

  if (!timetableOutput) {
    return {
      ready: false,
      metrics,
      suggestedAction: "",
      reasoning: "",
      insights: {
        progressBlocker: "",
        stressHabits: "",
        timeLeaks: "",
        automateDeferRemove: "",
        unlockDecision: "",
      },
      warnings: [],
      carryForward: [],
      todayPlan: [],
      planSource: "workflow",
      activeNodeId: persistedRun?.currentNodeId || null,
    };
  }

  const todayPlan = Array.isArray(timetableOutput.todayPlan)
    ? timetableOutput.todayPlan
        .map((item) => {
          const typedItem =
            item && typeof item === "object" ? (item as Record<string, unknown>) : {};
          return {
            start: normalizeText(typedItem.start),
            end: normalizeText(typedItem.end),
            title: normalizeText(typedItem.title),
            category: normalizeText(typedItem.category),
            reason: normalizeText(typedItem.reason),
          } satisfies TrackerDashboardPlanItem;
        })
        .filter((item) => item.title)
    : [];

  return {
    ready: true,
    metrics,
    suggestedAction: normalizeText(timetableOutput.suggestedAction),
    reasoning: normalizeText(timetableOutput.reasoning),
    insights: {
      progressBlocker: normalizeText(
        timetableOutput.insights?.progressBlocker
      ),
      stressHabits: normalizeText(timetableOutput.insights?.stressHabits),
      timeLeaks: normalizeText(timetableOutput.insights?.timeLeaks),
      automateDeferRemove: normalizeText(
        timetableOutput.insights?.automateDeferRemove
      ),
      unlockDecision: normalizeText(
        timetableOutput.insights?.unlockDecision
      ),
    },
    warnings: Array.isArray(timetableOutput.warnings)
      ? timetableOutput.warnings.map((item: unknown) => normalizeText(item)).filter(Boolean)
      : [],
    carryForward: Array.isArray(timetableOutput.carryForward)
      ? timetableOutput.carryForward.map((item: unknown) => normalizeText(item)).filter(Boolean)
      : [],
    todayPlan,
    planSource: planResolution.source,
    lastUpdatedAt: planResolution.updatedAt || undefined,
    changeSummary: planResolution.changeSummary || undefined,
    changeAssistantMessage: planResolution.assistantMessage || undefined,
    activeNodeId: persistedRun?.currentNodeId || null,
  };
}

export function buildTrackerMemoryContext(memoryEntries: TrackerMemoryEntry[] = []) {
  if (!memoryEntries.length) {
    return "No saved tracker memory yet.";
  }

  return memoryEntries
    .map(
      (entry) =>
        `${entry.memoryKey}: ${typeof entry.value === "string" ? entry.value : JSON.stringify(entry.value)}`
    )
    .join("\n");
}

export function buildTrackerMemoryTimelineContext(memoryTimeline: TrackerMemoryEvent[] = []) {
  if (!memoryTimeline.length) {
    return "No tracker memory timeline yet.";
  }

  return memoryTimeline
    .slice(0, 12)
    .map((event, index) => {
      const value =
        typeof event.value === "string" ? event.value : JSON.stringify(event.value);
      return `${index + 1}. ${event.memoryKey}: ${value} (${normalizeText(event.updatedAt) || "unknown time"})`;
    })
    .join("\n");
}
