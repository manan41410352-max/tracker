import { getOllamaBaseUrl, getOllamaModel } from "@/lib/ollama";

export type ConfigGroup = {
  id: string;
  title: string;
  description: string;
  envs: string[];
  ready: boolean;
};

const hasValue = (value?: string) => Boolean(value?.trim());

export function getBraveCdpUrl() {
  return String(process.env.BRAVE_CDP_URL || "http://127.0.0.1:9222").trim();
}

export function getBrowserAutomationProfile() {
  return String(process.env.BRAVE_AUTOMATION_PROFILE || "automation").trim() || "automation";
}

export function getBrowserUserProfile() {
  return String(process.env.BRAVE_USER_PROFILE || "user").trim() || "user";
}

export function getSetupStatus() {
  const convexReady = hasValue(process.env.NEXT_PUBLIC_CONVEX_URL);
  const ollamaReady = hasValue(getOllamaBaseUrl()) && hasValue(getOllamaModel());
  const arcjetReady = !process.env.ARCJET_KEY || hasValue(process.env.ARCJET_KEY);
  const braveReady = hasValue(getBraveCdpUrl());

  const groups: ConfigGroup[] = [
    {
      id: "database",
      title: "Realtime Database",
      description: "Convex stores users, agents, nodes, and conversations.",
      envs: ["NEXT_PUBLIC_CONVEX_URL"],
      ready: convexReady,
    },
    {
      id: "ai",
      title: "Local AI Runtime",
      description: `Ollama serves ${getOllamaModel()} from ${getOllamaBaseUrl()} with fallback support if needed.`,
      envs: ["OLLAMA_BASE_URL", "OLLAMA_MODEL", "OLLAMA_FALLBACK_MODEL"],
      ready: ollamaReady,
    },
    {
      id: "rate-limit",
      title: "Rate Limiting",
      description: "Arcjet is optional and only used for API protection.",
      envs: ["ARCJET_KEY"],
      ready: arcjetReady,
    },
    {
      id: "browser",
      title: "Attached Browser Runtime",
      description: `Preview keeps Brave attached over ${getBraveCdpUrl()} for browser automation and ChatGPT browser fallback.`,
      envs: [
        "BRAVE_CDP_URL",
        "BRAVE_AUTOMATION_PROFILE",
        "BRAVE_USER_PROFILE",
        "CHATGPT_BROWSER_CDP_ENDPOINT",
        "CHATGPT_BROWSER_URL",
      ],
      ready: braveReady,
    },
  ];

  return {
    groups,
    missingGroups: groups.filter((group) => !group.ready),
    convexReady,
    ollamaReady,
    arcjetReady,
    braveReady,
    dashboardReady: convexReady,
    builderReady: convexReady,
  };
}
