"use client";

import {
  GitBranch,
  Loader2Icon,
  Paperclip,
  PanelRightClose,
  RefreshCwIcon,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import VoiceRecorderButton from "@/app/agent-builder/_components/VoiceRecorderButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Agent } from "@/types/AgentType";
import type {
  PendingApprovalPayload,
  PendingFormPayload,
  RunSetup,
  RunSetupAnswer,
  WorkflowTraceItem,
} from "@/lib/runtime-types";

import PendingApprovalCard from "./PendingApprovalCard";
import PendingFormCard from "./PendingFormCard";
import PreviewPanel from "./PreviewPanel";
import PreviewRunSetupDialog from "./PreviewRunSetupDialog";
import ChatMemoryDrawer from "./ChatMemoryDrawer";

type ChatMessage = {
  role: string;
  content: string;
};

type Props = {
  GenerateAgentToolConfig: () => void | Promise<void>;
  loading: boolean;
  agentDetail: Agent;
  messages: ChatMessage[];
  loadingMsg: boolean;
  runStatus: string;
  currentNodeId: string | null;
  trace: WorkflowTraceItem[];
  runSetup?: RunSetup;
  rememberedUrl?: string;
  rememberedProfile?: string;
  setupCompleted: boolean;
  onSetupCompletedChange: (value: boolean) => void;
  setupPrefillValues: Record<string, string | string[]>;
  userInput: string;
  onUserInputChange: (value: string) => void;
  onTranscript: (value: string) => void;
  onSendMsg: () => void | Promise<void>;
  onStartRunSetup: (payload: {
    task: string;
    answers: RunSetupAnswer[];
    reusableMemoryBootstrap: Record<string, string | string[]>;
  }) => void;
  pendingForm: PendingFormPayload | null;
  pendingApproval: PendingApprovalPayload | null;
  onFormSubmit: (values: Record<string, string | string[]>) => void;
  onApprovalDecision: (decision: "approve" | "reject") => void;
  onCollapse?: () => void;
  memoryEntries?: Array<{ _id?: string; memoryKey: string; value: any; source?: string; updatedAt?: string }>;
  onSaveMemory?: (memoryKey: string, value: any) => Promise<void>;
};

function ChatUi({
  GenerateAgentToolConfig,
  loading,
  agentDetail,
  messages,
  loadingMsg,
  runStatus,
  currentNodeId,
  trace,
  runSetup,
  rememberedUrl,
  rememberedProfile,
  setupCompleted,
  onSetupCompletedChange,
  setupPrefillValues,
  userInput,
  onUserInputChange,
  onTranscript,
  onSendMsg,
  onStartRunSetup,
  pendingForm,
  pendingApproval,
  onFormSubmit,
  onApprovalDecision,
  onCollapse,
  memoryEntries = [],
  onSaveMemory,
}: Props) {
  const [setupDialogOpen, setSetupDialogOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; chars: number } | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, loadingMsg, pendingForm, pendingApproval]);

  useEffect(() => {
    if ((runSetup?.fields?.length || 0) > 0 && !setupCompleted && messages.length === 0) {
      setSetupDialogOpen(true);
    }
  }, [messages.length, runSetup?.fields?.length, setupCompleted]);

  const inputDisabled = Boolean(pendingForm || pendingApproval);

  const handleFileUpload = async (file: File) => {
    if (!onSaveMemory) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/workflow-context", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Upload failed.");
      await onSaveMemory("workflow_pdf_context", data.text);
      setUploadedFile({ name: file.name, chars: data.charCount });
      toast.success(`"${file.name}" added to workflow context (${data.charCount.toLocaleString()} chars).`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "File upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSend = () => {
    if ((runSetup?.fields?.length || 0) > 0 && !setupCompleted) {
      setSetupDialogOpen(true);
      return;
    }

    if (inputDisabled) {
      return;
    }

    void onSendMsg();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">{agentDetail?.name}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="bg-background">
              Local runtime
            </Badge>
            <Badge variant="outline" className="bg-background capitalize">
              {runStatus === "idle" ? "Ready" : runStatus.replaceAll("_", " ")}
            </Badge>
            {uploadedFile ? (
              <Badge
                variant="outline"
                className="cursor-pointer bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                title={`${uploadedFile.chars.toLocaleString()} chars loaded`}
              >
                <Paperclip className="mr-1 size-3" />
                {uploadedFile.name}
                <button
                  type="button"
                  className="ml-1 opacity-60 hover:opacity-100"
                  onClick={async () => {
                    if (onSaveMemory) await onSaveMemory("workflow_pdf_context", "");
                    setUploadedFile(null);
                    toast.success("Workflow context cleared.");
                  }}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(runSetup?.fields?.length || 0) > 0 ? (
            <Button variant="outline" onClick={() => setSetupDialogOpen(true)}>
              <Sparkles />
              Run setup
            </Button>
          ) : null}
          <Button onClick={GenerateAgentToolConfig} disabled={loading}>
            <RefreshCwIcon className={loading ? "animate-spin" : ""} />
            Reboot Agent
          </Button>
          {onCollapse ? (
            <Button variant="outline" size="icon" onClick={onCollapse}>
              <PanelRightClose className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-4">
        {(runSetup?.fields?.length || 0) > 0 && !setupCompleted && messages.length === 0 ? (
          <div className="mb-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4 text-sm text-cyan-900 dark:text-cyan-100">
            Run setup is ready. Fill the workflow inputs once, then the agent will
            start with enough context to execute instead of collecting the same
            details again in chat.
          </div>
        ) : null}

        {trace.length ? (
          <div className="mb-3">
            <PreviewPanel
              title="Workflow trace"
              description="See the latest executed nodes and which step is active right now."
              defaultOpen={true}
            >
              <div className="flex flex-wrap gap-2">
                {trace.slice(-6).map((item) => (
                  <Badge
                    key={`${item.nodeId}-${item.updatedAt}`}
                    variant="outline"
                    className={
                      item.nodeId === currentNodeId
                        ? "border-cyan-500 text-cyan-700 dark:text-cyan-200"
                        : ""
                    }
                    title={item.summary}
                  >
                    <GitBranch className="mr-1 size-3" />
                    {item.nodeName}: {item.status}
                  </Badge>
                ))}
              </div>
            </PreviewPanel>
          </div>
        ) : null}

        {/* Memory drawer — visible when memory entries exist */}
        {(memoryEntries.length > 0 || true) && onSaveMemory ? (
          <div className="mb-3">
            <ChatMemoryDrawer
              entries={memoryEntries}
              onSave={onSaveMemory}
            />
          </div>
        ) : null}

        <PreviewPanel
          title="Conversation"
          description="Chat with the workflow, submit forms, and approve steps."
          defaultOpen={true}
          className="flex min-h-0 flex-1 flex-col"
          contentClassName="flex min-h-0 flex-1 flex-col gap-3"
        >
          <div className="flex flex-1 flex-col space-y-3 overflow-y-auto rounded-2xl border border-border bg-muted/20 p-4">
            {messages.map((msg, index) => (
              <div
                className={`flex max-w-[88%] rounded-2xl px-4 py-3 shadow-sm ${
                  msg.role === "user"
                    ? "self-end bg-cyan-600 text-white"
                    : "self-start border border-border bg-card text-card-foreground"
                }`}
                key={`${msg.role}-${index}`}
              >
                <h2 className="whitespace-pre-wrap text-sm leading-6">{msg.content}</h2>
              </div>
            ))}

            {pendingForm ? (
              <PendingFormCard
                form={pendingForm}
                loading={loadingMsg}
                onSubmit={onFormSubmit}
              />
            ) : null}

            {pendingApproval ? (
              <PendingApprovalCard
                approval={pendingApproval}
                loading={loadingMsg}
                onDecision={onApprovalDecision}
              />
            ) : null}

            {loadingMsg ? (
              <div className="flex items-center justify-center p-4">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-cyan-500" />
                <span className="ml-2 text-muted-foreground">
                  Thinking, researching, and checking tools...
                </span>
              </div>
            ) : null}
            <div ref={messagesEndRef} />
          </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFileUpload(f);
              }}
            />
            <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2">
            <textarea
              value={userInput}
              onChange={(event) => onUserInputChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  handleSend();
                }
              }}
              placeholder={
                (runSetup?.fields?.length || 0) > 0 && !setupCompleted
                  ? "Open Run setup above to start this agent with the right context."
                  : inputDisabled
                    ? "Complete the pending workflow step above to continue."
                    : "Type your message here..."
              }
              disabled={loadingMsg}
              className="min-h-24 flex-1 resize-none rounded-xl border border-transparent bg-transparent px-3 py-2 text-foreground outline-none focus:border-border focus:ring-2 focus:ring-ring/50"
            />
            <Button
                variant="outline"
                size="icon"
                disabled={uploading || !onSaveMemory}
                title="Upload PDF or text file as workflow context"
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? <Loader2Icon className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
              </Button>
              <VoiceRecorderButton
              onTranscript={onTranscript}
              disabled={loadingMsg || inputDisabled}
            />
            <Button
              onClick={handleSend}
              disabled={loadingMsg || !userInput.trim().length || inputDisabled}
            >
              {loadingMsg ? <Loader2Icon className="animate-spin" /> : <Send />}
            </Button>
          </div>
        </PreviewPanel>
      </div>

      <PreviewRunSetupDialog
        agentName={agentDetail?.name || "Agent"}
        builderPrompt={agentDetail?.config?.builderPrompt}
        previewPrompts={Array.isArray(agentDetail?.config?.previewPrompts)
          ? agentDetail.config.previewPrompts
          : []}
        runSetup={runSetup}
        rememberedUrl={rememberedUrl}
        rememberedProfile={rememberedProfile}
        open={setupDialogOpen}
        loading={loadingMsg}
        initialTask={Array.isArray(agentDetail?.config?.previewPrompts)
          ? agentDetail.config.previewPrompts[0]
          : ""}
        initialValues={setupPrefillValues}
        onOpenChange={setSetupDialogOpen}
        onSubmit={(payload) => {
          onSetupCompletedChange(true);
          setSetupDialogOpen(false);
          onStartRunSetup(payload);
        }}
      />
    </div>
  );
}

export default ChatUi;
