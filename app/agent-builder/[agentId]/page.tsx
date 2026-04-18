"use client";

import { nodeTypes } from "./nodeTypes";

import React, { DragEvent, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import Header from "../_components/Header";
import {
  ReactFlow,
  ReactFlowInstance,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useOnSelectionChange,
  OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import AgentToolsPanel, {
  createPaletteNode,
  MANUAL_AGENT_TOOLS,
  MANUAL_NODE_DRAG_TYPE,
  ManualNodeTool,
} from "../_components/AgentToolsPanel";
import BuilderClarificationDialog from "../_components/BuilderClarificationDialog";
import TrackerTopicIntakeDialog from "../_components/TrackerTopicIntakeDialog";
import PublishCodeDialog from "./preview/_components/PublishCodeDialog";
import SettingPanel from "../_components/SettingPanel";
import WorkflowAssistantPanel from "../_components/WorkflowAssistantPanel";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkflowContext } from "@/context/WorkflowContext";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useParams, useRouter } from "next/navigation";
import { Agent } from "@/types/AgentType";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2Icon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Save,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import {
  buildFlowConfigFromCanvas,
  BuilderChatMessage,
  BuilderClarificationQuestion,
  BuilderMemoryEntry,
  BuilderResearchPoint,
  NODE_STYLE_MAP,
  normalizeBuilderChatMessages,
  normalizeBuilderExecutionPlan,
  normalizeBuilderMemoryEntries,
  normalizeClarificationQuestions,
  normalizePreviewPromptList,
  normalizeResearchPoints,
} from "@/lib/agent-builder";
import {
  applyTrackerTopicSummaryToAgentNode,
  buildTrackerTopicAnswerSummary,
  buildTrackerTopicBuilderMemoryEntries,
  buildTrackerTopicFallbackPack,
  buildTrackerTopicFormNode,
  isTrackerTopicDomainId,
} from "@/lib/tracker-topic-intake";

function createBuilderMessage(
  role: BuilderChatMessage["role"],
  content: string
): BuilderChatMessage {
  return {
    id: `builder-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

function toMemoryKey(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "builder_memory";
}

function mergeBuilderMemoryEntries(
  existingEntries: BuilderMemoryEntry[],
  questions: BuilderClarificationQuestion[],
  values: Record<string, string>
) {
  const nextEntries = [...existingEntries];

  for (const question of questions) {
    const answer = String(values[question.id] || "").trim();
    if (!answer) {
      continue;
    }

    const key = question.memoryKey || toMemoryKey(question.label || question.question);
    const nextEntry = {
      key,
      label: question.label || question.question,
      value: answer,
      updatedAt: new Date().toISOString(),
    } satisfies BuilderMemoryEntry;
    const existingIndex = nextEntries.findIndex((entry) => entry.key === key);

    if (existingIndex >= 0) {
      nextEntries[existingIndex] = nextEntry;
    } else {
      nextEntries.push(nextEntry);
    }
  }

  return nextEntries;
}

function formatClarificationSummary(
  questions: BuilderClarificationQuestion[],
  values: Record<string, string>
) {
  return questions
    .map((question) => {
      const answer = String(values[question.id] || "").trim();
      if (!answer) {
        return null;
      }

      return `${question.label}: ${answer}`;
    })
    .filter(Boolean)
    .join("\n");
}

function buildAssistantRecap(
  assistantMessage: string,
  research: BuilderResearchPoint[],
  executionPlan: string[]
) {
  const researchLines = research
    .slice(0, 3)
    .map((item) => `- ${item.title}: ${item.point}`);
  const planLines = executionPlan.slice(0, 4).map((item) => {
    const cleaned = item.replace(/^\d+\.\s*/, "");
    return `- ${cleaned}`;
  });

  return [
    assistantMessage.trim(),
    researchLines.length ? `Research focus:\n${researchLines.join("\n")}` : "",
    planLines.length ? `Execution plan:\n${planLines.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

const CANVAS_SNAP_GRID: [number, number] = [24, 24];

type TrackerTopicPack = {
  title: string;
  description: string;
  questions: BuilderClarificationQuestion[];
};

type PendingTrackerTopicInsert = {
  tool: ManualNodeTool;
  position?: { x: number; y: number };
};

function buildStartCanvasNode() {
  return {
    id: "start",
    type: "start",
    position: { x: 80, y: 220 },
    data: {
      label: "Start",
      bgColor: NODE_STYLE_MAP.start.bgColor,
      id: NODE_STYLE_MAP.start.paletteId,
      type: "start",
    },
    deletable: false,
  };
}

function snapCanvasPosition(position: { x: number; y: number }) {
  return {
    x: Math.round(position.x / CANVAS_SNAP_GRID[0]) * CANVAS_SNAP_GRID[0],
    y: Math.round(position.y / CANVAS_SNAP_GRID[1]) * CANVAS_SNAP_GRID[1],
  };
}

function sanitizeCanvasNodes(nodes: any[] = []) {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const seenIds = new Set<string>(["start"]);
  const sanitizedNodes: any[] = [];
  let startNode = buildStartCanvasNode();

  for (const node of safeNodes) {
    if (!node || typeof node !== "object") {
      continue;
    }

    const isStartNode =
      node.id === "start" || node.type === "start" || node.type === "StartNode";

    if (isStartNode) {
      const nextPosition =
        Number.isFinite(node.position?.x) && Number.isFinite(node.position?.y)
          ? snapCanvasPosition({
              x: Number(node.position.x),
              y: Number(node.position.y),
            })
          : startNode.position;

      startNode = {
        ...buildStartCanvasNode(),
        ...node,
        id: "start",
        type: "start",
        position: nextPosition,
        data: {
          ...buildStartCanvasNode().data,
          ...(node.data || {}),
          label: String(node.data?.label || "Start"),
        },
        deletable: false,
      };
      continue;
    }

    const nodeId = String(node.id || "").trim();
    if (!nodeId || seenIds.has(nodeId)) {
      continue;
    }

    seenIds.add(nodeId);

    const fallbackPosition = snapCanvasPosition({
      x: 320 + (sanitizedNodes.length % 3) * 280,
      y: 120 + Math.floor(sanitizedNodes.length / 3) * 180,
    });
    const nextPosition =
      Number.isFinite(node.position?.x) && Number.isFinite(node.position?.y)
        ? snapCanvasPosition({
            x: Number(node.position.x),
            y: Number(node.position.y),
          })
        : fallbackPosition;
    const nodeType = String(node.type || node.data?.type || "AgentNode");
    const nodeStyle =
      NODE_STYLE_MAP[nodeType as keyof typeof NODE_STYLE_MAP] ?? NODE_STYLE_MAP.AgentNode;

    sanitizedNodes.push({
      ...node,
      id: nodeId,
      type: nodeType,
      position: nextPosition,
      data: {
        ...(node.data || {}),
        label: String(node.data?.label || node.data?.settings?.name || nodeType),
        bgColor: String(node.data?.bgColor || nodeStyle.bgColor),
        id: String(node.data?.id || nodeStyle.paletteId),
        type: String(node.data?.type || nodeType),
        settings:
          node.data?.settings && typeof node.data.settings === "object"
            ? node.data.settings
            : {},
      },
      deletable: node.deletable ?? true,
    });
  }

  return [startNode, ...sanitizedNodes];
}

function makeCanvasEdgeId(source: string, target: string, sourceHandle?: string) {
  return `edge-${source}-${sourceHandle || "default"}-${target}`;
}

function sanitizeCanvasEdges(edges: any[] = [], nodes: any[] = []) {
  const safeEdges = Array.isArray(edges) ? edges : [];
  const nodeIds = new Set(
    (Array.isArray(nodes) ? nodes : [])
      .map((node) => String(node?.id || ""))
      .filter(Boolean)
  );
  const seenEdgeKeys = new Set<string>();

  return safeEdges
    .filter((edge) => edge && typeof edge === "object")
    .map((edge) => {
      const source = String(edge.source || "").trim();
      const target = String(edge.target || "").trim();
      const sourceHandle = edge.sourceHandle ? String(edge.sourceHandle) : undefined;

      return {
        ...edge,
        source,
        target,
        sourceHandle,
      };
    })
    .filter(
      (edge) =>
        edge.source &&
        edge.target &&
        edge.source !== edge.target &&
        nodeIds.has(edge.source) &&
        nodeIds.has(edge.target)
    )
    .filter((edge) => {
      const edgeKey = makeCanvasEdgeId(edge.source, edge.target, edge.sourceHandle);
      if (seenEdgeKeys.has(edgeKey)) {
        return false;
      }

      seenEdgeKeys.add(edgeKey);
      return true;
    })
    .map((edge) => ({
      ...edge,
      id: String(edge.id || makeCanvasEdgeId(edge.source, edge.target, edge.sourceHandle)),
      type: String(edge.type || "smoothstep"),
    }));
}

function AgentBuilder() {
  const { agentId } = useParams();
  const router = useRouter();

  const {
    addedNodes,
    setAddedNodes,
    nodeEdges,
    setNodeEdges,
    selectedNode,
    setSelectedNode,
  } = useContext(WorkflowContext);
  const isMobile = useIsMobile();

  const convex = useConvex();
  const updateAgentDetail = useMutation(api.agent.UpdateAgentDetail);
  const updateAgentToolConfig = useMutation(api.agent.UpdateAgentToolConfig);
  const deleteAgent = useMutation(api.agent.DeleteAgentById);
  const [agentDetail, setAgentDetail] = useState<Agent | null>(null);
  const agentSharedMemory = useQuery(
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
          limit: 40,
        }
      : "skip"
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [builderPrompt, setBuilderPrompt] = useState("");
  const [assistantFiles, setAssistantFiles] = useState<File[]>([]);
  const [research, setResearch] = useState<BuilderResearchPoint[]>([]);
  const [previewPrompts, setPreviewPrompts] = useState<string[]>([]);
  const [builderMessages, setBuilderMessages] = useState<BuilderChatMessage[]>([]);
  const [builderMemory, setBuilderMemory] = useState<BuilderMemoryEntry[]>([]);
  const [executionPlan, setExecutionPlan] = useState<string[]>([]);
  const [statusText, setStatusText] = useState("");
  const [openCodeDialog, setOpenCodeDialog] = useState(false);
  const [clarificationDialogOpen, setClarificationDialogOpen] = useState(false);
  const [clarificationQuestions, setClarificationQuestions] = useState<
    BuilderClarificationQuestion[]
  >([]);
  const [clarificationValues, setClarificationValues] = useState<Record<string, string>>(
    {}
  );
  const [trackerTopicDialogOpen, setTrackerTopicDialogOpen] = useState(false);
  const [trackerTopicLoading, setTrackerTopicLoading] = useState(false);
  const [trackerTopicPack, setTrackerTopicPack] = useState<TrackerTopicPack | null>(null);
  const [pendingTrackerTopicInsert, setPendingTrackerTopicInsert] =
    useState<PendingTrackerTopicInsert | null>(null);
  const [pendingBuilderPrompt, setPendingBuilderPrompt] = useState("");
  const [blocksRailOpen, setBlocksRailOpen] = usePersistentState(
    "builder-blocks-rail-open",
    true
  );
  const [workspaceRailOpen, setWorkspaceRailOpen] = usePersistentState(
    "builder-workspace-rail-open",
    true
  );
  const [workspaceRailTab, setWorkspaceRailTab] = usePersistentState<
    "assistant" | "inspector"
  >("builder-workspace-rail-tab", "assistant");
  const [blocksSheetOpen, setBlocksSheetOpen] = useState(false);
  const [workspaceSheetOpen, setWorkspaceSheetOpen] = useState(false);
  const leaderboardHref = `/dashboard/leaderboard${
    agentDetail?.agentId || agentId ? `?focus=${agentDetail?.agentId || agentId}` : ""
  }`;

  const isInternalUpdate = useRef(false);
  const reactFlowRef = useRef<ReactFlowInstance<any, any> | null>(null);
  const canvasSurfaceRef = useRef<HTMLDivElement | null>(null);

  const normalizedCanvasNodes = useMemo(
    () => sanitizeCanvasNodes(addedNodes || []),
    [addedNodes]
  );
  const normalizedCanvasEdges = useMemo(
    () => sanitizeCanvasEdges(nodeEdges || [], normalizedCanvasNodes),
    [nodeEdges, normalizedCanvasNodes]
  );
  const trackerTopicInitialValues = useMemo(() => {
    const builderMemoryMap = Object.fromEntries(
      builderMemory.map((entry) => [String(entry.key), String(entry.value || "")])
    );
    const sharedMemoryMap = Object.fromEntries(
      (agentSharedMemory || []).map((entry: any) => [
        String(entry.memoryKey),
        String(entry.value || ""),
      ])
    );

    return Object.fromEntries(
      (trackerTopicPack?.questions || []).map((question) => [
        question.id,
        builderMemoryMap[question.memoryKey || question.id] ||
          sharedMemoryMap[question.memoryKey || question.id] ||
          "",
      ])
    );
  }, [agentSharedMemory, builderMemory, trackerTopicPack?.questions]);
  const currentFlowConfig = useMemo(
    () => buildFlowConfigFromCanvas(normalizedCanvasNodes, normalizedCanvasEdges),
    [normalizedCanvasEdges, normalizedCanvasNodes]
  );

  const buildDraftConfig = useCallback(
    () => ({
      ...(agentDetail?.config ?? {}),
      builderPrompt,
      research: normalizeResearchPoints(research),
      previewPrompts: normalizePreviewPromptList(previewPrompts),
      builderMessages: normalizeBuilderChatMessages(builderMessages),
      builderMemory: normalizeBuilderMemoryEntries(builderMemory),
      executionPlan: normalizeBuilderExecutionPlan(executionPlan),
      lastEditedAt: new Date().toISOString(),
    }),
    [
      agentDetail?.config,
      builderMemory,
      builderMessages,
      builderPrompt,
      executionPlan,
      previewPrompts,
      research,
    ]
  );

  useEffect(() => {
    if (agentId) {
      void getAgentDetail();
    }
  }, [agentId]);

  const fitCanvasToGraph = useCallback((duration = 260) => {
    requestAnimationFrame(() => {
      reactFlowRef.current?.fitView({
        duration,
        padding: 0.14,
        minZoom: 0.35,
        maxZoom: 1.1,
      });
    });
  }, []);

  const getCanvasInsertPosition = useCallback(
    (position?: { x: number; y: number }) => {
      if (position) {
        return snapCanvasPosition(position);
      }

      if (reactFlowRef.current && canvasSurfaceRef.current) {
        const bounds = canvasSurfaceRef.current.getBoundingClientRect();
        return snapCanvasPosition(
          reactFlowRef.current.screenToFlowPosition({
            x: bounds.left + bounds.width / 2,
            y: bounds.top + bounds.height / 2,
          })
        );
      }

      return snapCanvasPosition({ x: 360, y: 220 });
    },
    []
  );

  const replaceCanvas = useCallback(
    (nodes: any[], edges: any[], options?: { fitView?: boolean; duration?: number }) => {
      const nextNodes = sanitizeCanvasNodes(nodes);
      const nextEdges = sanitizeCanvasEdges(edges, nextNodes);
      isInternalUpdate.current = true;
      setAddedNodes(nextNodes);
      setNodeEdges(nextEdges);
      setSelectedNode(null);
      requestAnimationFrame(() => {
        isInternalUpdate.current = false;

        if (options?.fitView !== false) {
          fitCanvasToGraph(options?.duration ?? 260);
        }
      });
    },
    [fitCanvasToGraph, setAddedNodes, setNodeEdges, setSelectedNode]
  );

  const openTrackerTopicDialog = useCallback(
    async (tool: ManualNodeTool, position?: { x: number; y: number }) => {
      setPendingTrackerTopicInsert({ tool, position });
      setTrackerTopicPack(buildTrackerTopicFallbackPack(tool.id, tool.name));
      setTrackerTopicDialogOpen(true);
      setTrackerTopicLoading(true);

      try {
        const response = await axios.post("/api/tracker/topic-questions", {
          domainId: tool.id,
          domainName: tool.name,
          builderPrompt,
          builderMemory,
          agentMemory: agentSharedMemory || [],
          agentMemoryTimeline: agentMemoryTimeline || [],
        });

        setTrackerTopicPack(response.data);
      } catch (error) {
        console.warn("Unable to load tracker topic questions from the builder proxy.", error);
        setTrackerTopicPack(buildTrackerTopicFallbackPack(tool.id, tool.name));
      } finally {
        setTrackerTopicLoading(false);
      }
    },
    [agentMemoryTimeline, agentSharedMemory, builderMemory, builderPrompt]
  );

  const closeTrackerTopicDialog = useCallback((open: boolean) => {
    setTrackerTopicDialogOpen(open);

    if (!open) {
      setTrackerTopicLoading(false);
      setPendingTrackerTopicInsert(null);
      setTrackerTopicPack(null);
    }
  }, []);

  const submitTrackerTopicDialog = useCallback(
    (answers: Record<string, string>) => {
      if (!pendingTrackerTopicInsert || !trackerTopicPack) {
        return;
      }

      const insertPosition = getCanvasInsertPosition(pendingTrackerTopicInsert.position);
      const formNode = buildTrackerTopicFormNode({
        domainId: pendingTrackerTopicInsert.tool.id,
        domainName: pendingTrackerTopicInsert.tool.name,
        pack: trackerTopicPack,
        position: insertPosition,
      });
      const rawAgentNode = createPaletteNode(pendingTrackerTopicInsert.tool, {
        x: insertPosition.x + 340,
        y: insertPosition.y,
      });

      if (!rawAgentNode) {
        toast.error("That block could not be added right now.");
        return;
      }

      const summary = buildTrackerTopicAnswerSummary(trackerTopicPack, answers);
      const nextAgentNode = applyTrackerTopicSummaryToAgentNode(rawAgentNode, summary);
      const nextNodes = sanitizeCanvasNodes([
        ...normalizedCanvasNodes,
        formNode,
        nextAgentNode,
      ]);
      const nextEdges = sanitizeCanvasEdges(
        [
          ...normalizedCanvasEdges,
          {
            source: formNode.id,
            target: nextAgentNode.id,
          },
        ],
        nextNodes
      );

      setAddedNodes(nextNodes);
      setNodeEdges(nextEdges);
      setSelectedNode(nextAgentNode);
      setBuilderMemory((prev) => {
        const nextEntries = [...prev];

        for (const entry of buildTrackerTopicBuilderMemoryEntries(trackerTopicPack, answers)) {
          const existingIndex = nextEntries.findIndex((candidate) => candidate.key === entry.key);

          if (existingIndex >= 0) {
            nextEntries[existingIndex] = entry;
          } else {
            nextEntries.push(entry);
          }
        }

        return nextEntries;
      });
      setTrackerTopicDialogOpen(false);
      setPendingTrackerTopicInsert(null);
      setTrackerTopicPack(null);
      fitCanvasToGraph();
    },
    [
      fitCanvasToGraph,
      getCanvasInsertPosition,
      normalizedCanvasEdges,
      normalizedCanvasNodes,
      pendingTrackerTopicInsert,
      setAddedNodes,
      setNodeEdges,
      setSelectedNode,
      trackerTopicPack,
    ]
  );

  const addManualNodeToCanvas = useCallback(
    (tool: ManualNodeTool, position?: { x: number; y: number }) => {
      if (isTrackerTopicDomainId(tool.id)) {
        void openTrackerTopicDialog(tool, position);
        return;
      }

      const nextNode = createPaletteNode(tool, getCanvasInsertPosition(position));
      if (!nextNode) {
        toast.error("That block could not be added right now.");
        return;
      }
      setAddedNodes((prev: any[]) =>
        sanitizeCanvasNodes([...(Array.isArray(prev) ? prev : []), nextNode])
      );
      setSelectedNode(nextNode);
    },
    [getCanvasInsertPosition, openTrackerTopicDialog, setAddedNodes, setSelectedNode]
  );

  const getAgentDetail = async () => {
    const result = await convex.query(api.agent.GetAgentById, {
      agentId: agentId as string,
    });

    if (!result) {
      toast.error("The requested agent could not be found.");
      router.push("/dashboard/my-agents");
      return;
    }

    setAgentDetail(result as Agent);
    setBuilderPrompt(result.config?.builderPrompt || "");
    setResearch(normalizeResearchPoints(result.config?.research));
    setPreviewPrompts(normalizePreviewPromptList(result.config?.previewPrompts));
    setBuilderMessages(normalizeBuilderChatMessages(result.config?.builderMessages));
    setBuilderMemory(normalizeBuilderMemoryEntries(result.config?.builderMemory));
    setExecutionPlan(normalizeBuilderExecutionPlan(result.config?.executionPlan));
  };

  useEffect(() => {
    if (!agentDetail) {
      return;
    }

    replaceCanvas(agentDetail.nodes, agentDetail.edges);
  }, [agentDetail, replaceCanvas]);

  useEffect(() => {
    if (!selectedNode || isMobile) {
      return;
    }

    setWorkspaceRailOpen(true);
    setWorkspaceRailTab("inspector");
  }, [isMobile, selectedNode, setWorkspaceRailOpen, setWorkspaceRailTab]);

  const saveNodeAndEdges = async (showToast = true) => {
    if (!agentId) {
      return false;
    }

    setIsSaving(true);
    try {
      const nextNodes = sanitizeCanvasNodes(addedNodes || []);
      const nextEdges = sanitizeCanvasEdges(nodeEdges || [], nextNodes);
      const graphChanged =
        JSON.stringify(nextNodes) !== JSON.stringify(addedNodes || []) ||
        JSON.stringify(nextEdges) !== JSON.stringify(nodeEdges || []);
      const nextConfig = buildDraftConfig();

      if (graphChanged) {
        replaceCanvas(nextNodes, nextEdges, { fitView: false });
      }

      await updateAgentDetail({
        agentId: agentId as string,
        nodes: nextNodes,
        edges: nextEdges,
        config: nextConfig,
      });

      setAgentDetail((prev) =>
        prev
          ? {
              ...prev,
              nodes: nextNodes,
              edges: nextEdges,
              config: nextConfig,
            }
          : prev
      );

      if (showToast) {
        toast.success("Workflow saved.");
      }

      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save the workflow.";
      toast.error(message);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const onNodesChange = useCallback(
    (changes: any) => {
      if (isInternalUpdate.current) {
        return;
      }

      setAddedNodes((prev: any[]) =>
        sanitizeCanvasNodes(applyNodeChanges(changes, prev || []))
      );
    },
    [setAddedNodes]
  );

  const onEdgesChange = useCallback(
    (changes: any) => {
      setNodeEdges((prev: any[]) =>
        sanitizeCanvasEdges(applyEdgeChanges(changes, prev || []), normalizedCanvasNodes)
      );
    },
    [normalizedCanvasNodes, setNodeEdges]
  );

  const onConnect = useCallback(
    (params: any) => {
      if (!params?.source || !params?.target || params.source === params.target) {
        return;
      }

      setNodeEdges((prev: any[]) =>
        sanitizeCanvasEdges(
          addEdge(
            {
              ...params,
              type: "smoothstep",
            },
            prev || []
          ),
          normalizedCanvasNodes
        )
      );
    },
    [normalizedCanvasNodes, setNodeEdges]
  );

  const onNodeSelect = useCallback(
    ({ nodes }: OnSelectionChangeParams) => {
      setSelectedNode(nodes?.[0] || null);
    },
    [setSelectedNode]
  );

  useOnSelectionChange({ onChange: onNodeSelect });

  const generateAgentRuntime = async ({
    nodes,
    edges,
    systemPrompt,
  }: {
    nodes: any[];
    edges: any[];
    systemPrompt?: string;
  }) => {
    const runtimeConfigResponse = await axios.post("/api/generate-agent-tool-config", {
      jsonConfig: buildFlowConfigFromCanvas(nodes, edges),
      agentName: agentDetail?.name,
      builderContext: builderPrompt,
      researchNotes: research,
    });

    return {
      ...runtimeConfigResponse.data,
      systemPrompt: [systemPrompt, runtimeConfigResponse.data?.systemPrompt]
        .filter(Boolean)
        .join("\n\n"),
      primaryAgentName:
        runtimeConfigResponse.data?.primaryAgentName ||
        agentDetail?.name ||
        "Systematic Tracker",
    };
  };

  const appendAssistantFiles = useCallback((files: FileList | File[]) => {
    const nextFiles = Array.from(files || []);

    setAssistantFiles((prev) => {
      const existingKeys = new Set(
        prev.map((file) => `${file.name}-${file.size}-${file.lastModified}`)
      );
      const deduped = nextFiles.filter((file) => {
        const nextKey = `${file.name}-${file.size}-${file.lastModified}`;
        return !existingKeys.has(nextKey);
      });

      return [...prev, ...deduped];
    });
  }, []);

  const removeAssistantFile = useCallback((index: number) => {
    setAssistantFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index));
  }, []);

  const buildBuilderMultipartPayload = useCallback(
    (extraFields: Record<string, unknown>) => {
      const formData = new FormData();

      for (const [key, value] of Object.entries(extraFields)) {
        if (value === undefined) {
          continue;
        }

        if (
          value !== null &&
          typeof value === "object" &&
          !(value instanceof Blob) &&
          !(value instanceof File)
        ) {
          formData.append(key, JSON.stringify(value));
          continue;
        }

        formData.append(key, String(value ?? ""));
      }

      assistantFiles.forEach((file) => {
        formData.append("assistantFiles", file, file.name);
      });

      return formData;
    },
    [assistantFiles]
  );

  const onRequestClarifications = async () => {
    const trimmedPrompt = builderPrompt.trim();

    if (!trimmedPrompt) {
      toast.error("Add the rough task prompt before asking the builder to plan it.");
      return;
    }

    if (!agentDetail?.name) {
      toast.error("The agent is still loading. Try again in a moment.");
      return;
    }

    let nextMessages = [
      ...builderMessages,
      createBuilderMessage("user", trimmedPrompt),
    ];
    setBuilderMessages(nextMessages);
    setPendingBuilderPrompt(trimmedPrompt);
    setIsGenerating(true);
    setStatusText("Reading your brief with the ChatGPT builder and preparing follow-up questions...");

    try {
      const response = await axios.post(
        "/api/agent-builder/clarify",
        buildBuilderMultipartPayload({
          prompt: trimmedPrompt,
          agentName: agentDetail.name,
          builderMemory,
          agentMemory: agentSharedMemory || [],
          agentMemoryTimeline: agentMemoryTimeline || [],
          existingResearch: research,
          existingFlowConfig: currentFlowConfig,
        })
      );

      const questions = normalizeClarificationQuestions(response.data?.questions);
      const autoMemoryEntries = normalizeBuilderMemoryEntries(
        response.data?.autoMemoryEntries
      );

      if (!questions.length) {
        throw new Error("The builder did not return any follow-up questions.");
      }

      if (autoMemoryEntries.length) {
        setBuilderMemory((prev) => {
          const nextEntries = [...prev];

          for (const entry of autoMemoryEntries) {
            const existingIndex = nextEntries.findIndex(
              (candidate) => candidate.key === entry.key
            );

            if (existingIndex >= 0) {
              nextEntries[existingIndex] = entry;
            } else {
              nextEntries.push(entry);
            }
          }

          return nextEntries;
        });
      }

      const assistantMessage = String(
        response.data?.assistantMessage ||
          "I need a few more details before I build the workflow."
      );
      nextMessages = [
        ...nextMessages,
        createBuilderMessage("assistant", assistantMessage),
      ];
      setBuilderMessages(nextMessages);
      setClarificationQuestions(questions);
      setClarificationValues(
        Object.fromEntries(
          questions.map((question) => [
            question.id,
            autoMemoryEntries.find((entry) => entry.key === question.memoryKey)?.value ||
              builderMemory.find((entry) => entry.key === question.memoryKey)?.value ||
              "",
          ])
        )
      );
      setClarificationDialogOpen(true);
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        "The builder could not prepare the follow-up questions.";
      toast.error(message);
    } finally {
      setStatusText("");
      setIsGenerating(false);
    }
  };

  const onGenerateWorkflow = async () => {
    const trimmedPrompt = (pendingBuilderPrompt || builderPrompt).trim();

    if (!trimmedPrompt) {
      toast.error("Add the task context before generating the workflow.");
      return;
    }

    if (!agentDetail?._id || !agentId) {
      toast.error("The agent is still loading. Try again in a moment.");
      return;
    }

    for (const question of clarificationQuestions) {
      const answer = String(clarificationValues[question.id] || "").trim();
      if (question.required && !answer) {
        toast.error(`Answer "${question.label}" before building the workflow.`);
        return;
      }

      if (
        question.responseType === "mcq" &&
        answer &&
        question.options.length &&
        !question.options.includes(answer)
      ) {
        toast.error(`"${question.label}" must use one of the listed choices.`);
        return;
      }
    }

    try {
      setClarificationDialogOpen(false);
      setIsGenerating(true);

      const nextBuilderMemory = mergeBuilderMemoryEntries(
        builderMemory,
        clarificationQuestions,
        clarificationValues
      );
      setBuilderMemory(nextBuilderMemory);

      let nextMessages = [...builderMessages];
      const clarificationSummary = formatClarificationSummary(
        clarificationQuestions,
        clarificationValues
      );
      if (clarificationSummary) {
        nextMessages = [
          ...nextMessages,
          createBuilderMessage("user", clarificationSummary),
        ];
        setBuilderMessages(nextMessages);
      }

      setStatusText("Researching the task with the ChatGPT builder and assembling the workflow...");

      const response = await axios.post(
        "/api/agent-builder/generate",
        buildBuilderMultipartPayload({
          prompt: trimmedPrompt,
          agentName: agentDetail.name,
          clarificationAnswers: clarificationQuestions.map((question) => ({
            id: question.id,
            label: question.label,
            question: question.question,
            answer: clarificationValues[question.id] || "",
          })),
          builderMemory: nextBuilderMemory,
          agentMemory: agentSharedMemory || [],
          agentMemoryTimeline: agentMemoryTimeline || [],
          existingFlowConfig: currentFlowConfig,
          existingResearch: research,
        })
      );

      const generatedNodes = Array.isArray(response.data?.nodes) ? response.data.nodes : [];
      const generatedEdges = Array.isArray(response.data?.edges) ? response.data.edges : [];
      const nextResearch = normalizeResearchPoints(response.data?.research);
      const nextPreviewPrompts = normalizePreviewPromptList(response.data?.previewPrompts);
      const nextExecutionPlan = normalizeBuilderExecutionPlan(response.data?.executionPlan);
      const autoMemoryEntries = normalizeBuilderMemoryEntries(
        response.data?.autoMemoryEntries
      );
      const nextSystemPrompt = response.data?.systemPrompt || "";
      const nextAgentName = response.data?.agentName || agentDetail.name;
      const assistantMessage = buildAssistantRecap(
        String(
          response.data?.assistantMessage ||
            "I researched the request and rebuilt the workflow."
        ),
        nextResearch,
        nextExecutionPlan
      );

      nextMessages = [
        ...nextMessages,
        createBuilderMessage("assistant", assistantMessage),
      ];
      const mergedGeneratedBuilderMemory = [...nextBuilderMemory];
      for (const entry of autoMemoryEntries) {
        const existingIndex = mergedGeneratedBuilderMemory.findIndex(
          (candidate) => candidate.key === entry.key
        );
        if (existingIndex >= 0) {
          mergedGeneratedBuilderMemory[existingIndex] = entry;
        } else {
          mergedGeneratedBuilderMemory.push(entry);
        }
      }
      setBuilderMessages(nextMessages);
      setExecutionPlan(nextExecutionPlan);

      replaceCanvas(generatedNodes, generatedEdges);
      setResearch(nextResearch);
      setPreviewPrompts(nextPreviewPrompts);

      setStatusText("Turning the workflow into a runnable agent config...");

      let runtimeConfig: any = null;
      try {
        runtimeConfig = await generateAgentRuntime({
          nodes: generatedNodes,
          edges: generatedEdges,
          systemPrompt: nextSystemPrompt,
        });
      } catch (error: any) {
        const message =
          error?.response?.data?.error ||
          "The workflow was generated, but the runtime config still needs a refresh.";
        toast.error(message);
      }

      setStatusText("Saving the generated workflow back to the agent...");

      const nextConfig = {
        ...(agentDetail.config ?? {}),
        builderPrompt: trimmedPrompt,
        research: nextResearch,
        previewPrompts: nextPreviewPrompts,
        builderMessages: nextMessages,
        builderMemory: mergedGeneratedBuilderMemory,
        executionPlan: nextExecutionPlan,
        systemPrompt: nextSystemPrompt,
        lastGeneratedAt: new Date().toISOString(),
      };

      await updateAgentDetail({
        agentId: agentId as string,
        name: nextAgentName,
        nodes: generatedNodes,
        edges: generatedEdges,
        config: nextConfig,
      });

      if (runtimeConfig) {
        await updateAgentToolConfig({
          id: agentDetail._id,
          agentToolConfig: runtimeConfig,
        });
      }

      setAgentDetail((prev) =>
        prev
          ? {
              ...prev,
              name: nextAgentName,
              nodes: generatedNodes,
              edges: generatedEdges,
              config: nextConfig,
              agentToolConfig: runtimeConfig ?? prev.agentToolConfig,
            }
          : prev
      );
      setBuilderMemory(mergedGeneratedBuilderMemory);

      toast.success(
        runtimeConfig
          ? "Research complete. The workflow and runtime agent are ready."
          : "Research complete. The workflow is on the canvas."
      );

      setClarificationQuestions([]);
      setClarificationValues({});
      setPendingBuilderPrompt("");
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        "The builder could not generate the workflow right now.";
      toast.error(message);
    } finally {
      setStatusText("");
      setIsGenerating(false);
    }
  };

  const openLeaderboard = async () => {
    if (!agentId) {
      return;
    }

    try {
      const saved = await saveNodeAndEdges(false);
      if (!saved) {
        return;
      }
      router.push(leaderboardHref);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to open the leaderboard.";
      toast.error(message);
    }
  };

  const onPreview = async () => {
    const saved = await saveNodeAndEdges(false);
    if (!saved || !agentId) {
      return;
    }

    router.push(`/agent-builder/${agentId}/preview`);
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

    setIsDeleting(true);
    try {
      await deleteAgent({
        agentId: agentId as string,
      });

      toast.success("Agent deleted.");
      router.push("/dashboard/my-agents");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to delete the agent.";
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  };

  const onCanvasDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onCanvasDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();

      const rawPayload = event.dataTransfer.getData(MANUAL_NODE_DRAG_TYPE);
      if (!rawPayload || !reactFlowRef.current) {
        return;
      }

      try {
        const payload = JSON.parse(rawPayload) as { id?: string; type?: string };
        const tool = MANUAL_AGENT_TOOLS.find((item) => item.id === payload.id);
        if (!tool) {
          return;
        }

        const position = reactFlowRef.current.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });

        addManualNodeToCanvas(tool, position);
      } catch {
        toast.error("Unable to drop that node on the canvas.");
      }
    },
    [addManualNodeToCanvas]
  );

  return (
    <div className="app-shell min-h-screen overflow-y-auto">
      <Header
        agentDetail={agentDetail || undefined}
        onPublish={() => void openLeaderboard()}
        onOpenCode={() => setOpenCodeDialog(true)}
        onDelete={onDeleteAgent}
        onPreview={() => void onPreview()}
        deleteDisabled={isDeleting}
        publishLabel="Leaderboard"
        publishIcon={Trophy}
      />

      <div className="flex min-h-[calc(100vh-92px)] gap-4 p-4 sm:px-6">
        {!isMobile ? (
          blocksRailOpen ? (
            <aside className="w-[280px] shrink-0">
              <div className="app-panel sticky top-4 flex h-[calc(100vh-108px)] flex-col overflow-hidden rounded-3xl">
                <div className="flex items-start justify-between gap-3 border-b border-border p-4 dark:bg-slate-950/40">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Workflow blocks</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Drag blocks onto the canvas or click to add them instantly.
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setBlocksRailOpen(false)}
                  >
                    <PanelLeftClose className="size-4" />
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <AgentToolsPanel onAddTool={addManualNodeToCanvas} />
                </div>
              </div>
            </aside>
          ) : (
            <div className="shrink-0">
              <div className="sticky top-4">
                <Button variant="outline" onClick={() => setBlocksRailOpen(true)}>
                  <PanelLeftOpen className="mr-1 size-4" />
                  Blocks
                </Button>
              </div>
            </div>
          )
        ) : null}

        <section className="app-panel relative flex min-h-[720px] min-w-0 flex-1 flex-col overflow-hidden rounded-3xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 dark:bg-slate-950/40">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Workflow canvas</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Keep the canvas front and center, then pull tools in from the side
                rails when you need them.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isMobile ? (
                <>
                  <Button variant="outline" onClick={() => setBlocksSheetOpen(true)}>
                    <PanelLeftOpen className="mr-1 size-4" />
                    Blocks
                  </Button>
                  <Button variant="outline" onClick={() => setWorkspaceSheetOpen(true)}>
                    <PanelRightOpen className="mr-1 size-4" />
                    Workspace
                  </Button>
                </>
              ) : null}
              {!isMobile && !workspaceRailOpen ? (
                <Button variant="outline" onClick={() => setWorkspaceRailOpen(true)}>
                  <PanelRightOpen className="mr-1 size-4" />
                  Workspace
                </Button>
              ) : null}
              <Badge variant="outline" className="bg-background">
                {Math.max(normalizedCanvasNodes.length - 1, 0)} nodes
              </Badge>
              <Badge variant="outline" className="bg-background">
                {normalizedCanvasEdges.length} edges
              </Badge>
              <Button onClick={() => void saveNodeAndEdges()} disabled={isSaving}>
                {isSaving ? <Loader2Icon className="animate-spin" /> : <Save className="mr-1" />}
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>

          <div className="workflow-canvas-surface min-h-[620px] flex-1" ref={canvasSurfaceRef}>
            <ReactFlow
              className="workflow-canvas"
              nodes={normalizedCanvasNodes}
              edges={normalizedCanvasEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onDragOver={onCanvasDragOver}
              onDrop={onCanvasDrop}
              onPaneClick={() => setSelectedNode(null)}
              onInit={(instance) => {
                reactFlowRef.current = instance;
              }}
              nodeTypes={nodeTypes}
              defaultEdgeOptions={{ type: "smoothstep" }}
              fitView
              fitViewOptions={{ padding: 0.14, minZoom: 0.35, maxZoom: 1.1 }}
              minZoom={0.35}
              maxZoom={1.4}
              snapToGrid
              snapGrid={CANVAS_SNAP_GRID}
            >
              <MiniMap />
              <Controls />
              <Background
                variant={BackgroundVariant.Dots}
                gap={12}
                size={1}
                color="var(--workflow-canvas-dot-color)"
                bgColor="transparent"
              />
            </ReactFlow>
          </div>
        </section>

        {!isMobile ? (
          workspaceRailOpen ? (
            <aside className="w-[430px] shrink-0">
              <div className="app-panel sticky top-4 flex h-[calc(100vh-108px)] flex-col overflow-hidden rounded-3xl">
                <Tabs
                  value={workspaceRailTab}
                  onValueChange={(value) =>
                    setWorkspaceRailTab(value as "assistant" | "inspector")
                  }
                  className="flex h-full min-h-0 flex-col"
                >
                  <div className="flex items-center justify-between border-b border-border p-4 dark:bg-slate-950/40">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Workspace tools</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Switch between the builder assistant and the node inspector.
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setWorkspaceRailOpen(false)}
                    >
                      <PanelRightClose className="size-4" />
                    </Button>
                  </div>

                  <div className="border-b border-border px-4 py-3 dark:bg-slate-950/30">
                    <TabsList className="grid w-full grid-cols-2 dark:bg-slate-900/80">
                      <TabsTrigger value="assistant">Assistant</TabsTrigger>
                      <TabsTrigger value="inspector">Inspector</TabsTrigger>
                    </TabsList>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    <TabsContent value="assistant" className="mt-0">
                      <WorkflowAssistantPanel
                        prompt={builderPrompt}
                        onPromptChange={setBuilderPrompt}
                        onGenerate={onRequestClarifications}
                        onTranscript={(text) =>
                          setBuilderPrompt((prev) => (prev ? `${prev}\n${text}` : text))
                        }
                        assistantFiles={assistantFiles}
                        onAppendFiles={appendAssistantFiles}
                        onRemoveFile={removeAssistantFile}
                        onClearMemory={() => {
                          setBuilderMemory([]);
                          toast.success("Builder memory cleared.");
                        }}
                        loading={isGenerating}
                        statusText={statusText}
                        chatMessages={builderMessages}
                        memoryEntries={builderMemory}
                        executionPlan={executionPlan}
                        research={research}
                        onResearchChange={(index, value) =>
                          setResearch((prev) =>
                            prev.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, ...value } : item
                            )
                          )
                        }
                        onAddResearchPoint={() =>
                          setResearch((prev) => [
                            ...prev,
                            {
                              title: "New research point",
                              point: "",
                              whyItMatters: "",
                            },
                          ])
                        }
                        onRemoveResearchPoint={(index) =>
                          setResearch((prev) =>
                            prev.filter((_, itemIndex) => itemIndex !== index)
                          )
                        }
                        previewPrompts={previewPrompts}
                        onPreviewPromptChange={(index, value) =>
                          setPreviewPrompts((prev) =>
                            prev.map((item, itemIndex) =>
                              itemIndex === index ? value : item
                            )
                          )
                        }
                        onAddPreviewPrompt={() => setPreviewPrompts((prev) => [...prev, ""])}
                        onRemovePreviewPrompt={(index) =>
                          setPreviewPrompts((prev) =>
                            prev.filter((_, itemIndex) => itemIndex !== index)
                          )
                        }
                      />
                    </TabsContent>

                    <TabsContent value="inspector" className="mt-0">
                      <SettingPanel showPlaceholder={true} />
                    </TabsContent>
                  </div>
                </Tabs>
              </div>
            </aside>
          ) : (
            <div className="shrink-0" />
          )
        ) : null}
      </div>

      <Sheet open={blocksSheetOpen} onOpenChange={setBlocksSheetOpen}>
        <SheetContent side="left" className="w-[88vw] max-w-sm p-0 dark:border-slate-800 dark:bg-slate-950/95">
          <SheetHeader className="border-b border-border p-4 text-left dark:bg-slate-950/40">
            <SheetTitle>Workflow blocks</SheetTitle>
            <SheetDescription>
              Drag blocks onto the canvas or click to add them instantly.
            </SheetDescription>
          </SheetHeader>
          <div className="h-full overflow-y-auto p-4">
            <AgentToolsPanel onAddTool={addManualNodeToCanvas} />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={workspaceSheetOpen} onOpenChange={setWorkspaceSheetOpen}>
        <SheetContent side="right" className="w-[92vw] max-w-xl p-0 dark:border-slate-800 dark:bg-slate-950/95">
          <SheetHeader className="border-b border-border p-4 text-left dark:bg-slate-950/40">
            <SheetTitle>Workspace tools</SheetTitle>
            <SheetDescription>
              Switch between the builder assistant and the node inspector.
            </SheetDescription>
          </SheetHeader>
          <Tabs
            value={workspaceRailTab}
            onValueChange={(value) =>
              setWorkspaceRailTab(value as "assistant" | "inspector")
            }
            className="flex h-full min-h-0 flex-col"
          >
            <div className="border-b border-border px-4 py-3 dark:bg-slate-950/30">
              <TabsList className="grid w-full grid-cols-2 dark:bg-slate-900/80">
                <TabsTrigger value="assistant">Assistant</TabsTrigger>
                <TabsTrigger value="inspector">Inspector</TabsTrigger>
              </TabsList>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <TabsContent value="assistant" className="mt-0">
                <WorkflowAssistantPanel
                  prompt={builderPrompt}
                  onPromptChange={setBuilderPrompt}
                  onGenerate={onRequestClarifications}
                  onTranscript={(text) =>
                    setBuilderPrompt((prev) => (prev ? `${prev}\n${text}` : text))
                  }
                  assistantFiles={assistantFiles}
                  onAppendFiles={appendAssistantFiles}
                  onRemoveFile={removeAssistantFile}
                  onClearMemory={() => {
                    setBuilderMemory([]);
                    toast.success("Builder memory cleared.");
                  }}
                  loading={isGenerating}
                  statusText={statusText}
                  chatMessages={builderMessages}
                  memoryEntries={builderMemory}
                  executionPlan={executionPlan}
                  research={research}
                  onResearchChange={(index, value) =>
                    setResearch((prev) =>
                      prev.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, ...value } : item
                      )
                    )
                  }
                  onAddResearchPoint={() =>
                    setResearch((prev) => [
                      ...prev,
                      {
                        title: "New research point",
                        point: "",
                        whyItMatters: "",
                      },
                    ])
                  }
                  onRemoveResearchPoint={(index) =>
                    setResearch((prev) =>
                      prev.filter((_, itemIndex) => itemIndex !== index)
                    )
                  }
                  previewPrompts={previewPrompts}
                  onPreviewPromptChange={(index, value) =>
                    setPreviewPrompts((prev) =>
                      prev.map((item, itemIndex) =>
                        itemIndex === index ? value : item
                      )
                    )
                  }
                  onAddPreviewPrompt={() => setPreviewPrompts((prev) => [...prev, ""])}
                  onRemovePreviewPrompt={(index) =>
                    setPreviewPrompts((prev) =>
                      prev.filter((_, itemIndex) => itemIndex !== index)
                    )
                  }
                />
              </TabsContent>

              <TabsContent value="inspector" className="mt-0">
                <SettingPanel showPlaceholder={true} />
              </TabsContent>
            </div>
          </Tabs>
        </SheetContent>
      </Sheet>

      <BuilderClarificationDialog
        open={clarificationDialogOpen}
        questions={clarificationQuestions}
        values={clarificationValues}
        loading={isGenerating}
        onOpenChange={setClarificationDialogOpen}
        onValueChange={(questionId, value) =>
          setClarificationValues((prev) => ({ ...prev, [questionId]: value }))
        }
        onSubmit={() => void onGenerateWorkflow()}
      />

      <TrackerTopicIntakeDialog
        open={trackerTopicDialogOpen}
        loading={trackerTopicLoading}
        domainName={pendingTrackerTopicInsert?.tool.name || "Tracker block"}
        pack={trackerTopicPack}
        initialValues={trackerTopicInitialValues}
        onOpenChange={closeTrackerTopicDialog}
        onSubmit={submitTrackerTopicDialog}
      />

      <PublishCodeDialog
        openDialog={openCodeDialog}
        setOpenDialog={setOpenCodeDialog}
        agentId={agentDetail?.agentId}
      />
    </div>
  );
}

export default AgentBuilder;
