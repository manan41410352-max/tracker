import type { BuilderClarificationQuestion, BuilderMemoryEntry } from "@/lib/agent-builder";

type TrackerTopicPack = {
  title: string;
  description: string;
  questions: BuilderClarificationQuestion[];
};

const TRACKER_DOMAIN_LIBRARY: Record<string, TrackerTopicPack> = {
  sleep: {
    title: "Sleep Intake",
    description:
      "Capture the sleep details that most strongly change recovery, energy, and how aggressive today's schedule should be.",
    questions: [
      {
        id: "sleep_quality",
        label: "Sleep quality",
        question: "How would you rate last night's sleep quality overall?",
        responseType: "mcq",
        options: ["Very poor", "Poor", "Okay", "Good", "Excellent"],
        required: true,
        placeholder: "Choose sleep quality",
        memoryKey: "sleep_quality",
      },
      {
        id: "sleep_disruptions",
        label: "Sleep disruptions",
        question: "What disrupted sleep, if anything?",
        responseType: "short-answer",
        options: [],
        required: false,
        placeholder: "Late bedtime, stress, waking up often, none",
        memoryKey: "sleep_disruptions",
      },
      {
        id: "sleep_priority",
        label: "Sleep priority",
        question: "What should today's plan protect because sleep was strong or weak?",
        responseType: "short-answer",
        options: [],
        required: true,
        placeholder: "Recovery, deep work, lighter evening, nap window",
        memoryKey: "sleep_priority",
      },
    ],
  },
  energy: {
    title: "Energy Intake",
    description:
      "Identify the user's likely high-energy windows, crash points, and recovery levers before the planner builds the day.",
    questions: [
      {
        id: "energy_pattern",
        label: "Energy pattern",
        question: "When do you expect your best energy window today?",
        responseType: "mcq",
        options: ["Early morning", "Late morning", "Afternoon", "Evening", "Unclear today"],
        required: true,
        placeholder: "Choose the strongest window",
        memoryKey: "energy_pattern",
      },
      {
        id: "energy_drains",
        label: "Energy drains",
        question: "What is most likely to drain your energy today?",
        responseType: "short-answer",
        options: [],
        required: false,
        placeholder: "Meetings, travel, bad sleep, stress, errands",
        memoryKey: "energy_drains",
      },
      {
        id: "energy_support",
        label: "Energy support",
        question: "What usually restores your energy fastest when you dip?",
        responseType: "short-answer",
        options: [],
        required: true,
        placeholder: "Walk, snack, coffee, quiet break, stretching",
        memoryKey: "energy_support",
      },
    ],
  },
  focus: {
    title: "Focus Intake",
    description:
      "Clarify the user's best target for concentration, likely distractions, and the boundary the timetable should protect.",
    questions: [
      {
        id: "focus_target",
        label: "Focus target",
        question: "What single task deserves your best attention today?",
        responseType: "short-answer",
        options: [],
        required: true,
        placeholder: "One project, assignment, or outcome",
        memoryKey: "focus_target",
      },
      {
        id: "focus_block_length",
        label: "Focus block length",
        question: "What deep-work block length feels realistic today?",
        responseType: "mcq",
        options: ["25 minutes", "45 minutes", "60 minutes", "90 minutes"],
        required: true,
        placeholder: "Choose a block length",
        memoryKey: "focus_block_length",
      },
      {
        id: "focus_distractions",
        label: "Likely distractions",
        question: "What is most likely to break your focus today?",
        responseType: "short-answer",
        options: [],
        required: false,
        placeholder: "Slack, WhatsApp, chores, noise, tabs",
        memoryKey: "focus_distractions",
      },
    ],
  },
  work: {
    title: "Work Intake",
    description:
      "Give the work block enough context to choose the highest-value output and fit it into a realistic day.",
    questions: [
      {
        id: "work_priority",
        label: "Work priority",
        question: "What work outcome matters most if today goes well?",
        responseType: "short-answer",
        options: [],
        required: true,
        placeholder: "A deliverable, meeting prep, review, or deadline",
        memoryKey: "work_priority",
      },
      {
        id: "work_deadline_pressure",
        label: "Deadline pressure",
        question: "How intense is work deadline pressure today?",
        responseType: "mcq",
        options: ["Low", "Moderate", "High", "Critical"],
        required: true,
        placeholder: "Choose today's pressure level",
        memoryKey: "work_deadline_pressure",
      },
      {
        id: "work_can_wait",
        label: "Can wait",
        question: "What work item could safely move if the day gets tight?",
        responseType: "short-answer",
        options: [],
        required: false,
        placeholder: "Something nice-to-have or lower leverage",
        memoryKey: "work_can_wait",
      },
    ],
  },
  money: {
    title: "Money Intake",
    description:
      "Capture the finance pressure or decision that may need space in today's plan.",
    questions: [
      {
        id: "money_concern",
        label: "Money concern",
        question: "What money issue feels most urgent right now?",
        responseType: "short-answer",
        options: [],
        required: true,
        placeholder: "Bills, savings, budgeting, income, payments",
        memoryKey: "money_concern",
      },
      {
        id: "money_action_size",
        label: "Action size",
        question: "What size of money action is realistic today?",
        responseType: "mcq",
        options: ["5-minute check", "One focused task", "A full planning block", "Nothing today"],
        required: true,
        placeholder: "Choose the best fit",
        memoryKey: "money_action_size",
      },
      {
        id: "money_relief",
        label: "Relief move",
        question: "What would reduce money stress the fastest today?",
        responseType: "short-answer",
        options: [],
        required: false,
        placeholder: "Pay a bill, review spending, send an invoice",
        memoryKey: "money_relief",
      },
    ],
  },
  friendsFamily: {
    title: "Friends & Family Intake",
    description:
      "Highlight the relationship follow-through that matters most so it doesn't get crowded out by work.",
    questions: [
      {
        id: "relationship_priority",
        label: "Relationship priority",
        question: "Who or what relationship action matters most today?",
        responseType: "short-answer",
        options: [],
        required: true,
        placeholder: "Call, message, visit, boundary, support",
        memoryKey: "relationship_priority",
      },
      {
        id: "relationship_urgency",
        label: "Relationship urgency",
        question: "How time-sensitive is this relationship task?",
        responseType: "mcq",
        options: ["Can wait", "Should happen today", "Needs a fixed time", "Urgent"],
        required: true,
        placeholder: "Choose urgency",
        memoryKey: "relationship_urgency",
      },
      {
        id: "relationship_energy",
        label: "Relationship energy",
        question: "Would this interaction recharge you or require extra energy?",
        responseType: "mcq",
        options: ["Recharging", "Neutral", "Energy-heavy", "Mixed"],
        required: false,
        placeholder: "Choose the energy impact",
        memoryKey: "relationship_energy",
      },
    ],
  },
  health: {
    title: "Health Intake",
    description:
      "Capture the smallest health move with the biggest payoff, including Fitbit-driven context when available.",
    questions: [
      {
        id: "health_goal",
        label: "Health goal",
        question: "What health outcome matters most today?",
        responseType: "short-answer",
        options: [],
        required: true,
        placeholder: "Workout, steps, meals, hydration, recovery",
        memoryKey: "health_goal",
      },
      {
        id: "health_capacity",
        label: "Health capacity",
        question: "How much physical or recovery effort feels realistic today?",
        responseType: "mcq",
        options: ["Recovery only", "Light activity", "Moderate effort", "Hard training"],
        required: true,
        placeholder: "Choose today's capacity",
        memoryKey: "health_capacity",
      },
      {
        id: "health_signal",
        label: "Health signal",
        question: "What body signal or Fitbit trend should the planner respect today?",
        responseType: "short-answer",
        options: [],
        required: false,
        placeholder: "Poor sleep score, soreness, low steps, high resting heart rate",
        memoryKey: "health_signal",
      },
    ],
  },
  littleJobs: {
    title: "Little Jobs Intake",
    description:
      "Batch errands and admin cleanly by surfacing what is urgent, what is noisy, and what would buy the most relief.",
    questions: [
      {
        id: "little_jobs_top_item",
        label: "Top little job",
        question: "Which small task would create the biggest mental relief if finished today?",
        responseType: "short-answer",
        options: [],
        required: true,
        placeholder: "One errand, email, payment, or follow-up",
        memoryKey: "little_jobs_top_item",
      },
      {
        id: "little_jobs_batch_size",
        label: "Batch size",
        question: "How much errand/admin time fits today without derailing the plan?",
        responseType: "mcq",
        options: ["15 minutes", "30 minutes", "45 minutes", "60+ minutes"],
        required: true,
        placeholder: "Choose the right batch size",
        memoryKey: "little_jobs_batch_size",
      },
      {
        id: "little_jobs_carry_forward",
        label: "Safe to delay",
        question: "What small job can safely roll to later if needed?",
        responseType: "short-answer",
        options: [],
        required: false,
        placeholder: "One lower-priority small task",
        memoryKey: "little_jobs_carry_forward",
      },
    ],
  },
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function isTrackerTopicDomainId(domainId: string) {
  return Object.prototype.hasOwnProperty.call(TRACKER_DOMAIN_LIBRARY, domainId);
}

export function getTrackerTopicDomainIds() {
  return Object.keys(TRACKER_DOMAIN_LIBRARY);
}

export function buildTrackerTopicFallbackPack(domainId: string, domainName?: string): TrackerTopicPack {
  const fallbackTitle = `${domainName || "Tracker"} Intake`;
  const fallback = TRACKER_DOMAIN_LIBRARY[domainId];

  if (fallback) {
    return {
      title: fallback.title,
      description: fallback.description,
      questions: fallback.questions.map((question) => ({ ...question })),
    };
  }

  return {
    title: fallbackTitle,
    description:
      "Capture the details this topic needs before the workflow tries to plan around it.",
    questions: [
      {
        id: `${slugify(domainId || "topic")}_priority`,
        label: `${domainName || "Topic"} priority`,
        question: `What matters most in ${domainName || "this topic"} today?`,
        responseType: "short-answer",
        options: [],
        required: true,
        placeholder: "Describe the outcome that matters most",
        memoryKey: `${slugify(domainId || "topic")}_priority`,
      },
      {
        id: `${slugify(domainId || "topic")}_constraint`,
        label: `${domainName || "Topic"} constraint`,
        question: `What constraint should the planner respect for ${domainName || "this topic"}?`,
        responseType: "short-answer",
        options: [],
        required: false,
        placeholder: "Time, energy, deadline, recovery, logistics",
        memoryKey: `${slugify(domainId || "topic")}_constraint`,
      },
    ],
  };
}

export function buildTrackerTopicAnswerSummary(
  pack: TrackerTopicPack,
  answers: Record<string, string>
) {
  return pack.questions
    .map((question) => {
      const value = String(answers[question.id] || "").trim();
      if (!value) {
        return null;
      }

      return `${question.label}: ${value}`;
    })
    .filter(Boolean)
    .join("\n");
}

export function buildTrackerTopicBuilderMemoryEntries(
  pack: TrackerTopicPack,
  answers: Record<string, string>
) {
  const updatedAt = new Date().toISOString();

  return pack.questions
    .map((question) => {
      const value = String(answers[question.id] || "").trim();
      if (!value) {
        return null;
      }

      return {
        key: question.memoryKey || question.id,
        label: question.label,
        value,
        updatedAt,
      } satisfies BuilderMemoryEntry;
    })
    .filter(Boolean) as BuilderMemoryEntry[];
}

export function buildTrackerTopicFormNode({
  domainId,
  domainName,
  pack,
  position,
}: {
  domainId: string;
  domainName: string;
  pack: TrackerTopicPack;
  position: { x: number; y: number };
}) {
  return {
    id: `${domainId}-intake-${Date.now()}`,
    position,
    type: "FormNode",
    data: {
      label: pack.title || `${domainName} Intake`,
      emoji: "?",
      bgColor: "#F5E6A8",
      id: `${domainId}Intake`,
      type: "FormNode",
      settings: {
        name: pack.title || `${domainName} Intake`,
        description: pack.description,
        submitLabel: `Save ${domainName} answers`,
        fields: pack.questions.map((question, index) => ({
          id: question.id || `${slugify(domainId)}_question_${index + 1}`,
          label: question.label,
          type: question.responseType === "mcq" ? "single-select" : "long-text",
          required: question.required ?? true,
          options: Array.isArray(question.options) ? question.options : [],
          placeholder: question.placeholder || question.question,
          memoryKey: question.memoryKey || question.id,
          reusable: true,
        })),
      },
    },
  };
}

export function applyTrackerTopicSummaryToAgentNode(
  node: any,
  summary: string
) {
  if (!summary.trim()) {
    return node;
  }

  const currentInstruction = String(node?.data?.settings?.instruction || "").trim();

  return {
    ...node,
    data: {
      ...(node?.data || {}),
      settings: {
        ...(node?.data?.settings || {}),
        instruction: `${currentInstruction}\n\nUser-provided topic profile:\n${summary}`.trim(),
      },
    },
  };
}
