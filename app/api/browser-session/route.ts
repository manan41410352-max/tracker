import { NextRequest, NextResponse } from "next/server";
import { fetchMutation, fetchQuery } from "convex/nextjs";

import { api } from "@/convex/_generated/api";
import {
  clickBrowserWorkspace,
  closeBrowserWorkspace,
  getBrowserWorkspaceSnapshot,
  navigateBrowserWorkspace,
  prewarmBrowserWorkspace,
  pressBrowserWorkspaceKey,
  refreshBrowserWorkspace,
  typeBrowserWorkspace,
} from "@/lib/browser-runtime";
import { LOCAL_USER_EMAIL, LOCAL_USER_NAME } from "@/lib/local-user";

export const runtime = "nodejs";

const PREVIEW_DEFAULT_URL_MEMORY_KEY = "preview_default_url";
const PREVIEW_BROWSER_PROFILE_MEMORY_KEY = "preview_browser_profile";

async function persistBrowserSession(conversationId: string, browserSession: any) {
  const run = await fetchQuery(api.workflow.GetWorkflowRunByConversation, {
    conversationId,
  });

  if (!run) {
    return;
  }

  await fetchMutation(api.workflow.UpsertWorkflowRun, {
    conversationId: run.conversationId,
    agentId: run.agentId,
    userId: run.userId,
    status: run.status,
    currentNodeId: run.currentNodeId || undefined,
    pendingAction: run.pendingAction,
    state: run.state,
    nodeHistory: run.nodeHistory,
    messages: run.messages,
    browserSession,
    updatedAt: new Date().toISOString(),
  });
}

async function resolveRememberedUrl({
  agentId,
  userId,
  rememberedUrl,
}: {
  agentId?: string;
  userId?: any;
  rememberedUrl?: string;
}) {
  const explicit = String(rememberedUrl || "").trim();
  if (explicit) {
    return explicit;
  }

  if (!agentId || !userId) {
    return undefined;
  }

  const memoryRecords = await fetchQuery(api.workflow.GetAgentMemory, {
    agentId: agentId as any,
    userId,
  });
  const remembered = memoryRecords?.find(
    (record: any) => record.memoryKey === PREVIEW_DEFAULT_URL_MEMORY_KEY
  )?.value;

  return typeof remembered === "string" && remembered.trim() ? remembered.trim() : undefined;
}

async function resolveRememberedProfile({
  agentId,
  userId,
  rememberedProfile,
}: {
  agentId?: string;
  userId?: any;
  rememberedProfile?: string;
}) {
  const explicit = String(rememberedProfile || "").trim();
  if (explicit) {
    return explicit;
  }

  if (!agentId || !userId) {
    return undefined;
  }

  const memoryRecords = await fetchQuery(api.workflow.GetAgentMemory, {
    agentId: agentId as any,
    userId,
  });
  const remembered = memoryRecords?.find(
    (record: any) => record.memoryKey === PREVIEW_BROWSER_PROFILE_MEMORY_KEY
  )?.value;

  return typeof remembered === "string" && remembered.trim() ? remembered.trim() : undefined;
}

async function persistRememberedUrl({
  agentId,
  userId,
  url,
}: {
  agentId?: string;
  userId?: any;
  url?: string;
}) {
  const nextUrl = String(url || "").trim();
  if (!agentId || !userId || !nextUrl) {
    return;
  }

  await fetchMutation(api.workflow.UpsertAgentMemory, {
    agentId: agentId as any,
    userId,
    memoryKey: PREVIEW_DEFAULT_URL_MEMORY_KEY,
    value: nextUrl,
    source: "preview_browser",
    updatedAt: new Date().toISOString(),
  });
}

async function persistRememberedProfile({
  agentId,
  userId,
  profile,
}: {
  agentId?: string;
  userId?: any;
  profile?: string;
}) {
  const nextProfile = String(profile || "").trim();
  if (!agentId || !userId || !nextProfile) {
    return;
  }

  await fetchMutation(api.workflow.UpsertAgentMemory, {
    agentId: agentId as any,
    userId,
    memoryKey: PREVIEW_BROWSER_PROFILE_MEMORY_KEY,
    value: nextProfile,
    source: "preview_browser",
    updatedAt: new Date().toISOString(),
  });
}

function isBrowserServiceOffline(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /Brave CDP is unavailable|No active Brave workspace tab was available|Target page, context or browser has been closed|WebSocket|connect ECONNREFUSED|fetch failed/i.test(
    message
  );
}

function buildBrowserStatePayload({
  snapshot,
  browserState,
  profile,
  browserSession,
  lastError,
  serviceStatus,
}: {
  snapshot?: any;
  browserState?: any;
  profile?: string;
  browserSession?: any;
  lastError?: string;
  serviceStatus: "offline" | "warming" | "ready";
}) {
  return {
    url:
      snapshot?.currentUrl ||
      browserState?.url ||
      browserSession?.lastUrl,
    title:
      snapshot?.title ||
      browserState?.title ||
      browserSession?.lastTitle,
    mode: browserState?.mode || "live",
    profile:
      snapshot?.profile ||
      browserState?.profile ||
      profile ||
      browserSession?.profile,
    provider:
      snapshot?.provider ||
      browserState?.provider ||
      browserSession?.provider,
    tabId:
      snapshot?.tabId ||
      browserState?.tabId ||
      browserSession?.tabId,
    targetId:
      snapshot?.targetId ||
      browserState?.targetId ||
      browserSession?.targetId,
    availableRefs:
      snapshot?.refs ||
      browserState?.availableRefs ||
      browserSession?.availableRefs,
    lastError:
      lastError ||
      snapshot?.manualInterventionReason ||
      browserState?.lastError,
    serviceStatus,
    resolvedUrl:
      snapshot?.resolvedUrl ||
      browserState?.resolvedUrl ||
      browserSession?.resolvedUrl,
    resolvedSiteSource:
      snapshot?.resolvedSiteSource ||
      browserState?.resolvedSiteSource ||
      browserSession?.resolvedSiteSource,
    discoveredSite:
      snapshot?.discoveredSite ||
      browserState?.discoveredSite ||
      browserSession?.discoveredSite,
  };
}

export async function GET(req: NextRequest) {
  let run: any = null;
  try {
    const conversationId = req.nextUrl.searchParams.get("conversationId");
    const profile = req.nextUrl.searchParams.get("profile") || undefined;
    const workspaceKey = req.nextUrl.searchParams.get("workspaceKey") || undefined;
    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required." },
        { status: 400 }
      );
    }

    await fetchMutation(api.user.CreateNewUser, {
      name: LOCAL_USER_NAME,
      email: LOCAL_USER_EMAIL,
    });

    run = await fetchQuery(api.workflow.GetWorkflowRunByConversation, {
      conversationId,
    });
    const snapshot = await getBrowserWorkspaceSnapshot({
      conversationId,
      browserSession: run?.browserSession,
      profile,
      workspaceKey,
    });

    return NextResponse.json({
      ok: true,
      snapshot,
      resolvedUrl: snapshot?.resolvedUrl || run?.browserSession?.resolvedUrl,
      resolvedSiteSource:
        snapshot?.resolvedSiteSource || run?.browserSession?.resolvedSiteSource,
      discoveredSite:
        snapshot?.discoveredSite || run?.browserSession?.discoveredSite,
      browserState: buildBrowserStatePayload({
        snapshot,
        profile,
        browserSession: run?.browserSession,
        serviceStatus: "ready",
      }),
    });
  } catch (error) {
    if (isBrowserServiceOffline(error)) {
      return NextResponse.json({
        ok: false,
        snapshot: null,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load the browser workspace.",
        browserState: buildBrowserStatePayload({
          profile: req.nextUrl.searchParams.get("profile") || undefined,
          browserSession: run?.browserSession,
          lastError:
            error instanceof Error
              ? error.message
              : "Unable to load the browser workspace.",
          serviceStatus: "offline",
        }),
      });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load the browser workspace.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  let browserSession: any = null;
  let requestedProfile: string | undefined;
  let actionName = "";
  let workspaceKey: string | undefined;
  try {
    const {
      conversationId,
      action,
      url,
      goal,
      task,
      ref,
      selector,
      text,
      key,
      profile,
      submit,
      workspaceKey: incomingWorkspaceKey,
      agentId,
      rememberedUrl,
      rememberedProfile,
    } =
      await req.json();
    actionName = String(action || "");
    requestedProfile = profile ? String(profile) : undefined;
    workspaceKey = incomingWorkspaceKey ? String(incomingWorkspaceKey) : undefined;

    if (!conversationId || !action) {
      return NextResponse.json(
        { error: "conversationId and action are required." },
        { status: 400 }
      );
    }

    const user = await fetchMutation(api.user.CreateNewUser, {
      name: LOCAL_USER_NAME,
      email: LOCAL_USER_EMAIL,
    });

    const run = await fetchQuery(api.workflow.GetWorkflowRunByConversation, {
      conversationId,
    });
    browserSession = run?.browserSession;
    const effectiveAgentId = String(agentId || run?.agentId || "");
    const effectiveGoal = String(
      goal || task || run?.state?.task || run?.state?.runSetupTask || ""
    ).trim();
    const nextRememberedUrl = await resolveRememberedUrl({
      agentId: effectiveAgentId || undefined,
      userId: user?._id,
      rememberedUrl,
    });
    const effectiveProfile =
      requestedProfile ||
      (await resolveRememberedProfile({
        agentId: effectiveAgentId || undefined,
        userId: user?._id,
        rememberedProfile,
      }));

    let result:
      | Awaited<ReturnType<typeof navigateBrowserWorkspace>>
      | Awaited<ReturnType<typeof clickBrowserWorkspace>>
      | Awaited<ReturnType<typeof typeBrowserWorkspace>>
      | Awaited<ReturnType<typeof pressBrowserWorkspaceKey>>
      | Awaited<ReturnType<typeof refreshBrowserWorkspace>>
      | Awaited<ReturnType<typeof prewarmBrowserWorkspace>>
      | { browserSession?: any; snapshot?: any; browserState?: any } = {};

    if (action === "navigate") {
      result = await navigateBrowserWorkspace({
        conversationId,
        url: String(url || ""),
        browserSession,
        profile: effectiveProfile,
        workspaceKey,
      });
    } else if (action === "click") {
      result = await clickBrowserWorkspace({
        conversationId,
        ref: String(ref || ""),
        selector: selector ? String(selector) : undefined,
        browserSession,
        profile: effectiveProfile,
        workspaceKey,
      });
    } else if (action === "type") {
      result = await typeBrowserWorkspace({
        conversationId,
        ref: String(ref || ""),
        selector: selector ? String(selector) : undefined,
        text: String(text || ""),
        submit: Boolean(submit),
        browserSession,
        profile: effectiveProfile,
        workspaceKey,
      });
    } else if (action === "press") {
      result = await pressBrowserWorkspaceKey({
        conversationId,
        key: String(key || "Enter"),
        browserSession,
        profile: effectiveProfile,
        workspaceKey,
      });
    } else if (action === "refresh") {
      result = await refreshBrowserWorkspace({
        conversationId,
        browserSession,
        profile: effectiveProfile,
        workspaceKey,
      });
    } else if (action === "prewarm") {
      result = await prewarmBrowserWorkspace({
        browserSession,
        profile: effectiveProfile,
        workspaceKey,
        rememberedUrl: nextRememberedUrl,
        goal: effectiveGoal,
      });
    } else if (action === "close") {
      await closeBrowserWorkspace(
        conversationId,
        browserSession,
        effectiveProfile,
        workspaceKey
      );
      return NextResponse.json({
        ok: true,
        browserState: buildBrowserStatePayload({
          profile: effectiveProfile,
          browserSession: undefined,
          serviceStatus: "offline",
        }),
      });
    } else {
      return NextResponse.json(
        { error: `Unsupported browser action: ${action}` },
        { status: 400 }
      );
    }

    if (result.browserSession) {
      await persistBrowserSession(conversationId, result.browserSession);
    }

    if (action === "navigate" && String(url || "").trim()) {
      await persistRememberedUrl({
        agentId: effectiveAgentId || undefined,
        userId: user?._id,
        url: String(url || ""),
      });
    }
    if (
      action === "prewarm" &&
      (result as any)?.browserState?.resolvedUrl &&
      ["override", "discovery"].includes(
        String((result as any)?.browserState?.resolvedSiteSource || "")
      )
    ) {
      await persistRememberedUrl({
        agentId: effectiveAgentId || undefined,
        userId: user?._id,
        url: String((result as any).browserState.resolvedUrl || ""),
      });
    }
    await persistRememberedProfile({
      agentId: effectiveAgentId || undefined,
      userId: user?._id,
      profile: effectiveProfile || result.browserSession?.profile,
    });

    const nextSnapshot = "snapshot" in result ? result.snapshot : undefined;

    return NextResponse.json({
      ok: true,
      snapshot: nextSnapshot,
      resolvedUrl:
        nextSnapshot?.resolvedUrl ||
        (result as any)?.browserState?.resolvedUrl,
      resolvedSiteSource:
        nextSnapshot?.resolvedSiteSource ||
        (result as any)?.browserState?.resolvedSiteSource,
      discoveredSite:
        nextSnapshot?.discoveredSite ||
        (result as any)?.browserState?.discoveredSite,
      browserState: buildBrowserStatePayload({
        snapshot: nextSnapshot,
        browserState: "browserState" in result ? result.browserState : undefined,
        profile: effectiveProfile,
        browserSession: result.browserSession || browserSession,
        serviceStatus: "ready",
      }),
    });
  } catch (error) {
    if (isBrowserServiceOffline(error)) {
      const payload = {
        ok: false,
        snapshot: null,
        error:
          error instanceof Error
            ? error.message
            : "Unable to update the browser workspace.",
        browserState: buildBrowserStatePayload({
          profile: requestedProfile,
          browserSession,
          lastError:
            error instanceof Error
              ? error.message
              : "Unable to update the browser workspace.",
          serviceStatus: "offline",
        }),
      };

      if (actionName === "prewarm") {
        return NextResponse.json(payload);
      }

      return NextResponse.json(payload, { status: 503 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to update the browser workspace.",
      },
      { status: 500 }
    );
  }
}
