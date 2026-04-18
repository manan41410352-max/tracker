"use client";

import { useEffect, useState } from "react";
import { Brain, ChevronDown, ChevronUp, Pencil, Save, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type MemoryEntry = {
  _id?: string;
  memoryKey: string;
  value: any;
  source?: string;
  updatedAt?: string;
};

type Props = {
  entries: MemoryEntry[];
  onSave: (memoryKey: string, value: any) => Promise<void>;
};

function formatValue(value: any): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function parseEditorValue(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const looksStructured =
    ["{", "[", '"'].some((p) => trimmed.startsWith(p)) ||
    ["true", "false", "null"].includes(trimmed) ||
    /^-?\d+(\.\d+)?$/.test(trimmed);
  if (!looksStructured) return input;
  try {
    return JSON.parse(trimmed);
  } catch {
    return input;
  }
}

function MemoryItem({
  entry,
  onSave,
}: {
  entry: MemoryEntry;
  onSave: (key: string, val: any) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(formatValue(entry.value));
  const [saving, setSaving] = useState(false);

  // Keep draft in sync when the entry updates externally
  useEffect(() => {
    if (!editing) setDraft(formatValue(entry.value));
  }, [entry.value, editing]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await onSave(entry.memoryKey, parseEditorValue(draft));
      toast.success(`${entry.memoryKey} saved.`);
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to save memory.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm transition-colors hover:border-cyan-500/40">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-cyan-700 dark:text-cyan-300">
            {entry.memoryKey}
          </p>
          {editing ? (
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="mt-1.5 min-h-20 font-mono text-xs"
              autoFocus
            />
          ) : (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {formatValue(entry.value) || "—"}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1 pt-0.5">
          {editing ? (
            <>
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                onClick={handleSave}
                disabled={saving}
                title="Save"
              >
                <Save className="size-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                onClick={() => {
                  setEditing(false);
                  setDraft(formatValue(entry.value));
                }}
                title="Cancel"
              >
                <X className="size-3" />
              </Button>
            </>
          ) : (
            <Button
              size="icon"
              variant="ghost"
              className="size-6"
              onClick={() => setEditing(true)}
              title="Edit"
            >
              <Pencil className="size-3" />
            </Button>
          )}
        </div>
      </div>
      {entry.source && !editing && (
        <p className="mt-1 text-[10px] text-muted-foreground/60">{entry.source}</p>
      )}
    </div>
  );
}

export function ChatMemoryDrawer({ entries, onSave }: Props) {
  const [open, setOpen] = useState(false);

  const sorted = [...entries].sort(
    (a, b) =>
      String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")) ||
      String(a.memoryKey).localeCompare(String(b.memoryKey))
  );

  return (
    <div className="rounded-2xl border border-border bg-muted/30">
      {/* Header toggle */}
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <Brain className="size-4 text-cyan-600" />
          <span className="text-sm font-semibold text-foreground">Agent memory</span>
          {entries.length > 0 && (
            <Badge variant="outline" className="bg-background text-xs">
              {entries.length} keys
            </Badge>
          )}
        </div>
        {open ? (
          <ChevronUp className="size-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 text-muted-foreground" />
        )}
      </button>

      {/* Collapsible body */}
      {open && (
        <div className="border-t border-border px-3 pb-3 pt-2">
          {sorted.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No memory stored yet. Run the workflow to populate it.
            </p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {sorted.map((entry) => (
                <MemoryItem
                  key={entry.memoryKey}
                  entry={entry}
                  onSave={onSave}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ChatMemoryDrawer;
