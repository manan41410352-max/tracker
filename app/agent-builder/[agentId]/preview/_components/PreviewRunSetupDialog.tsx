"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2Icon, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import type { RunSetup, RunSetupAnswer } from "@/lib/runtime-types";

type Props = {
  agentName: string;
  builderPrompt?: string;
  previewPrompts?: string[];
  runSetup?: RunSetup;
  rememberedUrl?: string;
  rememberedProfile?: string;
  open: boolean;
  loading: boolean;
  initialTask?: string;
  initialValues?: Record<string, string | string[]>;
  onOpenChange: (value: boolean) => void;
  onSubmit: (payload: {
    task: string;
    answers: RunSetupAnswer[];
    reusableMemoryBootstrap: Record<string, string | string[]>;
  }) => void;
};

function PreviewRunSetupDialog({
  agentName,
  builderPrompt,
  previewPrompts = [],
  runSetup,
  rememberedUrl,
  rememberedProfile,
  open,
  loading,
  initialTask,
  initialValues = {},
  onOpenChange,
  onSubmit,
}: Props) {
  const [task, setTask] = useState("");
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [rememberedUrlValue, setRememberedUrlValue] = useState("");
  const [rememberedProfileValue, setRememberedProfileValue] = useState("automation");
  const [timetableImage, setTimetableImage] = useState<File | null>(null);
  const [fitbitImage, setFitbitImage] = useState<File | null>(null);
  const [visualIntakeLoading, setVisualIntakeLoading] = useState(false);
  const [visualMemoryBootstrap, setVisualMemoryBootstrap] = useState<
    Record<string, string | string[]>
  >({});
  const [visualNotes, setVisualNotes] = useState<string[]>([]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setTask(initialTask || previewPrompts[0] || "");
    setAnswers(
      Object.fromEntries(
        (runSetup?.fields || []).map((field) => [
          field.id,
          initialValues[field.id] ??
            (field.memoryKey ? initialValues[field.memoryKey] : undefined) ??
            (field.type === "multi-select" ? [] : ""),
        ])
      )
    );
    setRememberedUrlValue(rememberedUrl || "");
    setRememberedProfileValue(rememberedProfile || "automation");
    setTimetableImage(null);
    setFitbitImage(null);
    setVisualIntakeLoading(false);
    setVisualMemoryBootstrap({});
    setVisualNotes([]);
  }, [
    initialTask,
    initialValues,
    open,
    previewPrompts,
    rememberedProfile,
    rememberedUrl,
    runSetup?.fields,
  ]);

  const missingRequired = useMemo(
    () =>
      (runSetup?.fields || []).some((field) => {
        const value = answers[field.id];
        if (!field.required) {
          return false;
        }

        if (Array.isArray(value)) {
          return value.length === 0;
        }

        return !String(value || "").trim();
      }),
    [answers, runSetup?.fields]
  );
  const trackerVisualMode = useMemo(
    () =>
      (runSetup?.fields || []).some((field) =>
        [
          "sleep_hours",
          "energy_level",
          "focus_level",
          "health_state",
          "existing_timetable_notes",
          "fitbit_health_notes",
        ].includes(field.memoryKey || field.id)
      ),
    [runSetup?.fields]
  );

  const runVisualIntake = async () => {
    if (!timetableImage && !fitbitImage) {
      return;
    }

    setVisualIntakeLoading(true);

    try {
      const payload = new FormData();
      if (timetableImage) {
        payload.append("timetableImage", timetableImage);
      }
      if (fitbitImage) {
        payload.append("fitbitImage", fitbitImage);
      }
      payload.append("task", task);
      payload.append(
        "fields",
        JSON.stringify(
          (runSetup?.fields || []).map((field) => ({
            id: field.id,
            label: field.label,
            type: field.type,
            options: field.options,
            memoryKey: field.memoryKey,
          }))
        )
      );
      payload.append(
        "answers",
        JSON.stringify(
          Object.fromEntries(
            Object.entries(answers).map(([key, value]) => [
              key,
              Array.isArray(value) ? value.join(", ") : String(value || ""),
            ])
          )
        )
      );

      const response = await fetch("/api/tracker/analyze-image", {
        method: "POST",
        body: payload,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Visual intake failed.");
      }

      setAnswers((prev) => ({
        ...prev,
        ...Object.fromEntries(
          Object.entries(data?.fills || {})
            .filter(([key]) => {
              const currentValue = prev[key];

              if (Array.isArray(currentValue)) {
                return currentValue.length === 0;
              }

              return !String(currentValue || "").trim();
            })
            .map(([key, value]) => [key, String(value || "")])
        ),
      }));
      setVisualMemoryBootstrap(
        Object.fromEntries(
          Object.entries(data?.reusableMemoryBootstrap || {}).map(([key, value]) => [
            key,
            Array.isArray(value) ? value.map((item) => String(item || "")) : String(value || ""),
          ])
        )
      );
      setVisualNotes(
        Array.isArray(data?.notes)
          ? data.notes.map((item: unknown) => String(item || "")).filter(Boolean)
          : []
      );
    } catch (error) {
      console.error(error);
      setVisualNotes([
        error instanceof Error ? error.message : "Visual intake could not analyze the images.",
      ]);
    } finally {
      setVisualIntakeLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl border-border bg-card">
        <DialogHeader>
          <DialogTitle className="text-foreground">Prepare {agentName}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {runSetup?.description ||
              "Collect the required details once, then let the workflow execute without asking the same questions again."}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[72vh] pr-4">
          <div className="space-y-5">
            <div className="space-y-3 rounded-2xl border border-border bg-muted/40 p-4">
              <Label>Task to run</Label>
              <Textarea
                value={task}
                onChange={(event) => setTask(event.target.value)}
                placeholder="Tell the agent exactly what you want it to accomplish."
                className="min-h-28"
              />
              {previewPrompts.length ? (
                <div className="flex flex-wrap gap-2">
                  {previewPrompts.slice(0, 6).map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setTask(prompt)}
                      className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              ) : null}
              {builderPrompt ? (
                <p className="text-sm text-muted-foreground">
                  Builder context: {builderPrompt}
                </p>
              ) : null}
            </div>

            <details className="rounded-2xl border border-border bg-muted/20 p-4">
              <summary className="cursor-pointer list-none text-sm font-medium text-foreground">
                Advanced browser overrides
              </summary>
              <div className="mt-3 space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="remembered-preview-url">Site override (optional)</Label>
                  <p className="text-sm text-muted-foreground">
                    Leave this blank and the workflow will find the best starting site from your task automatically. Add a URL only when you want to force a specific site for this run.
                  </p>
                </div>
                <Input
                  id="remembered-preview-url"
                  type="url"
                  value={rememberedUrlValue}
                  onChange={(event) => setRememberedUrlValue(event.target.value)}
                  placeholder="https://example.com"
                />
              </div>
            </details>

            <div className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
              <div className="space-y-1">
                <Label>Browser session mode</Label>
                <p className="text-sm text-muted-foreground">
                  Choose which Brave session mode should be used when preview browser tasks run.
                </p>
              </div>
              <RadioGroup
                value={rememberedProfileValue}
                onValueChange={setRememberedProfileValue}
                className="gap-3"
              >
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-background px-3 py-3 text-sm text-foreground">
                  <RadioGroupItem value="user" />
                  <span>Signed-in user session</span>
                </label>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-background px-3 py-3 text-sm text-foreground">
                  <RadioGroupItem value="automation" />
                  <span>Automation profile</span>
                </label>
              </RadioGroup>
            </div>

            {trackerVisualMode ? (
              <div className="space-y-4 rounded-2xl border border-border bg-muted/20 p-4">
                <div className="space-y-1">
                  <Label>Visual intake</Label>
                  <p className="text-sm text-muted-foreground">
                    Add an existing timetable screenshot or a Fitbit dashboard screenshot
                    and the tracker will extract useful details to prefill the planning
                    questions.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="timetable-image">Existing timetable image</Label>
                    <Input
                      id="timetable-image"
                      type="file"
                      accept="image/*"
                      onChange={(event) =>
                        setTimetableImage(event.target.files?.[0] || null)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fitbit-image">Fitbit image</Label>
                    <Input
                      id="fitbit-image"
                      type="file"
                      accept="image/*"
                      onChange={(event) =>
                        setFitbitImage(event.target.files?.[0] || null)
                      }
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void runVisualIntake()}
                    disabled={visualIntakeLoading || (!timetableImage && !fitbitImage)}
                  >
                    {visualIntakeLoading ? (
                      <Loader2Icon className="animate-spin" />
                    ) : (
                      <Sparkles />
                    )}
                    {visualIntakeLoading ? "Analyzing..." : "Analyze images"}
                  </Button>
                  {visualNotes.length ? (
                    <div className="space-y-1 text-sm text-muted-foreground">
                      {visualNotes.map((note) => (
                        <p key={note}>{note}</p>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {(runSetup?.fields || []).map((field, index) => (
              <div
                key={field.id}
                className="space-y-3 rounded-2xl border border-border bg-background/60 p-4"
              >
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Required detail {index + 1}
                  </p>
                  <p className="text-sm font-medium text-foreground">{field.label}</p>
                  <p className="text-sm text-muted-foreground">
                    {field.description ||
                      field.placeholder ||
                      "Provide this before the workflow starts."}
                  </p>
                </div>

                {field.type === "single-select" && field.options.length ? (
                  <RadioGroup
                    value={String(answers[field.id] || "")}
                    onValueChange={(value) =>
                      setAnswers((prev) => ({ ...prev, [field.id]: value }))
                    }
                    className="gap-3"
                  >
                    {field.options.map((option) => (
                      <label
                        key={option}
                        className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-muted/30 px-3 py-3 text-sm text-foreground"
                      >
                        <RadioGroupItem value={option} />
                        <span>{option}</span>
                      </label>
                    ))}
                  </RadioGroup>
                ) : field.type === "long-text" || field.type === "multi-select" ? (
                  <Textarea
                    value={
                      Array.isArray(answers[field.id])
                        ? (answers[field.id] as string[]).join(", ")
                        : String(answers[field.id] || "")
                    }
                    onChange={(event) =>
                      setAnswers((prev) => ({
                        ...prev,
                        [field.id]:
                          field.type === "multi-select"
                            ? event.target.value
                                .split(",")
                                .map((item) => item.trim())
                                .filter(Boolean)
                            : event.target.value,
                      }))
                    }
                    placeholder={
                      field.placeholder ||
                      (field.type === "multi-select"
                        ? "Comma-separated values"
                        : "Enter the required detail")
                    }
                    className="min-h-28"
                  />
                ) : (
                  <Input
                    type={field.type === "number" ? "number" : field.type === "url" ? "url" : "text"}
                    value={String(answers[field.id] || "")}
                    onChange={(event) =>
                      setAnswers((prev) => ({
                        ...prev,
                        [field.id]: event.target.value,
                      }))
                    }
                    placeholder={field.placeholder || "Enter the required detail"}
                  />
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">
            The workflow will hydrate these values into run state and reusable memory
            before the first node executes.
          </p>
          <Button
            onClick={() =>
              onSubmit({
                task,
                answers: (runSetup?.fields || []).map((field) => ({
                  id: field.id,
                  value: answers[field.id] || (field.type === "multi-select" ? [] : ""),
                  memoryKey: field.memoryKey,
                })),
                reusableMemoryBootstrap: Object.fromEntries(
                  [
                    ...(runSetup?.fields || [])
                      .filter((field) => field.memoryKey)
                      .map((field) => [field.memoryKey as string, answers[field.id]]),
                    ...(rememberedUrlValue.trim()
                      ? [["preview_default_url", rememberedUrlValue.trim()]]
                      : []),
                    ...(rememberedProfileValue.trim()
                      ? [["preview_browser_profile", rememberedProfileValue.trim()]]
                      : []),
                    ...Object.entries(visualMemoryBootstrap),
                  ].filter(([, value]) =>
                      Array.isArray(value) ? value.length > 0 : Boolean(String(value || "").trim())
                    )
                ),
              })
            }
            disabled={loading || !task.trim() || missingRequired}
          >
            {loading ? <Loader2Icon className="animate-spin" /> : <Sparkles />}
            {loading ? "Starting..." : "Start agent"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PreviewRunSetupDialog;
