"use client";

import {
  Bot,
  BrainCircuit,
  DatabaseZap,
  Globe2,
  Loader2Icon,
  MessageSquareText,
  Plus,
  Sparkles,
  TestTube2,
  Trash2,
  Workflow,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  BuilderChatMessage,
  BuilderMemoryEntry,
  BuilderResearchPoint,
} from "@/lib/agent-builder";

import VoiceRecorderButton from "./VoiceRecorderButton";

type Props = {
  prompt: string;
  onPromptChange: (value: string) => void;
  onGenerate: () => void;
  onTranscript: (text: string) => void;
  assistantFiles: File[];
  onAppendFiles: (files: FileList | File[]) => void;
  onRemoveFile: (index: number) => void;
  onClearMemory: () => void;
  loading: boolean;
  statusText?: string;
  chatMessages: BuilderChatMessage[];
  memoryEntries: BuilderMemoryEntry[];
  executionPlan: string[];
  research: BuilderResearchPoint[];
  onResearchChange: (
    index: number,
    value: Partial<BuilderResearchPoint>
  ) => void;
  onAddResearchPoint: () => void;
  onRemoveResearchPoint: (index: number) => void;
  previewPrompts: string[];
  onPreviewPromptChange: (index: number, value: string) => void;
  onAddPreviewPrompt: () => void;
  onRemovePreviewPrompt: (index: number) => void;
};

function WorkflowAssistantPanel({
  prompt,
  onPromptChange,
  onGenerate,
  onTranscript,
  assistantFiles,
  onAppendFiles,
  onRemoveFile,
  onClearMemory,
  loading,
  statusText,
  chatMessages,
  memoryEntries,
  executionPlan,
  research,
  onResearchChange,
  onAddResearchPoint,
  onRemoveResearchPoint,
  previewPrompts,
  onPreviewPromptChange,
  onAddPreviewPrompt,
  onRemovePreviewPrompt,
}: Props) {
  return (
    <div className="w-full overflow-hidden rounded-[28px] border border-border bg-card/95 shadow-sm dark:border-slate-800/80 dark:bg-slate-950/70 dark:shadow-black/20">
      <div className="border-b border-border bg-[linear-gradient(135deg,rgba(8,47,73,0.06),rgba(16,185,129,0.06))] p-5 dark:bg-[linear-gradient(135deg,rgba(14,116,144,0.16),rgba(15,23,42,0.78),rgba(6,182,212,0.08))]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-cyan-500/10 text-cyan-700 hover:bg-cyan-500/10 dark:text-cyan-200">
                ChatGPT workflow builder
              </Badge>
              <Badge variant="outline" className="bg-background/80 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200">
                Proxy-backed drafting
              </Badge>
            </div>
            <h2 className="mt-3 text-lg font-semibold text-foreground">
              Brief the builder like a teammate
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Start rough. The builder uses the ChatGPT proxy for follow-up
              questions, research synthesis, workflow drafting, and runtime-config
              shaping while keeping everything editable on the canvas.
            </p>
          </div>
          <div className="flex size-12 items-center justify-center rounded-2xl bg-foreground text-background shadow-sm dark:bg-slate-100/10 dark:text-slate-100 dark:shadow-black/15">
            <Workflow className="size-5" />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-border bg-background/75 p-3 dark:border-slate-800 dark:bg-slate-900/80">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Memory
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {memoryEntries.length}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-background/75 p-3 dark:border-slate-800 dark:bg-slate-900/80">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Research
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {research.length}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-background/75 p-3 dark:border-slate-800 dark:bg-slate-900/80">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Plan steps
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {executionPlan.length}
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="chat" className="p-4">
        <TabsList className="grid w-full grid-cols-4 dark:bg-slate-900/80">
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="research">Research</TabsTrigger>
          <TabsTrigger value="memory">Memory</TabsTrigger>
          <TabsTrigger value="tests">Tests</TabsTrigger>
        </TabsList>

        <ScrollArea className="mt-4 h-[440px]">
          <TabsContent value="chat" className="space-y-4">
            <div className="rounded-2xl border border-border bg-muted/20 p-4 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <MessageSquareText className="size-4 text-cyan-700" />
                Builder chat
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Use this like a chatbot. Describe what you want, answer the popup
                questions, then let the ChatGPT-backed builder research and wire the
                workflow. For browsing jobs, describe the end result and the site or
                app context, and the first workflow block will choose the start site
                automatically. You can also use it for planning, decision support,
                automation, creative collaboration, and real-world task workflows.
              </p>
            </div>

            {statusText ? (
              <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-900 dark:bg-cyan-500/8 dark:text-cyan-100">
                {statusText}
              </div>
            ) : null}

            {chatMessages.length ? (
              <div className="space-y-3">
                {chatMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                        message.role === "user"
                          ? "bg-cyan-600 text-white dark:bg-cyan-500/85"
                          : "border border-border bg-background text-foreground dark:border-slate-800 dark:bg-slate-900/80"
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground dark:border-slate-800 dark:bg-slate-900/40">
                Start with a rough idea like: build an agent that researches a target,
                asks for missing details, makes a plan, then automates the public-web
                steps with browser support.
              </div>
            )}
          </TabsContent>

          <TabsContent value="research" className="space-y-4">
            <div className="rounded-2xl border border-border bg-muted/20 p-4 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Bot className="size-4 text-cyan-700" />
                Execution plan
              </div>
              {executionPlan.length ? (
                <div className="mt-3 space-y-2">
                  {executionPlan.map((step, index) => (
                    <div
                      key={`${step}-${index}`}
                      className="rounded-2xl border border-border bg-background/70 px-4 py-3 text-sm leading-6 text-foreground dark:border-slate-800 dark:bg-slate-900/80"
                    >
                      {step}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  The builder will list the workflow plan here after it finishes
                  researching.
                </p>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <BrainCircuit className="size-4 text-cyan-700" />
                  Research notes
                </div>
                <Button type="button" size="sm" variant="outline" onClick={onAddResearchPoint}>
                  <Plus className="size-4" />
                  Add point
                </Button>
              </div>

              {research.length ? (
                research.map((item, index) => (
                  <div
                    key={`research-${index}`}
                    className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4 dark:border-slate-800 dark:bg-slate-900/55"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Point {index + 1}
                      </p>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => onRemoveResearchPoint(index)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <Input
                      value={item.title}
                      onChange={(event) =>
                        onResearchChange(index, { title: event.target.value })
                      }
                      placeholder="Research point title"
                    />
                    <Textarea
                      value={item.point}
                      onChange={(event) =>
                        onResearchChange(index, { point: event.target.value })
                      }
                      placeholder="What did the agent learn here?"
                      className="min-h-24"
                    />
                    <Input
                      value={item.whyItMatters || ""}
                      onChange={(event) =>
                        onResearchChange(index, { whyItMatters: event.target.value })
                      }
                      placeholder="Why this matters for the workflow"
                    />
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground dark:border-slate-800 dark:bg-slate-900/40">
                  Research notes will appear here, and you can edit them afterward.
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="memory" className="space-y-4">
            <div className="rounded-2xl border border-border bg-muted/20 p-4 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Globe2 className="size-4 text-cyan-700" />
                Runtime capabilities
              </div>
              <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                <p>Web research is available through `web_research`, `internet_search`, and `fetch_webpage`.</p>
                <p>Browser automation is available through `browser_visit`, `browser_task`, and the shared preview browser workspace.</p>
                <p>`chatgpt_browser` is available as a slow last-resort fallback through your Brave session when local recovery is exhausted.</p>
                <p>Manual takeover is reserved for login, payment, CAPTCHA, OTP, or other protected steps.</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <DatabaseZap className="size-4 text-cyan-700" />
                  Builder memory
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onClearMemory}
                  disabled={!memoryEntries.length}
                >
                  Clear memory
                </Button>
              </div>

              {memoryEntries.length ? (
                <div className="space-y-3">
                  {memoryEntries.map((entry) => (
                    <div
                      key={entry.key}
                      className="rounded-2xl border border-border bg-background/70 p-4 dark:border-slate-800 dark:bg-slate-900/80"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-foreground">{entry.label}</p>
                        <Badge variant="outline" className="bg-background dark:border-slate-700 dark:bg-slate-950/80 dark:text-slate-300">
                          {entry.key}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {entry.value}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground dark:border-slate-800 dark:bg-slate-900/40">
                  Follow-up answers are saved here so future builder revisions stay
                  closer to what you want.
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="tests" className="space-y-4">
            <div className="rounded-2xl border border-border bg-muted/20 p-4 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <TestTube2 className="size-4 text-cyan-700" />
                Preview prompts
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Keep a few realistic prompts here so preview mode already knows how
                you want to test the workflow.
              </p>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium text-foreground">Saved test prompts</div>
              <Button type="button" size="sm" variant="outline" onClick={onAddPreviewPrompt}>
                <Plus className="size-4" />
                Add prompt
              </Button>
            </div>

            {previewPrompts.length ? (
              <div className="space-y-3">
                {previewPrompts.map((promptItem, index) => (
                  <div
                    key={`preview-${index}`}
                    className="space-y-2 rounded-2xl border border-border bg-background/70 p-3 dark:border-slate-800 dark:bg-slate-900/80"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Test prompt {index + 1}
                      </p>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => onRemovePreviewPrompt(index)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <Textarea
                      value={promptItem}
                      onChange={(event) =>
                        onPreviewPromptChange(index, event.target.value)
                      }
                      placeholder="Add a realistic task to test in preview"
                      className="min-h-20"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm leading-6 text-muted-foreground dark:border-slate-800 dark:bg-slate-900/40">
                Add a few prompts so you can validate research, browser automation,
                and final output quickly.
              </div>
            )}
          </TabsContent>
        </ScrollArea>
      </Tabs>

      <div className="border-t border-border bg-background/80 p-4 dark:bg-slate-950/50">
        <div className="mb-3 space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Assistant files</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Upload multiple files like calendars, class schedules, bank statements,
                health plans, or screenshots. The local Qwen extractor will analyze
                them and the ChatGPT proxy will use them to ask smarter questions.
              </p>
            </div>
            <Badge variant="outline" className="bg-background">
              {assistantFiles.length} file{assistantFiles.length === 1 ? "" : "s"}
            </Badge>
          </div>

          <Input
            type="file"
            multiple
            onChange={(event) => {
              if (event.target.files?.length) {
                onAppendFiles(event.target.files);
                event.target.value = "";
              }
            }}
          />

          {assistantFiles.length ? (
            <div className="flex flex-wrap gap-2">
              {assistantFiles.map((file, index) => (
                <div
                  key={`${file.name}-${file.size}-${index}`}
                  className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground"
                >
                  <span className="max-w-[220px] truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveFile(index)}
                    className="text-muted-foreground transition-colors hover:text-destructive"
                    aria-label={`Remove ${file.name}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <Textarea
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder="Tell me about your day, week, or month, attach the supporting files, and I will use the ChatGPT proxy plus local Qwen extraction to shape the workflow."
          className="min-h-28 resize-y"
        />
        <div className="mt-3 flex items-center gap-2">
          <VoiceRecorderButton onTranscript={onTranscript} disabled={loading} />
          <Button
            className="flex-1"
            onClick={onGenerate}
            disabled={loading || !prompt.trim()}
          >
            {loading ? <Loader2Icon className="animate-spin" /> : <Sparkles />}
            {loading ? "Working..." : "Chat, question, and build"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default WorkflowAssistantPanel;
