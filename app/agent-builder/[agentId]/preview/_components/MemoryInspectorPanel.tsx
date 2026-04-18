"use client";

import { useEffect, useMemo, useState } from "react";
import { DatabaseZap, History, PencilLine, Save } from "lucide-react";
import { toast } from "sonner";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import PreviewPanel from "./PreviewPanel";

type MemoryEntry = {
  _id?: string;
  memoryKey: string;
  value: any;
  source?: string;
  updatedAt?: string;
};

type MemoryEvent = {
  _id?: string;
  memoryKey: string;
  previousValue?: any;
  value: any;
  source?: string;
  changeKind?: string;
  updatedAt: string;
};

type Props = {
  entries?: MemoryEntry[];
  timeline?: MemoryEvent[];
  onSave: (memoryKey: string, value: any) => Promise<void>;
};

function formatValue(value: any) {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function parseEditorValue(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }

  const looksStructured =
    ["{", "[", "\""].some((prefix) => trimmed.startsWith(prefix)) ||
    ["true", "false", "null"].includes(trimmed) ||
    /^-?\d+(\.\d+)?$/.test(trimmed);

  if (!looksStructured) {
    return input;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return input;
  }
}

function formatDate(value?: string) {
  if (!value) {
    return "Unknown time";
  }

  const nextDate = new Date(value);
  if (Number.isNaN(nextDate.getTime())) {
    return value;
  }

  return nextDate.toLocaleString();
}

function MemoryInspectorPanel({
  entries = [],
  timeline = [],
  onSave,
}: Props) {
  const sortedEntries = useMemo(
    () =>
      [...entries].sort(
        (a, b) =>
          String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) ||
          String(a.memoryKey || "").localeCompare(String(b.memoryKey || ""))
      ),
    [entries]
  );
  const [selectedKey, setSelectedKey] = useState("");
  const [draftValue, setDraftValue] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedEntry = useMemo(
    () => sortedEntries.find((entry) => entry.memoryKey === selectedKey) || sortedEntries[0],
    [selectedKey, sortedEntries]
  );

  useEffect(() => {
    if (!selectedEntry) {
      setSelectedKey("");
      setDraftValue("");
      return;
    }

    setSelectedKey(selectedEntry.memoryKey);
    setDraftValue(formatValue(selectedEntry.value));
  }, [selectedEntry?._id, selectedEntry?.memoryKey, selectedEntry?.updatedAt]);

  return (
    <PreviewPanel
      title="Shared memory"
      description="Inspect persisted workflow memory, review timeline diffs, and edit values that every agent can reuse."
      defaultOpen={true}
    >
      <Tabs defaultValue="current">
        <TabsList>
          <TabsTrigger value="current">
            <DatabaseZap className="size-4" />
            Current
          </TabsTrigger>
          <TabsTrigger value="timeline">
            <History className="size-4" />
            Timeline
          </TabsTrigger>
        </TabsList>

        <TabsContent value="current" className="mt-3">
          {sortedEntries.length ? (
            <div className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
              <div className="rounded-2xl border border-border bg-muted/20 p-3">
                <p className="mb-3 text-sm font-medium text-foreground">
                  Memory keys
                </p>
                <div className="space-y-2">
                  {sortedEntries.map((entry) => (
                    <button
                      key={entry.memoryKey}
                      type="button"
                      onClick={() => {
                        setSelectedKey(entry.memoryKey);
                        setDraftValue(formatValue(entry.value));
                      }}
                      className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                        selectedEntry?.memoryKey === entry.memoryKey
                          ? "border-cyan-500 bg-cyan-500/10"
                          : "border-border bg-background hover:bg-accent"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {entry.memoryKey}
                        </span>
                        <Badge variant="outline" className="bg-background">
                          {entry.source || "memory"}
                        </Badge>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                        {formatValue(entry.value)}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {selectedEntry ? (
                <div className="space-y-3 rounded-2xl border border-border bg-background/70 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="bg-background">
                      {selectedEntry.memoryKey}
                    </Badge>
                    <Badge variant="outline" className="bg-background">
                      {selectedEntry.source || "memory"}
                    </Badge>
                    <Badge variant="outline" className="bg-background">
                      {formatDate(selectedEntry.updatedAt)}
                    </Badge>
                  </div>

                  <div className="rounded-2xl border border-border bg-muted/20 p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                      <PencilLine className="size-4 text-cyan-600" />
                      Edit value
                    </div>
                    <Textarea
                      value={draftValue}
                      onChange={(event) => setDraftValue(event.target.value)}
                      className="min-h-48 font-mono text-xs"
                    />
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <p className="text-xs text-muted-foreground">
                        JSON stays structured. Plain text is stored as a string.
                      </p>
                      <Button
                        onClick={async () => {
                          try {
                            setSaving(true);
                            await onSave(
                              selectedEntry.memoryKey,
                              parseEditorValue(draftValue)
                            );
                            toast.success(`Updated ${selectedEntry.memoryKey}.`);
                          } catch (error) {
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : "Unable to update memory."
                            );
                          } finally {
                            setSaving(false);
                          }
                        }}
                        disabled={saving}
                      >
                        <Save className="mr-1 size-4" />
                        {saving ? "Saving..." : "Save memory"}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-black/90 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
                      Current value
                    </p>
                    <pre className="max-h-56 overflow-auto whitespace-pre-wrap text-xs text-white/85">
                      {formatValue(selectedEntry.value)}
                    </pre>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
              Shared memory will appear here after the workflow stores reusable values.
            </div>
          )}
        </TabsContent>

        <TabsContent value="timeline" className="mt-3">
          {timeline.length ? (
            <ScrollArea className="h-[520px] rounded-2xl border border-border bg-muted/10 p-4">
              <Accordion type="single" collapsible className="space-y-3">
                {timeline.map((event, index) => (
                  <AccordionItem
                    key={event._id || `${event.memoryKey}-${event.updatedAt}-${index}`}
                    value={`${event.memoryKey}-${index}`}
                    className="rounded-2xl border border-border bg-background px-4"
                  >
                    <AccordionTrigger className="py-4 hover:no-underline">
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-left">
                        <Badge variant="outline" className="bg-background">
                          {event.memoryKey}
                        </Badge>
                        <Badge variant="outline" className="bg-background capitalize">
                          {event.changeKind || "update"}
                        </Badge>
                        <Badge variant="outline" className="bg-background">
                          {event.source || "memory"}
                        </Badge>
                        <span className="truncate text-sm text-muted-foreground">
                          {formatDate(event.updatedAt)}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-3 pt-0">
                      <div className="grid gap-3 lg:grid-cols-2">
                        <div className="rounded-2xl border border-border bg-muted/20 p-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Previous
                          </p>
                          <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs text-foreground">
                            {event.previousValue === undefined
                              ? "[No previous value]"
                              : formatValue(event.previousValue)}
                          </pre>
                        </div>
                        <div className="rounded-2xl border border-border bg-muted/20 p-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Current
                          </p>
                          <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs text-foreground">
                            {formatValue(event.value)}
                          </pre>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </ScrollArea>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
              Memory history will appear here after values change over time.
            </div>
          )}
        </TabsContent>
      </Tabs>
    </PreviewPanel>
  );
}

export default MemoryInspectorPanel;
