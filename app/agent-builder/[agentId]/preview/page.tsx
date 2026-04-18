"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import { useConvex, useMutation, useQuery } from "convex/react";
import { Background, ReactFlow } from "@xyflow/react";
import { PanelRightOpen, Trophy } from "lucide-react";
import { toast } from "sonner";

import "@xyflow/react/dist/style.css";

import Header from "../../_components/Header";
import ChatUi from "./_components/ChatUi";
import MemoryInspectorPanel from "./_components/MemoryInspectorPanel";
import UnexpectedChangesPanel from "./_components/UnexpectedChangesPanel";
import PreviewPanel from "./_components/PreviewPanel";
import PublishCodeDialog from "./_components/PublishCodeDialog";
import TrackerDashboardPanel from "./_components/TrackerDashboardPanel";
import { nodeTypes } from "../nodeTypes";

import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { buildFlowConfigFromCanvas } from "@/lib/agent-builder";
import { needsAgentRuntimeRefresh } from "@/lib/agent-runtime-config";
import { LOCAL_USER_EMAIL, LOCAL_USER_NAME } from "@/lib/local-user";
import {
  buildTrackerDashboardModel,
  isTrackerAgentDefinition,
} from "@/lib/tracker-workflow";
import type {
  AgentChatEnvelope,
  BrowserWorkspaceState,
  PendingApprovalPayload,
  PendingFormPayload,
  RunSetup,
  RunSetupAnswer,
  WorkflowTraceItem,
} from "@/lib/runtime-types";
import { Agent } from "@/types/AgentType";

type ChatMessage = {
  role: string;
  content: string;
};

type PreviewWorkspaceTab = "workflow" | "memory" | "dashboard" | "changes";
type StoredPreviewWorkspaceTab = PreviewWorkspaceTab | "browser";

const PREVIEW_DEFAULT_URL_MEMORY_KEY = "preview_default_url";
const PREVIEW_BROWSER_PROFILE_MEMORY_KEY = "preview_browser_profile";

function PreviewAgent() {
  const convex = useConvex();
  const router = useRouter();
  const { agentId } = useParams();
  const isMobile = useIsMobile();
  const [workspaceConversationId] = useState(() => crypto.randomUUID());
  const [activeWorkspaceTab, setActiveWorkspaceTab] = usePersistentState<StoredPreviewWorkspaceTab>(
    "preview-workspace-tab",
    "workflow"
  );
  const [controlRailOpen, setControlRailOpen] = usePersistentState(
    "preview-control-rail-open",
    true
  );

  const [agentDetail, setAgentDetail] = useState<Agent>();
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState("");
  const [pendingForm, setPendingForm] = useState<PendingFormPayload | null>(null);
  const [pendingApproval, setPendingApproval] =
    useState<PendingApprovalPayload | null>(null);
  const [browserState, setBrowserState] = useState<BrowserWorkspaceState>({
    mode: "live",
    provider: "brave_cdp",
    serviceStatus: "warming",
  });
  const [setupCompleted, setSetupCompleted] = useState(false);
  const [trace, setTrace] = useState<WorkflowTraceItem[]>([]);
  const [runStatus, setRunStatus] = useState<string>("idle");
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [autoRefreshing, setAutoRefreshing] = useState(false);
  const [rememberedBrowserUrl, setRememberedBrowserUrl] = useState("");
  const [rememberedBrowserProfile, setRememberedBrowserProfile] = useState("automation");
  const [browserGoalHint, setBrowserGoalHint] = useState("");
  const activeConversationId = conversationId || workspaceConversationId;
  const leaderboardHref = `/dashboard/leaderboard${
    agentDetail?.agentId || agentId ? `?focus=${agentDetail?.agentId || agentId}` : ""
  }`;

  const updateAgentToolConfig = useMutation(api.agent.UpdateAgentToolConfig);
  const deleteAgent = useMutation(api.agent.DeleteAgentById);
  const createLocalUser = useMutation(api.user.CreateNewUser);
  const upsertAgentMemory = useMutation(api.workflow.UpsertAgentMemory);
  const agentMemory = useQuery(
    api.workflow.GetAgentMemoryByAgent,
    agentDetail?._id
      ? {
          agentId: agentDetail._id,
        }
      : "skip"
  );
  const agentMemoryTimeline = useQuery(
    api.workflow.GetAgentMemoryTimelineByAgent,
    agentDetail?._id
      ? {
          agentId: agentDetail._id,
          limit: 120,
        }
      : "skip"
  );
  const workflowRun = useQuery(
    api.workflow.GetWorkflowRunByConversation,
    activeConversationId
      ? {
          conversationId: activeConversationId,
        }
      : "skip"
  );

  const runtimeNeedsRefresh = needsAgentRuntimeRefresh(agentDetail?.agentToolConfig);
  const previewWorkspaceKey = agentDetail?.agentId || (agentId as string) || workspaceConversationId;
  const prewarmKeyRef = useRef("");
  const trackerDashboard = useMemo(
    () =>
      buildTrackerDashboardModel({
        persistedRun: workflowRun || null,
        currentRunState:
          workflowRun?.state && typeof workflowRun.state === "object"
            ? workflowRun.state
            : null,
        memoryEntries: (agentMemory || []) as any[],
        memoryTimeline: (agentMemoryTimeline || []) as any[],
      }),
    [agentMemory, agentMemoryTimeline, workflowRun]
  );
  const isTrackerWorkspace = useMemo(
    () =>
      isTrackerAgentDefinition({
        nodes: Array.isArray(agentDetail?.nodes) ? agentDetail.nodes : [],
        runtimeConfig: agentDetail?.agentToolConfig,
      }),
    [agentDetail?.agentToolConfig, agentDetail?.nodes]
  );
  const resolvedWorkspaceTab = useMemo<PreviewWorkspaceTab>(() => {
    if (activeWorkspaceTab === "browser") {
      return isTrackerWorkspace ? "dashboard" : "workflow";
    }

    if (activeWorkspaceTab === "changes" && !isTrackerWorkspace) {
      return "workflow";
    }

    return activeWorkspaceTab;
  }, [activeWorkspaceTab, isTrackerWorkspace]);

  useEffect(() => {
    void getAgentDetail();
  }, [agentId]);

  useEffect(() => {
    if (activeWorkspaceTab !== resolvedWorkspaceTab) {
      setActiveWorkspaceTab(resolvedWorkspaceTab);
    }
  }, [activeWorkspaceTab, resolvedWorkspaceTab, setActiveWorkspaceTab]);

  const runSetup = useMemo<RunSetup | undefined>(() => {
    if (
      agentDetail?.agentToolConfig?.runSetup &&
      Array.isArray(agentDetail.agentToolConfig.runSetup.fields)
    ) {
      return agentDetail.agentToolConfig.runSetup as RunSetup;
    }

    if (!Array.isArray(agentDetail?.agentToolConfig?.questionBlocks)) {
      return undefined;
    }

    return {
      title: "Run setup",
      description: "Collect the required details once before the workflow starts.",
      fields: agentDetail.agentToolConfig.questionBlocks.map((question: any) => ({
        id: String(question.id),
        label: String(question.name || question.label || "Required input"),
        type: question.responseType === "mcq" ? "single-select" : "short-text",
        required: question.required ?? true,
        options: Array.isArray(question.options) ? question.options : [],
        placeholder:
          question.responseType === "mcq"
            ? "Choose an option"
            : "Enter the required detail",
        memoryKey: question.memoryKey ? String(question.memoryKey) : undefined,
        reusable: true,
        sourceNodeId: String(question.id),
        sourceNodeName: String(question.name || question.label || "Question"),
        sourceNodeType: "QuestionNode",
        description: String(question.question || ""),
      })),
    };
  }, [agentDetail?.agentToolConfig]);

  const setupPrefillValues = useMemo(() => {
    const builderMemoryEntries = Array.isArray(agentDetail?.config?.builderMemory)
      ? agentDetail.config.builderMemory
      : [];
    const builderMemoryMap = Object.fromEntries(
      builderMemoryEntries.map((entry: any) => [String(entry.key), entry.value])
    );
    const agentMemoryMap = Object.fromEntries(
      (agentMemory || []).map((entry: any) => [String(entry.memoryKey), entry.value])
    );

    return Object.fromEntries(
      (runSetup?.fields || []).map((field) => [
        field.id,
        (field.memoryKey ? agentMemoryMap[field.memoryKey] : undefined) ??
          (field.memoryKey ? builderMemoryMap[field.memoryKey] : undefined) ??
          "",
      ])
    ) as Record<string, string | string[]>;
  }, [agentDetail?.config?.builderMemory, agentMemory, runSetup?.fields]);

  const computedRememberedBrowserUrl = useMemo(() => {
    const builderMemoryEntries = Array.isArray(agentDetail?.config?.builderMemory)
      ? agentDetail.config.builderMemory
      : [];
    const builderMemoryMap = Object.fromEntries(
      builderMemoryEntries.map((entry: any) => [String(entry.key), entry.value])
    );
    const agentMemoryMap = Object.fromEntries(
      (agentMemory || []).map((entry: any) => [String(entry.memoryKey), entry.value])
    );
    const rememberedValue =
      agentMemoryMap[PREVIEW_DEFAULT_URL_MEMORY_KEY] ??
      builderMemoryMap[PREVIEW_DEFAULT_URL_MEMORY_KEY] ??
      "";

    return typeof rememberedValue === "string" ? rememberedValue : String(rememberedValue || "");
  }, [agentDetail?.config?.builderMemory, agentMemory]);

  const computedRememberedBrowserProfile = useMemo(() => {
    const builderMemoryEntries = Array.isArray(agentDetail?.config?.builderMemory)
      ? agentDetail.config.builderMemory
      : [];
    const builderMemoryMap = Object.fromEntries(
      builderMemoryEntries.map((entry: any) => [String(entry.key), entry.value])
    );
    const agentMemoryMap = Object.fromEntries(
      (agentMemory || []).map((entry: any) => [String(entry.memoryKey), entry.value])
    );
    const rememberedValue =
      agentMemoryMap[PREVIEW_BROWSER_PROFILE_MEMORY_KEY] ??
      builderMemoryMap[PREVIEW_BROWSER_PROFILE_MEMORY_KEY] ??
      "automation";

    return typeof rememberedValue === "string"
      ? rememberedValue
      : String(rememberedValue || "automation");
  }, [agentDetail?.config?.builderMemory, agentMemory]);

  useEffect(() => {
    setRememberedBrowserUrl(computedRememberedBrowserUrl);
  }, [computedRememberedBrowserUrl]);

  useEffect(() => {
    setRememberedBrowserProfile(computedRememberedBrowserProfile);
  }, [computedRememberedBrowserProfile]);

  const getAgentDetail = async () => {
    try {
      const result = await convex.query(api.agent.GetAgentById, {
        agentId: agentId as string,
      });

      if (!result) {
        toast.error("The requested agent could not be found.");
        router.push("/dashboard/my-agents");
        return;
      }

      setAgentDetail(result);

      const conversationIdResult = await axios.get("/api/agent-chat");
      setConversationId(conversationIdResult.data.conversationId);
    } catch (error: any) {
      const message =
        error?.response?.data?.error ??
        "Unable to initialize preview mode. Check your environment settings.";
      toast.error(message);
    }
  };

  const saveSharedMemoryValue = async (memoryKey: string, value: any) => {
    if (!agentDetail?._id) {
      throw new Error("The agent is still loading.");
    }

    const user = await createLocalUser({
      name: LOCAL_USER_NAME,
      email: LOCAL_USER_EMAIL,
    });

    if (!user?._id) {
      throw new Error("Unable to resolve the local workspace user.");
    }

    await upsertAgentMemory({
      agentId: agentDetail._id,
      userId: user._id,
      memoryKey,
      value,
      source: "memory_inspector.edit",
      updatedAt: new Date().toISOString(),
    });
  };

  const generateAgentToolConfig = async (silent = false) => {
    if (!agentDetail?._id) {
      if (!silent) {
        toast.error("The agent is still loading.");
      }
      return;
    }

    try {
      setRuntimeLoading(true);
      const result = await axios.post("/api/generate-agent-tool-config", {
        jsonConfig: buildFlowConfigFromCanvas(agentDetail?.nodes, agentDetail?.edges),
        agentName: agentDetail?.name,
        builderContext: agentDetail?.config?.builderPrompt,
        researchNotes: agentDetail?.config?.research,
      });

      await updateAgentToolConfig({
        id: agentDetail._id as any,
        agentToolConfig: result.data,
      });

      setAgentDetail((prev) =>
        prev
          ? {
              ...prev,
              agentToolConfig: result.data,
            }
          : prev
      );

      if (!silent) {
        toast.success("Agent runtime refreshed");
      }
    } catch (error: any) {
      const message =
        error?.response?.data?.error ??
        "Unable to generate the runtime config right now.";
      if (!silent) {
        toast.error(message);
      }
    } finally {
      setRuntimeLoading(false);
    }
  };

  useEffect(() => {
    if (!agentDetail?._id || runtimeLoading || autoRefreshing) {
      return;
    }

    if (!needsAgentRuntimeRefresh(agentDetail.agentToolConfig)) {
      return;
    }

    setAutoRefreshing(true);
    void generateAgentToolConfig(true).finally(() => {
      setAutoRefreshing(false);
    });
  }, [agentDetail?._id, agentDetail?.agentToolConfig, autoRefreshing, runtimeLoading]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    const prewarmKey = `${conversationId}:${previewWorkspaceKey}:${rememberedBrowserUrl}:${rememberedBrowserProfile}:${browserGoalHint}`;

    if (prewarmKeyRef.current === prewarmKey) {
      return;
    }

    prewarmKeyRef.current = prewarmKey;
    let canceled = false;

    setBrowserState((prev) => ({
      ...(prev || {}),
      mode: "live",
      provider: prev?.provider || "brave_cdp",
      serviceStatus: "warming",
    }));

    void fetch("/api/browser-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        conversationId,
        action: "prewarm",
        agentId: agentDetail?._id,
        workspaceKey: previewWorkspaceKey,
        rememberedUrl: rememberedBrowserUrl,
        rememberedProfile: rememberedBrowserProfile,
        profile: rememberedBrowserProfile,
        goal: browserGoalHint,
      }),
    })
      .then(async (res) => {
        const payload = await res.json();
        if (canceled) {
          return;
        }

        if (payload.browserState) {
          setBrowserState(payload.browserState);
          if (
            payload.browserState.resolvedUrl &&
            ["override", "discovery"].includes(
              String(payload.browserState.resolvedSiteSource || "")
            )
          ) {
            setRememberedBrowserUrl(String(payload.browserState.resolvedUrl));
          }
        }
      })
      .catch((error) => {
        if (canceled) {
          return;
        }

        setBrowserState((prev) => ({
          ...(prev || {}),
          mode: "live",
          provider: prev?.provider || "brave_cdp",
          serviceStatus: "offline",
          lastError:
            error instanceof Error ? error.message : "Unable to warm the browser workspace.",
        }));
      });

    return () => {
      canceled = true;
    };
  }, [
    agentDetail?._id,
    conversationId,
    previewWorkspaceKey,
    browserGoalHint,
    rememberedBrowserProfile,
    rememberedBrowserUrl,
  ]);

  const sendMessage = async ({
    message,
    runSetupAnswers,
    reusableMemoryBootstrap,
    resumeAction,
    optimisticUserMessage,
  }: {
    message?: string;
    runSetupAnswers?: RunSetupAnswer[];
    reusableMemoryBootstrap?: Record<string, string | string[]>;
    resumeAction?:
      | { type: "form"; values: Record<string, string | string[]> }
      | { type: "approval"; decision: "approve" | "reject" }
      | { type: "browser"; note?: string; currentUrl?: string };
    optimisticUserMessage?: string;
  }) => {
    const trimmedInput = message?.trim() || "";
    if (!trimmedInput && !resumeAction) {
      return;
    }

    const currentConversation = conversationId || workspaceConversationId;
    setChatLoading(true);
    if (trimmedInput) {
      setBrowserGoalHint(trimmedInput);
    }
    if (trimmedInput || optimisticUserMessage) {
      setMessages((prev) => [
        ...prev,
        { role: "user", content: optimisticUserMessage || trimmedInput },
      ]);
    }
    setUserInput("");

    try {
      const res = await fetch("/api/agent-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentId: agentDetail?.agentId,
          agentName: agentDetail?.name,
          agentConfig: agentDetail?.agentToolConfig,
          input: trimmedInput,
          conversationId: currentConversation,
          prefilledQuestionAnswers: runSetupAnswers?.map((answer) => ({
            id: answer.id,
            answer: Array.isArray(answer.value)
              ? answer.value.join(", ")
              : String(answer.value || ""),
          })),
          runSetupAnswers,
          reusableMemoryBootstrap,
          resumeAction,
        }),
      });

      const payload = (await res.json()) as AgentChatEnvelope & { error?: string };

      if (!res.ok) {
        throw new Error(
          payload?.error ||
            "The agent could not answer because the local runtime is not configured yet."
        );
      }

      setConversationId(payload.conversationId || currentConversation);
      setRunStatus(payload.status);
      setCurrentNodeId(payload.currentNodeId || null);
      setPendingForm(payload.form || null);
      setPendingApproval(payload.approval || null);
      if (payload.browserState) {
        setBrowserState(payload.browserState);
        if (
          !rememberedBrowserUrl &&
          payload.browserState.url &&
          !["about:blank", "chrome://newtab", "chrome://newtab/", "brave://newtab", "brave://newtab/"].includes(
            String(payload.browserState.url).trim().toLowerCase()
          )
        ) {
          setRememberedBrowserUrl(String(payload.browserState.url));
        }
        if (payload.browserState.profile) {
          setRememberedBrowserProfile(String(payload.browserState.profile));
        }
      }
      setTrace(payload.trace || []);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: payload.message,
        },
      ]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The local agent runtime is unavailable.";
      toast.error(message);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: message,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const onDeleteAgent = async () => {
    if (!agentId) {
      return;
    }

    const confirmed = window.confirm(
      "Delete this agent and its saved conversations? This cannot be undone."
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeleting(true);
      await deleteAgent({ agentId: agentId as string });
      toast.success("Agent deleted.");
      router.push("/dashboard/my-agents");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to delete the agent.";
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  };

  const renderWorkflowMap = () => (
    <PreviewPanel
      title="Workflow map"
      description="See the live workflow structure while you test chat, browser automation, and branching."
      defaultOpen={true}
      contentClassName="p-0"
      className="h-full"
    >
      <div
        style={{
          width: "100%",
          height: isMobile ? "60vh" : "calc(100vh - 240px)",
        }}
      >
        <ReactFlow
          nodes={agentDetail?.nodes || []}
          edges={agentDetail?.edges || []}
          fitView
          nodeTypes={nodeTypes}
        >
          {/* @ts-ignore */}
          <Background variant="dots" gap={12} size={1} />
        </ReactFlow>
      </div>
    </PreviewPanel>
  );

  const controlRail = (
    <ChatUi
      GenerateAgentToolConfig={generateAgentToolConfig}
      loading={runtimeLoading || autoRefreshing || runtimeNeedsRefresh}
      agentDetail={agentDetail || ({} as Agent)}
      messages={messages}
      loadingMsg={chatLoading}
      runStatus={runStatus}
      currentNodeId={currentNodeId}
      trace={trace}
      runSetup={runSetup}
      rememberedUrl={rememberedBrowserUrl}
      rememberedProfile={rememberedBrowserProfile}
      setupCompleted={setupCompleted}
      onSetupCompletedChange={setSetupCompleted}
      setupPrefillValues={setupPrefillValues}
      userInput={userInput}
      onUserInputChange={setUserInput}
      onTranscript={(text) =>
        setUserInput((prev) => (prev ? `${prev}\n${text}` : text))
      }
      onSendMsg={() => sendMessage({ message: userInput })}
      onStartRunSetup={({ task, answers, reusableMemoryBootstrap }) => {
        const nextRememberedUrl = String(
          reusableMemoryBootstrap?.[PREVIEW_DEFAULT_URL_MEMORY_KEY] || ""
        ).trim();
        const nextRememberedProfile = String(
          reusableMemoryBootstrap?.[PREVIEW_BROWSER_PROFILE_MEMORY_KEY] || ""
        ).trim();
        if (nextRememberedUrl) {
          setRememberedBrowserUrl(nextRememberedUrl);
        }
        if (nextRememberedProfile) {
          setRememberedBrowserProfile(nextRememberedProfile);
        }
        if (task.trim()) {
          setBrowserGoalHint(task.trim());
        }

        void sendMessage({
          message: task,
          runSetupAnswers: answers,
          reusableMemoryBootstrap,
        });
      }}
      pendingForm={pendingForm}
      pendingApproval={pendingApproval}
      onFormSubmit={(values) =>
        void sendMessage({
          resumeAction: {
            type: "form",
            values,
          },
          optimisticUserMessage: "[Submitted form response]",
        })
      }
      onApprovalDecision={(decision) =>
        void sendMessage({
          resumeAction: {
            type: "approval",
            decision,
          },
          optimisticUserMessage:
            decision === "approve" ? "[Approved step]" : "[Rejected step]",
        })
      }
      onCollapse={
        !isMobile
          ? () => {
              setControlRailOpen(false);
            }
          : undefined
      }
      memoryEntries={(agentMemory || []) as any[]}
      onSaveMemory={saveSharedMemoryValue}
    />
  );

  return (
    <div className="app-shell min-h-screen">
      <Header
        previewHeader={true}
        agentDetail={agentDetail}
        onPublish={() => router.push(leaderboardHref)}
        onOpenCode={() => setOpenDialog(true)}
        onDelete={onDeleteAgent}
        deleteDisabled={deleting}
        publishLabel="Leaderboard"
        publishIcon={Trophy}
      />

      <div className="p-4 sm:px-6">
        {isMobile ? (
          <div className="space-y-4">
            <div className="app-panel overflow-hidden rounded-2xl">
              <div className="flex flex-col gap-3 border-b border-border p-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Preview workspace</p>
                  <p className="text-sm text-muted-foreground">
                    Switch between the tracker dashboard, workflow map, shared
                    memory, and the unexpected-changes helper.
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Tabs
                    value={resolvedWorkspaceTab}
                    onValueChange={(value) => setActiveWorkspaceTab(value as PreviewWorkspaceTab)}
                  >
                    <TabsList>
                      <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
                      {isTrackerWorkspace ? (
                        <TabsTrigger value="changes">Changes</TabsTrigger>
                      ) : null}
                      <TabsTrigger value="workflow">Workflow</TabsTrigger>
                      <TabsTrigger value="memory">Memory</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <Button variant="outline" onClick={() => setMobileControlsOpen(true)}>
                    <PanelRightOpen className="mr-1 size-4" />
                    Controls
                  </Button>
                </div>
              </div>

              <div className="p-4">
                {resolvedWorkspaceTab === "dashboard" ? (
                  <TrackerDashboardPanel dashboard={trackerDashboard} />
                ) : resolvedWorkspaceTab === "changes" && isTrackerWorkspace ? (
                  <UnexpectedChangesPanel
                    agentId={agentDetail?.agentId}
                    conversationId={activeConversationId}
                    dashboard={trackerDashboard}
                    onApplied={() => setActiveWorkspaceTab("dashboard")}
                  />
                ) : resolvedWorkspaceTab === "memory" ? (
                  <MemoryInspectorPanel
                    entries={agentMemory || []}
                    timeline={agentMemoryTimeline || []}
                    onSave={saveSharedMemoryValue}
                  />
                ) : (
                  renderWorkflowMap()
                )}
              </div>
            </div>

            <Sheet open={mobileControlsOpen} onOpenChange={setMobileControlsOpen}>
              <SheetContent side="right" className="w-[92vw] max-w-xl p-0">
                <SheetHeader className="border-b border-border p-4 text-left">
                  <SheetTitle>Preview controls</SheetTitle>
                  <SheetDescription>
                    Chat with the runtime, inspect trace state, and resume pending steps.
                  </SheetDescription>
                </SheetHeader>
                <div className="h-full min-h-0 overflow-hidden">{controlRail}</div>
              </SheetContent>
            </Sheet>
          </div>
        ) : (
          <ResizablePanelGroup
            direction="horizontal"
            autoSaveId="preview-split-layout"
            className="min-h-[calc(100vh-108px)]"
          >
            <ResizablePanel defaultSize={68} minSize={42}>
              <div className="app-panel mr-2 flex h-[calc(100vh-108px)] flex-col overflow-hidden rounded-2xl">
                <div className="flex items-center justify-between border-b border-border p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">Preview workspace</p>
                    <p className="text-sm text-muted-foreground">
                      The tracker dashboard, change assistant, workflow map, and
                      shared memory all stay in one place.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Tabs
                      value={resolvedWorkspaceTab}
                      onValueChange={(value) => setActiveWorkspaceTab(value as PreviewWorkspaceTab)}
                    >
                      <TabsList>
                        <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
                        {isTrackerWorkspace ? (
                          <TabsTrigger value="changes">Changes</TabsTrigger>
                        ) : null}
                        <TabsTrigger value="workflow">Workflow</TabsTrigger>
                        <TabsTrigger value="memory">Memory</TabsTrigger>
                      </TabsList>
                    </Tabs>

                    {!controlRailOpen ? (
                      <Button
                        variant="outline"
                        onClick={() => setControlRailOpen(true)}
                      >
                        <PanelRightOpen className="mr-1 size-4" />
                        Open controls
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-auto p-4">
                  {resolvedWorkspaceTab === "dashboard" ? (
                    <TrackerDashboardPanel dashboard={trackerDashboard} />
                  ) : resolvedWorkspaceTab === "changes" && isTrackerWorkspace ? (
                    <UnexpectedChangesPanel
                      agentId={agentDetail?.agentId}
                      conversationId={activeConversationId}
                      dashboard={trackerDashboard}
                      onApplied={() => setActiveWorkspaceTab("dashboard")}
                    />
                  ) : resolvedWorkspaceTab === "memory" ? (
                    <MemoryInspectorPanel
                      entries={agentMemory || []}
                      timeline={agentMemoryTimeline || []}
                      onSave={saveSharedMemoryValue}
                    />
                  ) : (
                    renderWorkflowMap()
                  )}
                </div>
              </div>
            </ResizablePanel>

            {controlRailOpen ? (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={32} minSize={24} maxSize={40}>
                  <div className="app-panel ml-2 h-[calc(100vh-108px)] overflow-hidden rounded-2xl">
                    {controlRail}
                  </div>
                </ResizablePanel>
              </>
            ) : null}
          </ResizablePanelGroup>
        )}
      </div>

      <PublishCodeDialog
        openDialog={openDialog}
        setOpenDialog={setOpenDialog}
        agentId={agentDetail?.agentId}
      />
    </div>
  );
}

export default PreviewAgent;
