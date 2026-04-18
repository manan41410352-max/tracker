import "server-only";

import dns from "node:dns/promises";

import { chromium, type BrowserContext, type Page } from "playwright";

import { ollamaGenerateJson } from "@/lib/ollama";
import { researchInternet } from "@/lib/web-tools";
import type {
  BrowserSiteSource,
  BrowserProvider,
  BrowserServiceStatus,
  BrowserSnapshotRef,
  BrowserWorkspaceState,
  DiscoveredBrowserSite,
} from "@/lib/runtime-types";
import { tryParseJson } from "@/lib/server/runtime-utils";

type BrowserAction =
  | {
      type: "fill" | "type";
      ref?: string;
      selector?: string;
      value?: string;
      text?: string;
      submit?: boolean;
    }
  | {
      type: "click";
      ref?: string;
      selector?: string;
      doubleClick?: boolean;
    }
  | {
      type: "press";
      key: string;
    }
  | {
      type: "scroll";
      direction?: "up" | "down";
      amount?: number;
    }
  | {
      type: "wait";
      milliseconds?: number;
    };

type BrowserRefMetadata = {
  selector: string;
  role?: string;
  name?: string;
  text?: string;
  nth?: number;
  tagName?: string;
  input?: boolean;
};

export type BrowserSessionState = {
  provider?: BrowserProvider;
  profile?: string;
  workspaceKey?: string;
  targetId?: string;
  tabId?: string;
  lastUrl?: string;
  lastTitle?: string;
  serviceStatus?: BrowserServiceStatus;
  availableRefs?: BrowserSnapshotRef[];
  refMap?: Record<string, BrowserRefMetadata>;
  resolvedUrl?: string;
  resolvedSiteSource?: BrowserSiteSource;
  discoveredSite?: DiscoveredBrowserSite;
};

type BrowserSnapshot = {
  ok: boolean;
  provider: BrowserProvider;
  currentUrl: string;
  title: string;
  width: number;
  height: number;
  screenshotBase64: string;
  blocked: boolean;
  requiresManualIntervention: boolean;
  manualInterventionReason?: string;
  profile?: string;
  targetId?: string;
  tabId?: string;
  refs?: BrowserSnapshotRef[];
  refMap?: Record<string, BrowserRefMetadata>;
  snapshotText?: string;
  resolvedUrl?: string;
  resolvedSiteSource?: BrowserSiteSource;
  discoveredSite?: DiscoveredBrowserSite;
};

type BrowserTaskStep = {
  index: number;
  status: "planned" | "completed" | "stalled";
  reason: string;
  action?: BrowserAction;
  url?: string;
  title?: string;
  observation?: string;
};

export type ResolvedBrowserSite = {
  resolvedUrl?: string;
  resolvedSiteSource?: BrowserSiteSource;
  discoveredSite?: DiscoveredBrowserSite;
};

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

const CHALLENGE_PATTERNS = [
  /cloudflare/i,
  /attention required/i,
  /verify you are human/i,
  /captcha/i,
  /hcaptcha/i,
  /recaptcha/i,
  /turnstile/i,
  /arkose/i,
  /arkoselabs/i,
  /data ?dome/i,
  /perimeterx/i,
  /human verification/i,
  /security check/i,
  /checking your browser/i,
  /access denied/i,
];

const MANUAL_TAKEOVER_PATTERNS = [
  /sign in/i,
  /log in/i,
  /login/i,
  /checkout/i,
  /payment/i,
  /otp/i,
  /two[- ]factor/i,
  /verify identity/i,
];

const USER_SESSION_PATTERNS = [
  /gmail/i,
  /\binbox\b/i,
  /\bemail\b/i,
  /\bdashboard\b/i,
  /\bportal\b/i,
  /\baccount\b/i,
  /\badmin\b/i,
  /\bconsole\b/i,
  /\bworkspace\b/i,
];

const BRAVE_CONNECT_TIMEOUT_MS = 15_000;
const BRAVE_PAGE_LOAD_TIMEOUT_MS = 30_000;
const MAX_BROWSER_REFS = 40;
const DEFAULT_BROWSER_TASK_MAX_STEPS = 6;

// Singleton page cache keyed by workspaceKey — prevents multiple tabs opening for the same task.
const bravePageSingleton = new Map<
  string,
  {
    targetId: string;
    marker: string;
    cachedAt: number;
  }
>();

const BRAVE_SINGLETON_TTL_MS = 60_000;

function isTruthyEnv(value?: string, defaultValue = false) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return defaultValue;
  }

  return !["0", "false", "off", "no"].includes(normalized);
}

function shouldBringBraveToFront() {
  if (process.env.BRAVE_BRING_TO_FRONT?.trim()) {
    return isTruthyEnv(process.env.BRAVE_BRING_TO_FRONT);
  }

  return !isTruthyEnv(process.env.BRAVE_RUN_IN_BACKGROUND, true);
}

function isDockerRuntime() {
  return String(process.env.DOCKER_ENV || "").trim().toLowerCase() === "true";
}

function getDockerAwareUrl({
  localEnvName,
  dockerEnvName,
  localDefault,
  dockerDefault,
}: {
  localEnvName: string;
  dockerEnvName: string;
  localDefault: string;
  dockerDefault: string;
}) {
  if (isDockerRuntime()) {
    return (
      String(process.env[dockerEnvName] || "").trim() ||
      dockerDefault
    );
  }

  return (
    String(process.env[localEnvName] || "").trim() ||
    localDefault
  );
}

function getWorkspaceCdpUrl() {
  return getDockerAwareUrl({
    localEnvName: "BRAVE_CDP_URL",
    dockerEnvName: "BRAVE_CDP_URL_DOCKER",
    localDefault: "http://127.0.0.1:9222",
    dockerDefault: "http://host.docker.internal:9222",
  });
}

function getAutomationBrowserProfile() {
  return String(process.env.BRAVE_AUTOMATION_PROFILE || "automation").trim() || "automation";
}

function getUserBrowserProfile() {
  return String(process.env.BRAVE_USER_PROFILE || "user").trim() || "user";
}

function normalizeProfilePreference(value?: string) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  const lower = normalized.toLowerCase();
  if (lower === "auto") {
    return "";
  }

  if (lower === "user") {
    return "user";
  }

  return "automation";
}

function stripRootSlash(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

async function resolveDockerHostUrl(url: string) {
  if (!isDockerRuntime()) {
    return url;
  }

  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "host.docker.internal") {
      return url;
    }

    const { address } = await dns.lookup(parsed.hostname);
    parsed.hostname = address;
    return stripRootSlash(parsed.toString());
  } catch {
    return url;
  }
}

async function getWorkspaceCdpUrlCandidates() {
  const configuredUrl = getWorkspaceCdpUrl();
  const resolvedUrl = await resolveDockerHostUrl(configuredUrl);

  return Array.from(
    new Set(
      [resolvedUrl, configuredUrl]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function shouldPreferSignedInUserSession({
  goal,
  url,
  siteName,
}: {
  goal?: string;
  url?: string;
  siteName?: string;
}) {
  const haystack = `${goal || ""}\n${url || ""}\n${siteName || ""}`;
  return USER_SESSION_PATTERNS.some((pattern) => pattern.test(haystack));
}

export function resolvePreferredBrowserProfile({
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
  const explicitProfile =
    normalizeProfilePreference(requestedProfile) ||
    normalizeProfilePreference(rememberedProfile);

  if (explicitProfile) {
    return explicitProfile;
  }

  if (
    reuseSignedInSession &&
    shouldPreferSignedInUserSession({
      goal,
      url,
      siteName,
    })
  ) {
    return getUserBrowserProfile();
  }

  return getAutomationBrowserProfile();
}

function resolveWorkspaceKey(
  workspaceKey?: string,
  browserSession?: BrowserSessionState,
  conversationId?: string
) {
  return (
    workspaceKey?.trim() ||
    browserSession?.workspaceKey?.trim() ||
    conversationId?.trim() ||
    "preview"
  );
}

function buildBraveWorkspaceMarker(workspaceKey: string) {
  return `__systematic_tracker_preview__:${workspaceKey}`;
}

function normalizeRefList(rawRefs: unknown) {
  if (Array.isArray(rawRefs)) {
    return rawRefs
      .map((entry) => {
        const typed = entry && typeof entry === "object" ? (entry as Record<string, any>) : null;
        if (!typed?.ref) {
          return null;
        }

        return {
          ref: String(typed.ref),
          role: typed.role ? String(typed.role) : undefined,
          name: typed.name ? String(typed.name) : undefined,
          nth: typeof typed.nth === "number" ? typed.nth : undefined,
          text: typed.text ? String(typed.text) : undefined,
          selector: typed.selector ? String(typed.selector) : undefined,
        } satisfies BrowserSnapshotRef;
      })
      .filter(Boolean) as BrowserSnapshotRef[];
  }

  if (!rawRefs || typeof rawRefs !== "object") {
    return [];
  }

  return Object.entries(rawRefs as Record<string, any>)
    .map(([ref, value]) => {
      const typed = value && typeof value === "object" ? value : {};
      return {
        ref,
        role: typed.role ? String(typed.role) : undefined,
        name: typed.name ? String(typed.name) : undefined,
        nth: typeof typed.nth === "number" ? typed.nth : undefined,
        text: typed.text ? String(typed.text) : undefined,
        selector: typed.selector ? String(typed.selector) : undefined,
      } satisfies BrowserSnapshotRef;
    })
    .slice(0, MAX_BROWSER_REFS);
}

function detectManualIntervention(title: string, text: string, url: string) {
  const haystack = `${title}\n${text}\n${url}`;

  if (CHALLENGE_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return {
      blocked: true,
      requiresManualIntervention: true,
      manualInterventionReason:
        "A CAPTCHA or bot-check is on this page. Complete the verification manually in the browser workspace, then resume the workflow.",
    };
  }

  if (MANUAL_TAKEOVER_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return {
      blocked: false,
      requiresManualIntervention: true,
      manualInterventionReason:
        "This page looks like a login, payment, or verification step. Complete it in the browser workspace, then resume the workflow.",
    };
  }

  return {
    blocked: false,
    requiresManualIntervention: false,
    manualInterventionReason: undefined,
  };
}

function scoreRelevantLines(text: string, goal?: string) {
  const keywords = (goal || "")
    .match(/[a-zA-Z0-9]{3,}/g)
    ?.map((token) => token.toLowerCase()) ?? [];

  if (!keywords.length) {
    return [];
  }

  const seen = new Set<string>();
  return text
    .split(/\n|\./)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      line,
      score: keywords.reduce(
        (total, keyword) => total + (line.toLowerCase().includes(keyword) ? 1 : 0),
        0
      ),
    }))
    .filter((item) => item.score > 0 && !seen.has(item.line) && seen.add(item.line))
    .sort((a, b) => b.score - a.score || a.line.length - b.line.length)
    .slice(0, 8)
    .map((item) => item.line);
}

function buildBrowserSessionState({
  provider,
  profile,
  workspaceKey,
  targetId,
  tabId,
  lastUrl,
  lastTitle,
  availableRefs,
  refMap,
  resolvedUrl,
  resolvedSiteSource,
  discoveredSite,
}: {
  provider: BrowserProvider;
  profile?: string;
  workspaceKey?: string;
  targetId?: string;
  tabId?: string;
  lastUrl?: string;
  lastTitle?: string;
  availableRefs?: BrowserSnapshotRef[];
  refMap?: Record<string, BrowserRefMetadata>;
  resolvedUrl?: string;
  resolvedSiteSource?: BrowserSiteSource;
  discoveredSite?: DiscoveredBrowserSite;
}) {
  return {
    provider,
    profile,
    workspaceKey,
    targetId,
    tabId,
    lastUrl,
    lastTitle,
    serviceStatus: "ready",
    availableRefs,
    refMap,
    resolvedUrl: resolvedUrl || lastUrl,
    resolvedSiteSource:
      resolvedSiteSource || (lastUrl ? ("current_page" as const) : undefined),
    discoveredSite,
  } satisfies BrowserSessionState;
}

function buildBrowserStateFromSnapshot(
  snapshot: BrowserSnapshot,
  conversationId?: string,
  resolvedSite?: ResolvedBrowserSite
) {
  return {
    url: snapshot.currentUrl,
    title: snapshot.title,
    mode: conversationId ? ("live" as const) : ("detached" as const),
    provider: snapshot.provider,
    profile: snapshot.profile,
    tabId: snapshot.tabId,
    targetId: snapshot.targetId,
    availableRefs: snapshot.refs,
    lastError: snapshot.manualInterventionReason,
    serviceStatus: "ready" as const,
    resolvedUrl:
      resolvedSite?.resolvedUrl ||
      snapshot.resolvedUrl ||
      snapshot.currentUrl,
    resolvedSiteSource:
      resolvedSite?.resolvedSiteSource ||
      snapshot.resolvedSiteSource ||
      (snapshot.currentUrl ? ("current_page" as const) : undefined),
    discoveredSite:
      resolvedSite?.discoveredSite ||
      snapshot.discoveredSite,
  };
}

function buildRefMap(refs?: BrowserSnapshotRef[], refMap?: Record<string, BrowserRefMetadata>) {
  if (refMap && Object.keys(refMap).length) {
    return refMap;
  }

  return Object.fromEntries(
    (refs || [])
      .filter((item) => item.ref && item.selector)
      .map((item) => [
        item.ref,
        {
          selector: item.selector as string,
          role: item.role,
          name: item.name,
          text: item.text,
          nth: item.nth,
        } satisfies BrowserRefMetadata,
      ])
  );
}

function parseActions(rawActions?: unknown): BrowserAction[] {
  if (!rawActions) {
    return [];
  }

  const parsed =
    typeof rawActions === "string"
      ? (() => {
          try {
            return JSON.parse(rawActions);
          } catch {
            return [];
          }
        })()
      : rawActions;

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map((action) => {
      if (!action || typeof action !== "object") {
        return null;
      }

      const typed = action as Record<string, unknown>;
      if (
        (typed.type === "fill" || typed.type === "type") &&
        (typed.ref || typed.selector) &&
        (typed.value !== undefined || typed.text !== undefined)
      ) {
        return {
          type: typed.type,
          ref: typed.ref ? String(typed.ref) : undefined,
          selector: typed.selector ? String(typed.selector) : undefined,
          value: typed.value !== undefined ? String(typed.value) : undefined,
          text: typed.text !== undefined ? String(typed.text) : undefined,
          submit: Boolean(typed.submit),
        } satisfies BrowserAction;
      }

      if (typed.type === "click" && (typed.ref || typed.selector)) {
        return {
          type: "click",
          ref: typed.ref ? String(typed.ref) : undefined,
          selector: typed.selector ? String(typed.selector) : undefined,
          doubleClick: Boolean(typed.doubleClick),
        } satisfies BrowserAction;
      }

      if (typed.type === "press" && typed.key) {
        return {
          type: "press",
          key: String(typed.key),
        } satisfies BrowserAction;
      }

      if (typed.type === "scroll") {
        const direction =
          String(typed.direction || "down").toLowerCase() === "up" ? "up" : "down";
        const rawAmount = Number(typed.amount || typed.distance || typed.pixels || 900);

        return {
          type: "scroll",
          direction,
          amount: Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : 900,
        } satisfies BrowserAction;
      }

      if (typed.type === "wait") {
        return {
          type: "wait",
          milliseconds: Number(typed.milliseconds || typed.timeMs || 0),
        } satisfies BrowserAction;
      }

      return null;
    })
    .filter(Boolean) as BrowserAction[];
}

function isBlankWorkspaceUrl(url?: string) {
  const normalized = String(url || "").trim().toLowerCase();
  return (
    !normalized ||
    normalized === "about:blank" ||
    normalized === "chrome://newtab/" ||
    normalized === "chrome://newtab" ||
    normalized === "brave://newtab/" ||
    normalized === "brave://newtab"
  );
}

function normalizeVisitedUrl(url?: string) {
  const candidate = String(url || "").trim();
  return candidate && !isBlankWorkspaceUrl(candidate) ? candidate : "";
}

function normalizePublicWebsiteUrl(url?: string) {
  const candidate = normalizeVisitedUrl(url);
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

const MULTI_PART_PUBLIC_SUFFIXES = new Set([
  "ac.uk",
  "co.in",
  "co.jp",
  "co.kr",
  "co.nz",
  "co.uk",
  "com.au",
  "com.br",
  "com.mx",
  "com.sg",
  "gov.uk",
  "net.au",
  "org.au",
  "org.in",
  "org.uk",
]);

function normalizeSiteComparisonKey(url?: string) {
  const normalizedUrl = normalizePublicWebsiteUrl(url);
  if (!normalizedUrl) {
    return "";
  }

  try {
    const hostname = new URL(normalizedUrl).hostname.toLowerCase();
    const parts = hostname.split(".").filter(Boolean);
    if (parts.length <= 2) {
      return hostname;
    }

    const tail2 = parts.slice(-2).join(".");
    if (MULTI_PART_PUBLIC_SUFFIXES.has(tail2) && parts.length >= 3) {
      return parts.slice(-3).join(".");
    }

    return tail2;
  } catch {
    return "";
  }
}

function siteKeysMatch(left?: string, right?: string) {
  const leftKey = normalizeSiteComparisonKey(left);
  const rightKey = normalizeSiteComparisonKey(right);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
}

export async function discoverWebsiteForGoal({
  goal,
  preferredModel,
  nodeName,
}: {
  goal: string;
  preferredModel?: string;
  nodeName?: string;
}): Promise<DiscoveredBrowserSite> {
  const trimmedGoal = String(goal || "").trim();
  if (!trimmedGoal) {
    return {
      query: "",
      recommendedUrl: "",
      siteName: "",
      reason: "",
      nextStep: "",
      rememberedUrlMatchedTask: false,
      sources: [],
    };
  }

  const research = await researchInternet(trimmedGoal, 6);
  const sources = Array.isArray(research.results) ? research.results.slice(0, 6) : [];
  const pages = Array.isArray(research.pages) ? research.pages.slice(0, 3) : [];

  const recommendation = await ollamaGenerateJson(
    `You are selecting the best public website for a local browser agent.
Return only valid JSON in this exact shape:
{
  "recommendedUrl": "",
  "siteName": "",
  "reason": "",
  "nextStep": ""
}

Node:
${nodeName || "Website research"}

Task / browsing goal:
${trimmedGoal}

Candidate search results:
${JSON.stringify(sources, null, 2)}

Candidate page summaries:
${JSON.stringify(
      pages.map((page) => ({
        title: page.title,
        url: page.url,
        excerpt: page.excerpt,
        content: String(page.content || "").slice(0, 1400),
      })),
      null,
      2
    )}

Rules:
- Pick one public website that is the strongest first destination for the task.
- Prefer the official website or the most task-relevant public page.
- Do not ask the user for a URL.
- recommendedUrl must be a single http or https URL.
- nextStep should describe what the browser agent should do after landing on the site.`,
    preferredModel
  );

  const parsed = tryParseJson(recommendation) ?? {};
  const recommendedUrl =
    normalizePublicWebsiteUrl((parsed as any)?.recommendedUrl) ||
    normalizePublicWebsiteUrl((parsed as any)?.url) ||
    normalizePublicWebsiteUrl(sources[0]?.url);
  const matchingSource =
    sources.find((item) => item.url === recommendedUrl) ||
    sources.find((item) => normalizePublicWebsiteUrl(item.url) === recommendedUrl);

  return {
    query: trimmedGoal,
    recommendedUrl,
    siteName: String(
      (parsed as any)?.siteName ||
        matchingSource?.title ||
        (recommendedUrl ? new URL(recommendedUrl).hostname : "")
    ).trim(),
    reason: String(
      (parsed as any)?.reason ||
        matchingSource?.snippet ||
        "This was the strongest public site found for the task."
    ).trim(),
    nextStep: String(
      (parsed as any)?.nextStep || "Inspect the page and continue the workflow."
    ).trim(),
    rememberedUrlMatchedTask: false,
    sources: sources.map((item) => ({
      title: String(item.title || ""),
      url: String(item.url || ""),
      snippet: String(item.snippet || ""),
    })),
  };
}

export async function resolveBrowserSite({
  url,
  browserSession,
  rememberedUrl,
  goal,
  preferredModel,
  nodeName,
}: {
  url?: string;
  browserSession?: BrowserSessionState;
  rememberedUrl?: string;
  goal?: string;
  preferredModel?: string;
  nodeName?: string;
}): Promise<ResolvedBrowserSite> {
  const explicitUrl = normalizePublicWebsiteUrl(url);
  if (explicitUrl) {
    return {
      resolvedUrl: explicitUrl,
      resolvedSiteSource: "override",
    };
  }

  const currentPageUrl = normalizePublicWebsiteUrl(browserSession?.lastUrl);
  const rememberedSiteUrl = normalizePublicWebsiteUrl(rememberedUrl);
  const trimmedGoal = String(goal || "").trim();
  if (!trimmedGoal) {
    if (currentPageUrl) {
      return {
        resolvedUrl: currentPageUrl,
        resolvedSiteSource: "current_page",
      };
    }

    return rememberedSiteUrl
      ? {
          resolvedUrl: rememberedSiteUrl,
          resolvedSiteSource: "memory",
        }
      : {};
  }

  const discoveredSite = await discoverWebsiteForGoal({
    goal: trimmedGoal,
    preferredModel,
    nodeName,
  });
  const discoveredUrl = normalizePublicWebsiteUrl(discoveredSite.recommendedUrl);
  const rememberedUrlMatchedTask =
    rememberedSiteUrl && discoveredUrl
      ? siteKeysMatch(rememberedSiteUrl, discoveredUrl)
      : false;
  const nextDiscoveredSite = {
    ...discoveredSite,
    recommendedUrl: discoveredUrl,
    rememberedUrlMatchedTask,
  } satisfies DiscoveredBrowserSite;

  if (currentPageUrl && discoveredUrl && siteKeysMatch(currentPageUrl, discoveredUrl)) {
    return {
      resolvedUrl: currentPageUrl,
      resolvedSiteSource: "current_page",
      discoveredSite: nextDiscoveredSite,
    };
  }

  if (rememberedSiteUrl && discoveredUrl && rememberedUrlMatchedTask) {
    return {
      resolvedUrl: rememberedSiteUrl,
      resolvedSiteSource: "memory",
      discoveredSite: nextDiscoveredSite,
    };
  }

  if (discoveredUrl) {
    return {
      resolvedUrl: discoveredUrl,
      resolvedSiteSource: "discovery",
      discoveredSite: nextDiscoveredSite,
    };
  }

  if (currentPageUrl) {
    return {
      resolvedUrl: currentPageUrl,
      resolvedSiteSource: "current_page",
      discoveredSite: nextDiscoveredSite,
    };
  }

  return {
    discoveredSite: nextDiscoveredSite,
  };
}

function resolveVisitTargetUrl({
  url,
  browserSession,
  rememberedUrl,
}: {
  url?: string;
  browserSession?: BrowserSessionState;
  rememberedUrl?: string;
}) {
  return (
    normalizePublicWebsiteUrl(url) ||
    normalizePublicWebsiteUrl(browserSession?.lastUrl) ||
    normalizePublicWebsiteUrl(rememberedUrl)
  );
}

function hasReusableBrowserTarget(browserSession?: BrowserSessionState) {
  return Boolean(
    browserSession?.tabId ||
      browserSession?.targetId ||
      normalizeVisitedUrl(browserSession?.lastUrl)
  );
}

function isBraveProviderUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /Brave CDP|ECONNREFUSED|Target page, context or browser has been closed|WebSocket|connect ECONNREFUSED|browserType\.connectOverCDP/i.test(
    message
  );
}

async function connectToWorkspaceBrowser() {
  const configuredUrl = getWorkspaceCdpUrl();
  const candidates = await getWorkspaceCdpUrlCandidates();
  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      return await chromium.connectOverCDP(candidate, {
        timeout: BRAVE_CONNECT_TIMEOUT_MS,
      });
    } catch (error) {
      lastError = error;
    }
  }

  const attemptedUrls =
    candidates.length > 1
      ? ` Tried ${candidates.join(" and ")}.`
      : "";
  const errorSuffix =
    lastError instanceof Error && lastError.message
      ? ` ${lastError.message}`
      : "";

  throw new Error(
    `Brave CDP is unavailable at ${configuredUrl}.${attemptedUrls} Start Brave with --remote-debugging-port=9222 and retry.${errorSuffix}`
  );
}

async function waitForPageReady(page: Page) {
  await page.waitForLoadState("domcontentloaded", {
    timeout: BRAVE_PAGE_LOAD_TIMEOUT_MS,
  }).catch(() => {});
  await page.waitForTimeout(250).catch(() => {});
}

async function getBraveTargetId(context: BrowserContext, page: Page) {
  const session = await context.newCDPSession(page);
  const info = await session.send("Target.getTargetInfo");
  return String(info.targetInfo?.targetId || "");
}

async function readWindowName(page: Page) {
  try {
    return String((await page.evaluate(() => window.name || "")) || "");
  } catch {
    return "";
  }
}

async function ensureWindowName(page: Page, marker: string) {
  if (!marker) {
    return;
  }

  try {
    await page.evaluate((value) => {
      window.name = value;
    }, marker);
  } catch {
    // Ignore early document execution failures.
  }
}

async function installWindowNameMarker(page: Page, marker: string) {
  if (!marker) {
    return;
  }

  try {
    await page.addInitScript((value) => {
      window.name = value;
    }, marker);
  } catch {
    // Ignore init-script registration failures and fall back to setting the current document.
  }

  await ensureWindowName(page, marker);
}

type BravePageRecord = {
  page: Page;
  targetId: string;
  url: string;
  title: string;
  marker: string;
};

async function collectBravePages(context: BrowserContext) {
  const records: BravePageRecord[] = [];

  for (const page of context.pages()) {
    records.push({
      page,
      targetId: await getBraveTargetId(context, page).catch(() => ""),
      url: page.url(),
      title: await page.title().catch(() => ""),
      marker: await readWindowName(page),
    });
  }

  return records;
}

function pickBravePageRecord(
  records: BravePageRecord[],
  browserSession?: BrowserSessionState,
  marker?: string
) {
  const preferredTabId = browserSession?.tabId || browserSession?.targetId;
  if (preferredTabId) {
    const matchedById = records.find((record) => record.targetId === preferredTabId);
    if (matchedById) {
      return matchedById;
    }
  }

  if (marker) {
    const matchedByMarker = records.find((record) => record.marker === marker);
    if (matchedByMarker) {
      return matchedByMarker;
    }
  }

  return null;
}

async function ensureWorkspaceTargetPage({
  browserSession,
  workspaceKey,
  createIfMissing = true,
}: {
  browserSession?: BrowserSessionState;
  workspaceKey: string;
  createIfMissing?: boolean;
}) {
  const browser = await connectToWorkspaceBrowser();
  const context = browser.contexts()[0] || (await browser.newContext());
  const marker = buildBraveWorkspaceMarker(workspaceKey);
  const records = await collectBravePages(context);

  // 1. Check singleton cache first — never open a new tab if we already have one for this workspace
  const singleton = bravePageSingleton.get(workspaceKey);
  if (singleton && Date.now() - singleton.cachedAt < BRAVE_SINGLETON_TTL_MS) {
    const cachedRecord = records.find((r) => r.targetId === singleton.targetId);
    if (cachedRecord) {
      if (shouldBringBraveToFront()) {
        await cachedRecord.page.bringToFront().catch(() => {});
      }
      return {
        browser,
        page: cachedRecord.page,
        targetId: cachedRecord.targetId,
      };
    }
    // Singleton stale — evict and fall through
    bravePageSingleton.delete(workspaceKey);
  }

  let matched = pickBravePageRecord(records, browserSession, marker);

  if (!matched) {
    if (!createIfMissing) {
      return {
        browser,
        page: null,
        targetId: "",
      };
    }

    // Only open a new page if no existing page can be reused at all
    const blankOrUnmarked = records.find(
      (r) => isBlankWorkspaceUrl(r.url) || !r.marker
    );

    let page: import("playwright").Page;
    if (blankOrUnmarked) {
      // Reuse the blank/unmarked tab instead of opening yet another one
      page = blankOrUnmarked.page;
    } else {
      page = await context.newPage();
      await waitForPageReady(page);
    }

    await installWindowNameMarker(page, marker);
    const targetId = blankOrUnmarked
      ? blankOrUnmarked.targetId || await getBraveTargetId(context, page)
      : await getBraveTargetId(context, page);

    matched = {
      page,
      targetId,
      url: page.url(),
      title: await page.title().catch(() => ""),
      marker,
    };
  } else if (matched.marker !== marker) {
    await installWindowNameMarker(matched.page, marker);
  }

  if (shouldBringBraveToFront()) {
    await matched.page.bringToFront().catch(() => {});
  }

  // Cache so subsequent calls reuse this tab
  bravePageSingleton.set(workspaceKey, {
    targetId: matched.targetId,
    marker,
    cachedAt: Date.now(),
  });

  return {
    browser,
    page: matched.page,
    targetId: matched.targetId,
  };
}

async function navigateBravePage(page: Page, url: string) {
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: BRAVE_PAGE_LOAD_TIMEOUT_MS,
  });
  await waitForPageReady(page);
}

async function readBraveSnapshot(page: Page): Promise<{
  refs: BrowserSnapshotRef[];
  refMap: Record<string, BrowserRefMetadata>;
  snapshotText: string;
  width: number;
  height: number;
}> {
  return await page.evaluate((maxRefs) => {
    const cleanText = (value: string, limit = 160) =>
      String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, limit);

    const isVisible = (element: Element) => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }

      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0" &&
        rect.width > 0 &&
        rect.height > 0
      );
    };

    const inferRole = (element: Element) => {
      const explicitRole = element.getAttribute("role");
      if (explicitRole) {
        return explicitRole;
      }

      const tagName = element.tagName.toLowerCase();
      if (tagName === "a") return "link";
      if (tagName === "button") return "button";
      if (tagName === "textarea") return "textbox";
      if (tagName === "select") return "combobox";
      if (tagName === "summary") return "button";
      if (tagName === "input") {
        const type = (element.getAttribute("type") || "text").toLowerCase();
        if (["button", "submit", "reset", "image"].includes(type)) return "button";
        if (type === "checkbox") return "checkbox";
        if (type === "radio") return "radio";
        return "textbox";
      }
      if ((element as HTMLElement).isContentEditable) return "textbox";
      return "generic";
    };

    const isInteractive = (element: Element) => {
      if (!(element instanceof HTMLElement) || !isVisible(element)) {
        return false;
      }

      if (
        element.matches(
          'a[href], button, input, textarea, select, summary, [contenteditable=""], [contenteditable="true"], [tabindex]:not([tabindex="-1"])'
        )
      ) {
        return !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true";
      }

      return Boolean(element.getAttribute("role")) && !element.hasAttribute("disabled");
    };

    const getName = (element: Element) => {
      if (element instanceof HTMLInputElement) {
        const type = (element.type || "").toLowerCase();
        if (["button", "submit", "reset"].includes(type) && element.value) {
          return cleanText(element.value);
        }
      }

      return cleanText(
        element.getAttribute("aria-label") ||
          element.getAttribute("title") ||
          element.getAttribute("placeholder") ||
          element.getAttribute("alt") ||
          (element as HTMLElement).innerText ||
          element.textContent ||
          ""
      );
    };

    const buildSelector = (element: Element) => {
      if (!(element instanceof HTMLElement)) {
        return "";
      }

      if (element.id) {
        return `#${CSS.escape(element.id)}`;
      }

      const dataTestId =
        element.getAttribute("data-testid") || element.getAttribute("data-testid");
      if (dataTestId) {
        return `[data-testid="${CSS.escape(dataTestId)}"]`;
      }

      const parts: string[] = [];
      let current: HTMLElement | null = element;

      while (current && current !== document.body) {
        let part = current.tagName.toLowerCase();
        const name = current.getAttribute("name");
        if (name) {
          part += `[name="${CSS.escape(name)}"]`;
        }

        const parent: HTMLElement | null = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(
            (candidate) => candidate.tagName === current?.tagName
          );
          if (siblings.length > 1) {
            part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
          }
        }

        parts.unshift(part);
        current = parent;
      }

      return parts.length ? `body > ${parts.join(" > ")}` : "";
    };

    const candidates = Array.from(
      document.querySelectorAll(
        'a[href], button, input, textarea, select, summary, [role], [contenteditable=""], [contenteditable="true"], [tabindex]:not([tabindex="-1"])'
      )
    );
    const seenSelectors = new Set<string>();
    const refs: BrowserSnapshotRef[] = [];
    const refMap: Record<string, BrowserRefMetadata> = {};

    for (const element of candidates) {
      if (refs.length >= maxRefs || !isInteractive(element)) {
        continue;
      }

      const selector = buildSelector(element);
      if (!selector || seenSelectors.has(selector)) {
        continue;
      }

      seenSelectors.add(selector);
      const ref = `ref_${refs.length + 1}`;
      const role = inferRole(element);
      const name = getName(element);
      const text = cleanText((element as HTMLElement).innerText || element.textContent || "", 140);
      const tagName = element.tagName.toLowerCase();
      const isInput =
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement ||
        (element instanceof HTMLElement && element.isContentEditable);

      refs.push({
        ref,
        role,
        name,
        nth: refs.length,
        text,
        selector,
      });
      refMap[ref] = {
        selector,
        role,
        name,
        text,
        nth: refs.length - 1,
        tagName,
        input: isInput,
      };
    }

    return {
      refs,
      refMap,
      snapshotText: cleanText(document.body?.innerText || document.body?.textContent || "", 6000),
      width: window.innerWidth || 1280,
      height: window.innerHeight || 900,
    };
  }, MAX_BROWSER_REFS);
}

async function fetchBraveSnapshot({
  page,
  targetId,
}: {
  page: Page;
  targetId: string;
}): Promise<BrowserSnapshot> {
  await waitForPageReady(page);
  const content = await readBraveSnapshot(page);
  const screenshotBuffer = await page.screenshot({
    type: "png",
    fullPage: false,
  });
  const currentUrl = page.url();
  const title = await page.title().catch(() => currentUrl || "Browser workspace");
  const manualState = detectManualIntervention(title, content.snapshotText, currentUrl);

  return {
    ok: !manualState.blocked,
    provider: "brave_cdp",
    currentUrl,
    title,
    width: Number(content.width || 1280),
    height: Number(content.height || 900),
    screenshotBase64: screenshotBuffer.toString("base64"),
    blocked: manualState.blocked,
    requiresManualIntervention: manualState.requiresManualIntervention,
    manualInterventionReason: manualState.manualInterventionReason,
    tabId: targetId,
    targetId,
    refs: content.refs,
    refMap: content.refMap,
    snapshotText: content.snapshotText,
  } satisfies BrowserSnapshot;
}

function resolveBraveSelector({
  ref,
  selector,
  browserSession,
}: {
  ref?: string;
  selector?: string;
  browserSession?: BrowserSessionState;
}) {
  if (selector?.trim()) {
    return {
      selector: selector.trim(),
      metadata: {
        selector: selector.trim(),
      } satisfies BrowserRefMetadata,
    };
  }

  if (!ref?.trim()) {
    throw new Error("A browser ref or selector is required for this action.");
  }

  const metadata = browserSession?.refMap?.[ref];
  if (!metadata?.selector) {
    throw new Error(`The browser ref "${ref}" is no longer available. Refresh the workspace and retry.`);
  }

  return {
    selector: metadata.selector,
    metadata,
  };
}

async function runBraveAction(
  page: Page,
  action: BrowserAction,
  browserSession?: BrowserSessionState
) {
  if (action.type === "scroll") {
    const amount = Math.max(Number(action.amount || 0), 200);
    const direction = action.direction === "up" ? -1 : 1;

    await page.evaluate(
      (distance) => {
        window.scrollBy({
          top: distance,
          behavior: "smooth",
        });
      },
      direction * amount
    );
    await page.waitForTimeout(350).catch(() => {});
    return;
  }

  if (action.type === "wait") {
    await page.waitForTimeout(Math.max(Number(action.milliseconds || 0), 0));
    return;
  }

  if (action.type === "press") {
    await page.keyboard.press(action.key);
    return;
  }

  const resolved = resolveBraveSelector({
    ref: "ref" in action ? action.ref : undefined,
    selector: "selector" in action ? action.selector : undefined,
    browserSession,
  });
  const locator = page.locator(resolved.selector).first();
  await locator.waitFor({
    state: "visible",
    timeout: 10_000,
  });

  if (action.type === "click") {
    if (action.doubleClick) {
      await locator.dblclick();
    } else {
      await locator.click();
    }
    await page.waitForTimeout(250).catch(() => {});
    return;
  }

  const text = action.text || action.value || "";
  const tagName = resolved.metadata.tagName || "";

  if (tagName === "select") {
    const selected =
      (await locator
        .selectOption({ label: text })
        .catch(() => locator.selectOption(text).catch(() => []))) || [];

    if (!selected.length) {
      throw new Error(`The select field did not contain an option matching "${text}".`);
    }
  } else if (resolved.metadata.input) {
    await locator.fill(text);
  } else {
    await locator.click();
    await page.keyboard.type(text);
  }

  if (action.submit) {
    await page.keyboard.press("Enter");
  }

  await page.waitForTimeout(250).catch(() => {});
}


async function fetchWithHttp(url: string, goal?: string) {
  const response = await fetch(url, {
    headers: DEFAULT_HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  const html = await response.text();
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || url;
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const manualState = detectManualIntervention(title, text, response.url);

  return {
    ok: response.ok && !manualState.blocked,
    blocked: manualState.blocked,
    requiresManualIntervention: manualState.requiresManualIntervention,
    manualInterventionReason: manualState.manualInterventionReason,
    mode: "http",
    url,
    finalUrl: response.url,
    title,
    excerpt: text.slice(0, 1400),
    content: text.slice(0, 6000),
    links: [],
    relevantSnippets: scoreRelevantLines(text.slice(0, 6000), goal),
    browserState: {
      url: response.url,
      title,
      mode: "detached" as const,
      provider: "brave_cdp" as const,
      lastError: manualState.manualInterventionReason,
    },
  };
}

function withPreferredProfile(
  browserSession?: BrowserSessionState,
  profile?: string
) {
  const normalizedProfile = normalizeProfilePreference(profile);
  if (!normalizedProfile) {
    return browserSession;
  }

  return {
    ...browserSession,
    profile: normalizedProfile,
    provider: "brave_cdp",
  } satisfies BrowserSessionState;
}

async function withBraveWorkspace<T>({
  browserSession,
  workspaceKey,
  createIfMissing = true,
  onMissing,
  callback,
}: {
  browserSession?: BrowserSessionState;
  workspaceKey: string;
  createIfMissing?: boolean;
  onMissing?: () => Promise<T> | T;
  callback: (context: {
    page: Page;
    targetId: string;
  }) => Promise<T>;
}) {
  const target = await ensureWorkspaceTargetPage({
    browserSession,
    workspaceKey,
    createIfMissing,
  });

  try {
    if (!target.page || !target.targetId) {
      if (onMissing) {
        return await onMissing();
      }

      throw new Error("No active Brave workspace tab was available.");
    }

    return await callback({
      page: target.page,
      targetId: target.targetId,
    });
  } finally {
    await target.browser.close().catch(() => {});
  }
}

function isBraveWorkspaceUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return (
    isBraveProviderUnavailable(error) ||
    /No active Brave workspace tab was available/i.test(message)
  );
}

function buildVisitResult({
  snapshot,
  resolvedUrl,
  resolvedSite,
  goal,
  browserSession,
  conversationId,
}: {
  snapshot: BrowserSnapshot;
  resolvedUrl: string;
  resolvedSite?: ResolvedBrowserSite;
  goal?: string;
  browserSession: BrowserSessionState;
  conversationId?: string;
}) {
  const content = snapshot.snapshotText || "";
  const nextSnapshot = {
    ...snapshot,
    resolvedUrl: resolvedSite?.resolvedUrl || resolvedUrl,
    resolvedSiteSource: resolvedSite?.resolvedSiteSource,
    discoveredSite: resolvedSite?.discoveredSite,
  } satisfies BrowserSnapshot;

  return {
    ok: !snapshot.blocked,
    blocked: snapshot.blocked,
    requiresManualIntervention: snapshot.requiresManualIntervention,
    manualInterventionReason: snapshot.manualInterventionReason,
    mode: snapshot.provider,
    url: resolvedUrl,
    finalUrl: snapshot.currentUrl || resolvedUrl,
    title: snapshot.title,
    excerpt: content.slice(0, 1400),
    content: content.slice(0, 6000),
    links: [],
    relevantSnippets: scoreRelevantLines(content.slice(0, 6000), goal),
    resolvedUrl: resolvedSite?.resolvedUrl || resolvedUrl,
    resolvedSiteSource: resolvedSite?.resolvedSiteSource,
    discoveredSite: resolvedSite?.discoveredSite,
    browserState: buildBrowserStateFromSnapshot(
      nextSnapshot,
      conversationId,
      resolvedSite
    ),
    snapshot: nextSnapshot,
    browserSession,
  };
}

function buildBrowserTaskManualReason({
  snapshot,
  goal,
  startUrl,
}: {
  snapshot?: BrowserSnapshot | null;
  goal?: string;
  startUrl?: string;
}) {
  const fallbackReason =
    snapshot?.manualInterventionReason ||
    "Manual browser takeover is needed before the workflow can continue.";

  if (
    shouldPreferSignedInUserSession({
      goal,
      url: startUrl || snapshot?.currentUrl,
      siteName: snapshot?.title,
    })
  ) {
    return "This task needs a signed-in browser session. Open the site in the signed-in browser workspace, finish any login or verification, then resume the workflow.";
  }

  return fallbackReason;
}

function summarizeRefsForBrowserTask(refs: BrowserSnapshotRef[] = []) {
  return refs.slice(0, 24).map((item) => ({
    ref: item.ref,
    role: item.role || "",
    label: item.name || item.text || "",
  }));
}

function normalizeBrowserTaskStatus(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();

  if (["completed", "complete", "done", "success"].includes(normalized)) {
    return "completed" as const;
  }

  if (["manual", "manual_browser", "takeover", "pending_browser"].includes(normalized)) {
    return "manual" as const;
  }

  if (["stalled", "blocked", "cannot_continue", "stop"].includes(normalized)) {
    return "stalled" as const;
  }

  return "continue" as const;
}

function normalizeBrowserTaskAction(rawAction?: unknown) {
  const actions = parseActions(rawAction ? [rawAction] : []);
  return actions[0];
}

async function decideNextBrowserTaskStep({
  goal,
  successCriteria,
  websiteHint,
  snapshot,
  steps,
  preferredModel,
}: {
  goal: string;
  successCriteria?: string;
  websiteHint?: string;
  snapshot: BrowserSnapshot;
  steps: BrowserTaskStep[];
  preferredModel?: string;
}) {
  const response = await ollamaGenerateJson(
    `You are planning the next browser action for a local workflow agent.
Return only valid JSON in this exact shape:
{
  "status": "continue",
  "reason": "",
  "result": "",
  "action": {
    "type": "click"
  }
}

Goal:
${goal}

Success criteria:
${successCriteria || "Complete the task and return the end result."}

Website hint:
${websiteHint || "None"}

Current page:
${JSON.stringify(
      {
        url: snapshot.currentUrl,
        title: snapshot.title,
        requiresManualIntervention: snapshot.requiresManualIntervention,
        manualInterventionReason: snapshot.manualInterventionReason || "",
        refs: summarizeRefsForBrowserTask(snapshot.refs),
        snapshotText: String(snapshot.snapshotText || "").slice(0, 5000),
      },
      null,
      2
    )}

Previous steps:
${JSON.stringify(
      steps.map((step) => ({
        index: step.index,
        status: step.status,
        reason: step.reason,
        action: step.action,
        url: step.url,
        title: step.title,
      })),
      null,
      2
    )}

Rules:
- Use "completed" only when the goal is already satisfied on the current page and include a concise result.
- Use "manual" only if the page clearly needs a user to log in, solve CAPTCHA, approve, or verify manually.
- Use "stalled" if the refs/text are insufficient, no valid ref/selector exists, or the workflow is looping.
- Use "continue" only when you provide one action.
- Allowed action types: "click", "type", "press", "scroll", "wait".
- Prefer refs over selectors whenever a useful ref is available in the list above.
- CRITICAL: Only use a ref value that appears EXACTLY in the refs list above. If a suitable ref does not exist, omit the ref entirely and use a CSS selector instead, or set status to "stalled" if no reliable target exists.
- For "type", include either "ref" or "selector", plus "text". Optionally set "submit": true.
- For "press", include "key".
- For "scroll", include optional "direction" and "amount".
- Do not invent refs. Do not ask the user questions.`,
    preferredModel
  );

  const parsed = tryParseJson(response) ?? {};

  const rawAction = (parsed as any)?.action;
  const parsedAction = normalizeBrowserTaskAction(rawAction);

  // Validate ref: if the LLM hallucinated a ref not in the current snapshot, strip it
  let validatedAction = parsedAction;
  if (parsedAction && "ref" in parsedAction && parsedAction.ref) {
    const refExists = (snapshot.refs ?? []).some((r) => r.ref === parsedAction.ref);
    if (!refExists) {
      // Drop the bad ref so the action can still run via selector fallback, or become undefined
      const { ref: _dropped, ...actionWithoutRef } = parsedAction as any;
      const hasSelector = "selector" in actionWithoutRef && actionWithoutRef.selector;
      validatedAction = hasSelector ? actionWithoutRef : undefined;
    }
  }

  return {
    status: validatedAction
      ? normalizeBrowserTaskStatus((parsed as any)?.status)
      : "stalled",
    reason: String((parsed as any)?.reason || "").trim(),
    result: String((parsed as any)?.result || "").trim(),
    action: validatedAction,
  };
}

async function applyBrowserTaskAction({
  action,
  browserSession,
  conversationId,
  profile,
  workspaceKey,
}: {
  action: BrowserAction;
  browserSession?: BrowserSessionState;
  conversationId: string;
  profile?: string;
  workspaceKey?: string;
}) {
  if (action.type === "click") {
    return await clickBrowserWorkspace({
      conversationId,
      ref: action.ref,
      selector: action.selector,
      browserSession,
      profile,
      workspaceKey,
    });
  }

  if (action.type === "fill" || action.type === "type") {
    return await typeBrowserWorkspace({
      conversationId,
      ref: action.ref,
      selector: action.selector,
      text: action.text || action.value || "",
      submit: action.submit,
      browserSession,
      profile,
      workspaceKey,
    });
  }

  if (action.type === "press") {
    return await pressBrowserWorkspaceKey({
      conversationId,
      key: action.key,
      browserSession,
      profile,
      workspaceKey,
    });
  }

  const visitResult = await visitWebsite({
    goal: "",
    browserSession,
    conversationId,
    actions: [action],
    profile,
    workspaceKey,
    rememberedUrl: browserSession?.lastUrl,
  });

  return {
    browserSession:
      "browserSession" in visitResult ? visitResult.browserSession || browserSession : browserSession,
    snapshot: "snapshot" in visitResult ? visitResult.snapshot : undefined,
  };
}

export async function runBrowserTask({
  goal,
  startUrl,
  websiteHint,
  successCriteria,
  profile,
  maxSteps,
  reuseSignedInSession = true,
  browserSession,
  conversationId,
  workspaceKey,
  rememberedUrl,
  preferredModel,
  resolvedSite,
}: {
  goal: string;
  startUrl?: string;
  websiteHint?: string;
  successCriteria?: string;
  profile?: string;
  maxSteps?: number;
  reuseSignedInSession?: boolean;
  browserSession?: BrowserSessionState;
  conversationId: string;
  workspaceKey?: string;
  rememberedUrl?: string;
  preferredModel?: string;
  resolvedSite?: ResolvedBrowserSite;
}) {
  const trimmedGoal = String(goal || "").trim();
  if (!trimmedGoal) {
    return {
      ok: false,
      status: "error",
      error: "browser_task needs a goal before it can continue.",
      steps: [] as BrowserTaskStep[],
      browserSession,
    };
  }

  const nextWorkspaceKey = resolveWorkspaceKey(workspaceKey, browserSession, conversationId);
  const resolvedTarget =
    resolvedSite ||
    (await resolveBrowserSite({
      url: startUrl,
      browserSession,
      rememberedUrl,
      goal: websiteHint || trimmedGoal,
      preferredModel,
      nodeName: "browser_task",
    }));
  const resolvedStartUrl = resolveVisitTargetUrl({
    url: resolvedTarget.resolvedUrl || startUrl,
    browserSession:
      resolvedTarget.resolvedSiteSource === "current_page" ? browserSession : undefined,
    rememberedUrl,
  });
  const preferredProfile = resolvePreferredBrowserProfile({
    requestedProfile: profile,
    rememberedProfile: browserSession?.profile,
    goal: trimmedGoal,
    url: resolvedStartUrl,
    siteName: websiteHint,
    reuseSignedInSession,
  });
  const cappedMaxSteps = Math.min(
    Math.max(Number(maxSteps || DEFAULT_BROWSER_TASK_MAX_STEPS), 1),
    10
  );
  const steps: BrowserTaskStep[] = [];
  let nextBrowserSession = browserSession;
  let currentSnapshot: BrowserSnapshot | null = null;
  let currentUrl = resolvedStartUrl;
  const browserResolution = {
    resolvedUrl: resolvedTarget.resolvedUrl || resolvedStartUrl,
    resolvedSiteSource: resolvedTarget.resolvedSiteSource,
    discoveredSite: resolvedTarget.discoveredSite,
  };

  if (resolvedStartUrl) {
    const visitResult = await visitWebsite({
      url: resolvedStartUrl,
      goal: trimmedGoal,
      browserSession: nextBrowserSession,
      conversationId,
      profile: preferredProfile,
      workspaceKey: nextWorkspaceKey,
      rememberedUrl: resolvedStartUrl,
      preferredModel,
      resolvedSite: resolvedTarget,
    });
    const visitPayload = visitResult as Record<string, any>;

    nextBrowserSession =
      "browserSession" in visitResult ? visitResult.browserSession || nextBrowserSession : nextBrowserSession;
    currentSnapshot =
      "snapshot" in visitResult && visitResult.snapshot
        ? visitResult.snapshot
        : await getBrowserWorkspaceSnapshot({
            conversationId,
            browserSession: nextBrowserSession,
            profile: preferredProfile,
            workspaceKey: nextWorkspaceKey,
          });

    currentUrl = String(visitPayload.finalUrl || currentSnapshot?.currentUrl || resolvedStartUrl);

    if (visitPayload.requiresManualIntervention || currentSnapshot?.requiresManualIntervention) {
      const manualReason = buildBrowserTaskManualReason({
        snapshot: currentSnapshot,
        goal: trimmedGoal,
        startUrl: currentUrl,
      });

      return {
        ok: false,
        status: "pending_browser",
        startUrl: resolvedStartUrl,
        finalUrl: currentUrl,
        title: String(visitPayload.title || currentSnapshot?.title || ""),
        steps,
        result: "",
        relevantSnippets:
          visitPayload.relevantSnippets ||
          scoreRelevantLines(String(currentSnapshot?.snapshotText || "").slice(0, 6000), trimmedGoal),
        requiresManualIntervention: true,
        manualInterventionReason: manualReason,
        browserState: visitPayload.browserState || (currentSnapshot
          ? buildBrowserStateFromSnapshot(currentSnapshot, conversationId, resolvedTarget)
          : undefined),
        browserSession: nextBrowserSession,
        ...browserResolution,
      };
    }
  } else {
    currentSnapshot = await getBrowserWorkspaceSnapshot({
      conversationId,
      browserSession: nextBrowserSession,
      profile: preferredProfile,
      workspaceKey: nextWorkspaceKey,
    });
    currentUrl = currentSnapshot?.currentUrl || "";
  }

  if (!currentSnapshot) {
    return {
      ok: false,
      status: "error",
      startUrl: resolvedStartUrl,
      finalUrl: currentUrl,
      title: "",
      steps,
      result: "",
      relevantSnippets: [],
      requiresManualIntervention: false,
      manualInterventionReason: "",
      browserSession: nextBrowserSession,
      error:
        'browser_task needs a startUrl, a current browser page, a task goal it can research, or a remembered "preview_default_url" before it can continue.',
      ...browserResolution,
    };
  }

  for (let index = 0; index < cappedMaxSteps; index += 1) {
    if (currentSnapshot.requiresManualIntervention) {
      const manualReason = buildBrowserTaskManualReason({
        snapshot: currentSnapshot,
        goal: trimmedGoal,
        startUrl: currentUrl,
      });

      return {
        ok: false,
        status: "pending_browser",
        startUrl: resolvedStartUrl,
        finalUrl: currentSnapshot.currentUrl || currentUrl,
        title: currentSnapshot.title,
        steps,
        result: "",
        relevantSnippets: scoreRelevantLines(
          String(currentSnapshot.snapshotText || "").slice(0, 6000),
          trimmedGoal
        ),
        requiresManualIntervention: true,
        manualInterventionReason: manualReason,
        browserState: buildBrowserStateFromSnapshot(
          currentSnapshot,
          conversationId,
          resolvedTarget
        ),
        browserSession: nextBrowserSession,
        ...browserResolution,
      };
    }

    const decision = await decideNextBrowserTaskStep({
      goal: trimmedGoal,
      successCriteria,
      websiteHint,
      snapshot: currentSnapshot,
      steps,
      preferredModel,
    });

    if (decision.status === "completed") {
      return {
        ok: true,
        status: "completed",
        startUrl: resolvedStartUrl || currentSnapshot.currentUrl || "",
        finalUrl: currentSnapshot.currentUrl || currentUrl,
        title: currentSnapshot.title,
        steps,
        result: decision.result || String(currentSnapshot.snapshotText || "").slice(0, 1200),
        relevantSnippets: scoreRelevantLines(
          String(currentSnapshot.snapshotText || "").slice(0, 6000),
          trimmedGoal
        ),
        requiresManualIntervention: false,
        manualInterventionReason: "",
        browserState: buildBrowserStateFromSnapshot(
          currentSnapshot,
          conversationId,
          resolvedTarget
        ),
        browserSession: nextBrowserSession,
        ...browserResolution,
      };
    }

    if (decision.status === "manual") {
      return {
        ok: false,
        status: "pending_browser",
        startUrl: resolvedStartUrl || currentSnapshot.currentUrl || "",
        finalUrl: currentSnapshot.currentUrl || currentUrl,
        title: currentSnapshot.title,
        steps,
        result: decision.result || "",
        relevantSnippets: scoreRelevantLines(
          String(currentSnapshot.snapshotText || "").slice(0, 6000),
          trimmedGoal
        ),
        requiresManualIntervention: true,
        manualInterventionReason:
          decision.reason ||
          buildBrowserTaskManualReason({
            snapshot: currentSnapshot,
            goal: trimmedGoal,
            startUrl: currentUrl,
          }),
        browserState: buildBrowserStateFromSnapshot(
          currentSnapshot,
          conversationId,
          resolvedTarget
        ),
        browserSession: nextBrowserSession,
        ...browserResolution,
      };
    }

    if (decision.status === "stalled" || !decision.action) {
      steps.push({
        index: index + 1,
        status: "stalled",
        reason:
          decision.reason ||
          "The local browser planner could not find a confident next action.",
        url: currentSnapshot.currentUrl,
        title: currentSnapshot.title,
        observation: String(currentSnapshot.snapshotText || "").slice(0, 280),
      });

      return {
        ok: false,
        status: "stalled",
        startUrl: resolvedStartUrl || currentSnapshot.currentUrl || "",
        finalUrl: currentSnapshot.currentUrl || currentUrl,
        title: currentSnapshot.title,
        steps,
        result: decision.result || "",
        relevantSnippets: scoreRelevantLines(
          String(currentSnapshot.snapshotText || "").slice(0, 6000),
          trimmedGoal
        ),
        requiresManualIntervention: false,
        manualInterventionReason: "",
        browserState: buildBrowserStateFromSnapshot(
          currentSnapshot,
          conversationId,
          resolvedTarget
        ),
        browserSession: nextBrowserSession,
        ...browserResolution,
      };
    }

    const action = decision.action;
    const actionResult = await applyBrowserTaskAction({
      action,
      browserSession: nextBrowserSession,
      conversationId,
      profile: preferredProfile,
      workspaceKey: nextWorkspaceKey,
    });

    nextBrowserSession = actionResult.browserSession || nextBrowserSession;
    currentSnapshot =
      actionResult.snapshot ||
      (await getBrowserWorkspaceSnapshot({
        conversationId,
        browserSession: nextBrowserSession,
        profile: preferredProfile,
        workspaceKey: nextWorkspaceKey,
      }));

    if (!currentSnapshot) {
      steps.push({
        index: index + 1,
        status: "stalled",
        reason: "The browser workspace stopped returning page state after the action.",
        action,
      });

      return {
        ok: false,
        status: "stalled",
        startUrl: resolvedStartUrl || currentUrl,
        finalUrl: currentUrl,
        title: "",
        steps,
        result: "",
        relevantSnippets: [],
        requiresManualIntervention: false,
        manualInterventionReason: "",
        browserSession: nextBrowserSession,
        ...browserResolution,
      };
    }

    currentUrl = currentSnapshot.currentUrl || currentUrl;
    steps.push({
      index: index + 1,
      status: "completed",
      reason: decision.reason || "Applied the next browser action.",
      action,
      url: currentSnapshot.currentUrl,
      title: currentSnapshot.title,
      observation: String(currentSnapshot.snapshotText || "").slice(0, 280),
    });
  }

  return {
    ok: false,
    status: "stalled",
    startUrl: resolvedStartUrl || currentUrl,
    finalUrl: currentUrl,
    title: currentSnapshot.title,
    steps,
    result: "",
    relevantSnippets: scoreRelevantLines(
      String(currentSnapshot.snapshotText || "").slice(0, 6000),
      trimmedGoal
    ),
    requiresManualIntervention: false,
    manualInterventionReason: "",
    browserState: buildBrowserStateFromSnapshot(
      currentSnapshot,
      conversationId,
      resolvedTarget
    ),
    browserSession: nextBrowserSession,
    ...browserResolution,
  };
}

function resolveActiveBrowserProfile(
  requestedProfile?: string,
  browserSession?: BrowserSessionState
) {
  return (
    normalizeProfilePreference(requestedProfile) ||
    normalizeProfilePreference(browserSession?.profile) ||
    getAutomationBrowserProfile()
  );
}

export async function prewarmBrowserWorkspace({
  browserSession,
  profile,
  workspaceKey,
  rememberedUrl,
  goal,
  preferredModel,
}: {
  browserSession?: BrowserSessionState;
  profile?: string;
  workspaceKey?: string;
  rememberedUrl?: string;
  goal?: string;
  preferredModel?: string;
}) {
  const nextWorkspaceKey = resolveWorkspaceKey(workspaceKey, browserSession);
  const preferredBrowserSession = withPreferredProfile(browserSession, profile);
  const activeProfile = resolveActiveBrowserProfile(profile, browserSession);
  const resolvedTarget = await resolveBrowserSite({
    browserSession,
    rememberedUrl,
    goal,
    preferredModel,
    nodeName: "browser_prewarm",
  });
  const resolvedUrl = resolvedTarget.resolvedUrl;
  const browserResolution = {
    resolvedUrl,
    resolvedSiteSource: resolvedTarget.resolvedSiteSource,
    discoveredSite: resolvedTarget.discoveredSite,
  };

  return await withBraveWorkspace<{
    browserSession: BrowserSessionState;
    browserState: BrowserWorkspaceState;
  }>({
    browserSession: {
      ...preferredBrowserSession,
      workspaceKey: nextWorkspaceKey,
    },
    workspaceKey: nextWorkspaceKey,
    createIfMissing:
      Boolean(resolvedUrl && normalizeVisitedUrl(resolvedUrl)) ||
      hasReusableBrowserTarget(preferredBrowserSession),
    onMissing: () => ({
      browserSession: buildBrowserSessionState({
        provider: "brave_cdp",
        profile: activeProfile,
        workspaceKey: nextWorkspaceKey,
        ...browserResolution,
      }),
      browserState: {
        mode: "live" as const,
        provider: "brave_cdp" as const,
        profile: activeProfile,
        serviceStatus: "ready" as const,
        ...browserResolution,
      },
    }),
    callback: async ({ page, targetId }) => {
      if (
        resolvedUrl &&
        (isBlankWorkspaceUrl(page.url()) ||
          (resolvedTarget.resolvedSiteSource !== "current_page" &&
            page.url() !== resolvedUrl))
      ) {
        await navigateBravePage(page, resolvedUrl);
      } else {
        await waitForPageReady(page);
      }

      const snapshot = {
        ...(await fetchBraveSnapshot({
          page,
          targetId,
        })),
        profile: activeProfile,
      } satisfies BrowserSnapshot;

      const nextSession = buildBrowserSessionState({
        provider: "brave_cdp",
        profile: activeProfile,
        workspaceKey: nextWorkspaceKey,
        targetId,
        tabId: targetId,
        lastUrl: snapshot.currentUrl,
        lastTitle: snapshot.title,
        availableRefs: snapshot.refs,
        refMap: buildRefMap(snapshot.refs, snapshot.refMap),
        ...browserResolution,
      });

      return {
        browserSession: nextSession,
        browserState: {
          url: snapshot.currentUrl,
          title: snapshot.title,
          mode: "live" as const,
          provider: "brave_cdp" as const,
          profile: activeProfile,
          tabId: snapshot.tabId,
          targetId: snapshot.targetId,
          availableRefs: snapshot.refs,
          lastError: snapshot.manualInterventionReason,
          serviceStatus: "ready" as const,
          ...browserResolution,
        },
      };
    },
  });
}

export async function visitWebsite({
  url,
  goal,
  browserSession,
  conversationId,
  actions,
  profile,
  workspaceKey,
  rememberedUrl,
  preferredModel,
  resolvedSite,
}: {
  url?: string;
  goal?: string;
  browserSession?: BrowserSessionState;
  conversationId?: string;
  actions?: unknown;
  profile?: string;
  workspaceKey?: string;
  rememberedUrl?: string;
  preferredModel?: string;
  resolvedSite?: ResolvedBrowserSite;
}) {
  const resolvedTarget =
    resolvedSite ||
    (await resolveBrowserSite({
      url,
      browserSession,
      rememberedUrl,
      goal,
      preferredModel,
      nodeName: "browser_visit",
    }));
  const resolvedUrl = resolveVisitTargetUrl({
    url: resolvedTarget.resolvedUrl || url,
    browserSession:
      resolvedTarget.resolvedSiteSource === "current_page" ? browserSession : undefined,
    rememberedUrl,
  });
  const preferredBrowserSession = withPreferredProfile(browserSession, profile);
  const activeProfile = resolveActiveBrowserProfile(profile, browserSession);

  if (!resolvedUrl) {
    return {
      ok: false,
      status: 400,
      error:
        'browser_visit needs a URL, a current browser page, a task goal it can research, or a remembered "preview_default_url" before it can continue.',
      resolvedSiteSource: resolvedTarget.resolvedSiteSource,
      discoveredSite: resolvedTarget.discoveredSite,
    };
  }

  const parsedActions = parseActions(actions);
  const nextWorkspaceKey = resolveWorkspaceKey(workspaceKey, browserSession, conversationId);

  try {
    return await withBraveWorkspace({
      browserSession: {
        ...preferredBrowserSession,
        workspaceKey: nextWorkspaceKey,
      },
      workspaceKey: nextWorkspaceKey,
      callback: async ({ page, targetId }) => {
        if (resolvedUrl !== page.url() || isBlankWorkspaceUrl(page.url())) {
          await navigateBravePage(page, resolvedUrl);
        } else {
          await waitForPageReady(page);
        }

        for (const action of parsedActions) {
          await runBraveAction(page, action, preferredBrowserSession);
        }

        const snapshot = {
          ...(await fetchBraveSnapshot({
            page,
            targetId,
          })),
          profile: activeProfile,
        } satisfies BrowserSnapshot;
        const nextSession = buildBrowserSessionState({
          provider: "brave_cdp",
          profile: activeProfile,
          workspaceKey: nextWorkspaceKey,
          targetId,
          tabId: targetId,
          lastUrl: snapshot.currentUrl || resolvedUrl,
          lastTitle: snapshot.title,
          availableRefs: snapshot.refs,
          refMap: buildRefMap(snapshot.refs, snapshot.refMap),
          resolvedUrl,
          resolvedSiteSource: resolvedTarget.resolvedSiteSource,
          discoveredSite: resolvedTarget.discoveredSite,
        });

        return buildVisitResult({
          snapshot,
          resolvedUrl,
          resolvedSite: resolvedTarget,
          goal,
          browserSession: nextSession,
          conversationId,
        });
      },
    });
  } catch (error) {
    if (conversationId) {
      throw error;
    }

    return fetchWithHttp(resolvedUrl, goal);
  }
}

export async function getBrowserWorkspaceSnapshot({
  conversationId,
  browserSession,
  profile,
  workspaceKey,
}: {
  conversationId: string;
  browserSession?: BrowserSessionState;
  profile?: string;
  workspaceKey?: string;
}) {
  const nextWorkspaceKey = resolveWorkspaceKey(workspaceKey, browserSession, conversationId);
  const preferredBrowserSession = withPreferredProfile(browserSession, profile);
  const activeProfile = resolveActiveBrowserProfile(profile, browserSession);

  return await withBraveWorkspace({
    browserSession: {
      ...preferredBrowserSession,
      workspaceKey: nextWorkspaceKey,
    },
    workspaceKey: nextWorkspaceKey,
    createIfMissing: hasReusableBrowserTarget(preferredBrowserSession),
    onMissing: async () => null,
    callback: async ({ page, targetId }) => ({
      ...(await fetchBraveSnapshot({
        page,
        targetId,
      })),
      profile: activeProfile,
    }),
  });
}

export async function navigateBrowserWorkspace({
  conversationId,
  url,
  browserSession,
  profile,
  workspaceKey,
}: {
  conversationId: string;
  url: string;
  browserSession?: BrowserSessionState;
  profile?: string;
  workspaceKey?: string;
}) {
  const nextWorkspaceKey = resolveWorkspaceKey(workspaceKey, browserSession, conversationId);
  const preferredBrowserSession = withPreferredProfile(browserSession, profile);
  const activeProfile = resolveActiveBrowserProfile(profile, browserSession);

  return await withBraveWorkspace({
    browserSession: {
      ...preferredBrowserSession,
      workspaceKey: nextWorkspaceKey,
    },
    workspaceKey: nextWorkspaceKey,
    callback: async ({ page, targetId }) => {
      await navigateBravePage(page, url);
      const snapshot = {
        ...(await fetchBraveSnapshot({
          page,
          targetId,
        })),
        profile: activeProfile,
      } satisfies BrowserSnapshot;

      return {
        browserSession: buildBrowserSessionState({
          provider: "brave_cdp",
          profile: activeProfile,
          workspaceKey: nextWorkspaceKey,
          targetId,
          tabId: targetId,
          lastUrl: snapshot.currentUrl,
          lastTitle: snapshot.title,
          availableRefs: snapshot.refs,
          refMap: buildRefMap(snapshot.refs, snapshot.refMap),
        }),
        snapshot,
      };
    },
  });
}

export async function clickBrowserWorkspace({
  conversationId,
  ref,
  selector,
  browserSession,
  profile,
  workspaceKey,
}: {
  conversationId: string;
  ref?: string;
  selector?: string;
  browserSession?: BrowserSessionState;
  profile?: string;
  workspaceKey?: string;
}) {
  const nextWorkspaceKey = resolveWorkspaceKey(workspaceKey, browserSession, conversationId);
  const preferredBrowserSession = withPreferredProfile(browserSession, profile);
  const activeProfile = resolveActiveBrowserProfile(profile, browserSession);

  return await withBraveWorkspace({
    browserSession: {
      ...preferredBrowserSession,
      workspaceKey: nextWorkspaceKey,
    },
    workspaceKey: nextWorkspaceKey,
    callback: async ({ page, targetId }) => {
      await runBraveAction(
        page,
        {
          type: "click",
          ref,
          selector,
        },
        preferredBrowserSession
      );
      const snapshot = {
        ...(await fetchBraveSnapshot({
          page,
          targetId,
        })),
        profile: activeProfile,
      } satisfies BrowserSnapshot;

      return {
        browserSession: buildBrowserSessionState({
          provider: "brave_cdp",
          profile: activeProfile,
          workspaceKey: nextWorkspaceKey,
          targetId,
          tabId: targetId,
          lastUrl: snapshot.currentUrl,
          lastTitle: snapshot.title,
          availableRefs: snapshot.refs,
          refMap: buildRefMap(snapshot.refs, snapshot.refMap),
        }),
        snapshot,
      };
    },
  });
}

export async function typeBrowserWorkspace({
  conversationId,
  ref,
  selector,
  text,
  submit,
  browserSession,
  profile,
  workspaceKey,
}: {
  conversationId: string;
  ref?: string;
  selector?: string;
  text: string;
  submit?: boolean;
  browserSession?: BrowserSessionState;
  profile?: string;
  workspaceKey?: string;
}) {
  const nextWorkspaceKey = resolveWorkspaceKey(workspaceKey, browserSession, conversationId);
  const preferredBrowserSession = withPreferredProfile(browserSession, profile);
  const activeProfile = resolveActiveBrowserProfile(profile, browserSession);

  return await withBraveWorkspace({
    browserSession: {
      ...preferredBrowserSession,
      workspaceKey: nextWorkspaceKey,
    },
    workspaceKey: nextWorkspaceKey,
    callback: async ({ page, targetId }) => {
      await runBraveAction(
        page,
        {
          type: "type",
          ref,
          selector,
          text,
          submit,
        },
        preferredBrowserSession
      );
      const snapshot = {
        ...(await fetchBraveSnapshot({
          page,
          targetId,
        })),
        profile: activeProfile,
      } satisfies BrowserSnapshot;

      return {
        browserSession: buildBrowserSessionState({
          provider: "brave_cdp",
          profile: activeProfile,
          workspaceKey: nextWorkspaceKey,
          targetId,
          tabId: targetId,
          lastUrl: snapshot.currentUrl,
          lastTitle: snapshot.title,
          availableRefs: snapshot.refs,
          refMap: buildRefMap(snapshot.refs, snapshot.refMap),
        }),
        snapshot,
      };
    },
  });
}

export async function pressBrowserWorkspaceKey({
  conversationId,
  key,
  browserSession,
  profile,
  workspaceKey,
}: {
  conversationId: string;
  key: string;
  browserSession?: BrowserSessionState;
  profile?: string;
  workspaceKey?: string;
}) {
  const nextWorkspaceKey = resolveWorkspaceKey(workspaceKey, browserSession, conversationId);
  const preferredBrowserSession = withPreferredProfile(browserSession, profile);
  const activeProfile = resolveActiveBrowserProfile(profile, browserSession);

  return await withBraveWorkspace({
    browserSession: {
      ...preferredBrowserSession,
      workspaceKey: nextWorkspaceKey,
    },
    workspaceKey: nextWorkspaceKey,
    callback: async ({ page, targetId }) => {
      await runBraveAction(
        page,
        {
          type: "press",
          key,
        },
        preferredBrowserSession
      );
      const snapshot = {
        ...(await fetchBraveSnapshot({
          page,
          targetId,
        })),
        profile: activeProfile,
      } satisfies BrowserSnapshot;

      return {
        browserSession: buildBrowserSessionState({
          provider: "brave_cdp",
          profile: activeProfile,
          workspaceKey: nextWorkspaceKey,
          targetId,
          tabId: targetId,
          lastUrl: snapshot.currentUrl,
          lastTitle: snapshot.title,
          availableRefs: snapshot.refs,
          refMap: buildRefMap(snapshot.refs, snapshot.refMap),
        }),
        snapshot,
      };
    },
  });
}

export async function refreshBrowserWorkspace({
  conversationId,
  browserSession,
  profile,
  workspaceKey,
}: {
  conversationId: string;
  browserSession?: BrowserSessionState;
  profile?: string;
  workspaceKey?: string;
}) {
  const nextUrl = normalizeVisitedUrl(browserSession?.lastUrl);

  if (!nextUrl) {
    throw new Error("There is no browser URL to refresh yet.");
  }

  return await navigateBrowserWorkspace({
    conversationId,
    url: nextUrl,
    browserSession,
    profile,
    workspaceKey,
  });
}

async function closeBraveWorkspace({
  browserSession,
  workspaceKey,
}: {
  browserSession?: BrowserSessionState;
  workspaceKey: string;
}) {
  const browser = await connectToWorkspaceBrowser();

  try {
    const context = browser.contexts()[0] || (await browser.newContext());
    const marker = buildBraveWorkspaceMarker(workspaceKey);
    const records = await collectBravePages(context);
    const matched =
      records.find((record) => record.targetId === (browserSession?.tabId || browserSession?.targetId)) ||
      records.find((record) => record.marker === marker);

    if (matched) {
      await matched.page.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

export async function closeBrowserWorkspace(
  conversationId: string,
  browserSession?: BrowserSessionState,
  _profile?: string,
  workspaceKey?: string
) {
  const nextWorkspaceKey = resolveWorkspaceKey(workspaceKey, browserSession, conversationId);

  await closeBraveWorkspace({
    browserSession,
    workspaceKey: nextWorkspaceKey,
  });
}

export function getPreferredBrowserProfiles() {
  return {
    automationProfile: getAutomationBrowserProfile(),
    userProfile: getUserBrowserProfile(),
  };
}
