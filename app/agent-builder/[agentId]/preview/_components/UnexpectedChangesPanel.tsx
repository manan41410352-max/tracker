"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Loader2Icon, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  TrackerDashboardModel,
  TrackerUnexpectedChangeInput,
  TrackerUnexpectedChangeResponse,
} from "@/lib/runtime-types";
import {
  TRACKER_UNEXPECTED_CHANGE_FLEXIBILITY_OPTIONS,
  TRACKER_UNEXPECTED_CHANGE_IMPACT_OPTIONS,
  TRACKER_UNEXPECTED_CHANGE_TYPES,
} from "@/lib/tracker-workflow";

import PreviewPanel from "./PreviewPanel";

type Props = {
  agentId?: string;
  conversationId: string;
  dashboard: TrackerDashboardModel;
  onApplied?: () => void;
};

const INITIAL_CHANGE: TrackerUnexpectedChangeInput = {
  changeType: "meeting_rescheduled",
  itemTitle: "",
  originalTime: "",
  newTime: "",
  flexibility: "fixed",
  impact: "medium",
  notes: "",
};

function UnexpectedChangesPanel({
  agentId,
  conversationId,
  dashboard,
  onApplied,
}: Props) {
  const [change, setChange] = useState<TrackerUnexpectedChangeInput>(INITIAL_CHANGE);
  const [loading, setLoading] = useState(false);
  const [assistantMessage, setAssistantMessage] = useState("");

  const submitDisabled = useMemo(
    () =>
      loading ||
      !agentId ||
      !conversationId ||
      !dashboard.ready ||
      !String(change.itemTitle || "").trim(),
    [agentId, change.itemTitle, conversationId, dashboard.ready, loading]
  );

  const submitChange = async () => {
    if (submitDisabled) {
      return;
    }

    try {
      setLoading(true);
      const response = await fetch("/api/tracker/replan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentId,
          conversationId,
          change,
        }),
      });
      const payload = (await response.json()) as
        | TrackerUnexpectedChangeResponse
        | { error?: string };

      if (!response.ok) {
        throw new Error(payload && "error" in payload ? payload.error : "Unable to replan.");
      }

      const successPayload = payload as TrackerUnexpectedChangeResponse;
      setAssistantMessage(successPayload.assistantMessage);
      setChange((prev) => ({
        ...INITIAL_CHANGE,
        changeType: prev.changeType,
        flexibility: prev.flexibility,
        impact: prev.impact,
      }));
      toast.success("Tracker plan updated for the unexpected change.");
      onApplied?.();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update the tracker plan right now."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <PreviewPanel
        title="Unexpected changes"
        description="Tell the tracker about a real-world change and it will rewrite the day plan, warnings, and suggestions around it."
        defaultOpen={true}
      >
        {!dashboard.ready ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-5">
            <h3 className="text-base font-semibold text-foreground">
              No live timetable to update yet
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Run the tracker workflow once so the change assistant has an existing
              timetable, suggested action, and system signals to adapt instead of
              guessing from scratch.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="bg-background">
                Plan source:{" "}
                {dashboard.planSource === "change_assistant"
                  ? "Change assistant"
                  : "Workflow"}
              </Badge>
              {dashboard.lastUpdatedAt ? (
                <Badge variant="outline" className="bg-background">
                  Updated: {new Date(dashboard.lastUpdatedAt).toLocaleString()}
                </Badge>
              ) : null}
            </div>

            {(dashboard.changeSummary || dashboard.changeAssistantMessage || assistantMessage) ? (
              <div className="rounded-2xl border border-border bg-background/70 p-4">
                <p className="text-sm font-medium text-foreground">Latest adjustment</p>
                {dashboard.changeSummary ? (
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {dashboard.changeSummary}
                  </p>
                ) : null}
                {(assistantMessage || dashboard.changeAssistantMessage) ? (
                  <p className="mt-3 text-sm leading-6 text-foreground">
                    {assistantMessage || dashboard.changeAssistantMessage}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="change-type">Change type</Label>
                <select
                  id="change-type"
                  value={change.changeType}
                  onChange={(event) =>
                    setChange((prev) => ({
                      ...prev,
                      changeType: event.target.value as TrackerUnexpectedChangeInput["changeType"],
                    }))
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {TRACKER_UNEXPECTED_CHANGE_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="item-title">What changed?</Label>
                <Input
                  id="item-title"
                  value={change.itemTitle}
                  onChange={(event) =>
                    setChange((prev) => ({ ...prev, itemTitle: event.target.value }))
                  }
                  placeholder="Example: Client meeting with Priya"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="original-time">Original time</Label>
                <Input
                  id="original-time"
                  value={change.originalTime || ""}
                  onChange={(event) =>
                    setChange((prev) => ({ ...prev, originalTime: event.target.value }))
                  }
                  placeholder="4:00 PM"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-time">New time</Label>
                <Input
                  id="new-time"
                  value={change.newTime || ""}
                  onChange={(event) =>
                    setChange((prev) => ({ ...prev, newTime: event.target.value }))
                  }
                  placeholder="5:00 PM"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="flexibility">Flexibility</Label>
                <select
                  id="flexibility"
                  value={change.flexibility || "fixed"}
                  onChange={(event) =>
                    setChange((prev) => ({
                      ...prev,
                      flexibility:
                        event.target.value as TrackerUnexpectedChangeInput["flexibility"],
                    }))
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {TRACKER_UNEXPECTED_CHANGE_FLEXIBILITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="impact">Impact</Label>
                <select
                  id="impact"
                  value={change.impact || "medium"}
                  onChange={(event) =>
                    setChange((prev) => ({
                      ...prev,
                      impact: event.target.value as TrackerUnexpectedChangeInput["impact"],
                    }))
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {TRACKER_UNEXPECTED_CHANGE_IMPACT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="change-notes">Notes</Label>
              <Textarea
                id="change-notes"
                value={change.notes || ""}
                onChange={(event) =>
                  setChange((prev) => ({ ...prev, notes: event.target.value }))
                }
                placeholder="Anything the tracker should protect, move, or avoid because of this change."
                className="min-h-28"
              />
            </div>

            {dashboard.warnings.length ? (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
                  <AlertTriangle className="size-4" />
                  Current watch-outs
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {dashboard.warnings.map((warning, index) => (
                    <Badge key={`${warning}-${index}`} variant="outline" className="bg-background">
                      {warning}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-end">
              <Button onClick={() => void submitChange()} disabled={submitDisabled}>
                {loading ? <Loader2Icon className="animate-spin" /> : <Sparkles />}
                {loading ? "Replanning..." : "Update timetable"}
              </Button>
            </div>
          </div>
        )}
      </PreviewPanel>
    </div>
  );
}

export default UnexpectedChangesPanel;
