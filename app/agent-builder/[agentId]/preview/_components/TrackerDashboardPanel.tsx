"use client";

import {
  AlertTriangle,
  Briefcase,
  CircleDollarSign,
  ClipboardList,
  HeartHandshake,
  Moon,
  Target,
  Zap,
  Dumbbell,
} from "lucide-react";

import type { TrackerDashboardMetricKey, TrackerDashboardModel } from "@/lib/runtime-types";

import { Badge } from "@/components/ui/badge";

import PreviewPanel from "./PreviewPanel";

type Props = {
  dashboard: TrackerDashboardModel;
};

const ICON_MAP: Record<TrackerDashboardMetricKey, any> = {
  sleep: Moon,
  energy: Zap,
  focus: Target,
  work: Briefcase,
  money: CircleDollarSign,
  friendsFamily: HeartHandshake,
  health: Dumbbell,
  littleJobs: ClipboardList,
};

function TrackerDashboardPanel({ dashboard }: Props) {
  if (!dashboard.ready) {
    return (
      <PreviewPanel
        title="Tracker dashboard"
        description="Run the timetable planner to populate the live daily metrics, suggestion, and schedule."
        defaultOpen={true}
      >
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-6">
          <h3 className="text-base font-semibold text-foreground">No timetable yet</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Start the workflow with the daily check-in, let the life-area blocks run,
            and then execute the timetable planner block. This dashboard will fill in
            automatically once the planner returns its JSON output.
          </p>
          {dashboard.metrics.some((metric) => metric.historyCount > 0) ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {dashboard.metrics
                .filter((metric) => metric.historyCount > 0)
                .map((metric) => (
                  <Badge key={metric.key} variant="outline" className="bg-background">
                    {metric.label}: {metric.historyCount} history updates
                  </Badge>
                ))}
            </div>
          ) : null}
        </div>
      </PreviewPanel>
    );
  }

  return (
    <div className="space-y-4">
      <PreviewPanel
        title="Tracker dashboard"
        description="Sleep, energy, focus, and the rest of the daily system in one live planning view."
        defaultOpen={true}
      >
        <div className="mb-4 flex flex-wrap gap-2">
          <Badge variant="outline" className="bg-background">
            Source:{" "}
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
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {dashboard.metrics.map((metric) => {
            const Icon = ICON_MAP[metric.key];

            return (
              <div
                key={metric.key}
                className="rounded-2xl border border-border bg-background/70 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-muted/60">
                      <Icon className="size-4 text-cyan-700" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{metric.label}</p>
                      <p className="text-xs text-muted-foreground">{metric.latestValue}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-background">
                    {metric.score ?? "--"}/10
                  </Badge>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {metric.historyCount > 0
                    ? `${metric.historyCount} saved memory updates`
                    : "No saved history yet"}
                </p>
              </div>
            );
          })}
        </div>
      </PreviewPanel>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <PreviewPanel
          title="Suggested next action"
          description="The single move the planner thinks matters most right now."
          defaultOpen={true}
        >
          <div className="rounded-2xl border border-border bg-background/70 p-4">
            <p className="text-base font-semibold text-foreground">
              {dashboard.suggestedAction || "No suggestion returned yet."}
            </p>
            {dashboard.changeSummary ? (
              <p className="mt-3 text-sm leading-6 text-foreground">
                Latest change: {dashboard.changeSummary}
              </p>
            ) : null}
            {dashboard.reasoning ? (
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {dashboard.reasoning}
              </p>
            ) : null}
          </div>

          {dashboard.warnings.length ? (
            <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
                <AlertTriangle className="size-4" />
                Watch-outs
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

          {dashboard.carryForward.length ? (
            <div className="mt-4 rounded-2xl border border-border bg-muted/20 p-4">
              <p className="text-sm font-medium text-foreground">Carry forward</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {dashboard.carryForward.map((item, index) => (
                  <Badge key={`${item}-${index}`} variant="outline" className="bg-background">
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </PreviewPanel>

        <PreviewPanel
          title="Today's timetable"
          description="The planner's suggested schedule based on today's check-in, history, and task load."
          defaultOpen={true}
        >
          {dashboard.todayPlan.length ? (
            <div className="space-y-3">
              {dashboard.todayPlan.map((item, index) => (
                <div
                  key={`${item.start}-${item.title}-${index}`}
                  className="rounded-2xl border border-border bg-background/70 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{item.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.start} - {item.end}
                      </p>
                    </div>
                    <Badge variant="outline" className="bg-background">
                      {item.category}
                    </Badge>
                  </div>
                  {item.reason ? (
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      {item.reason}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
              The planner did not return any timetable rows yet.
            </div>
          )}
        </PreviewPanel>
      </div>

      <PreviewPanel
        title="AI suggestions"
        description="Blocking factors, stress patterns, time leaks, and the highest-leverage decision."
        defaultOpen={true}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {[
            ["Blocking progress", dashboard.insights.progressBlocker],
            ["Stress habits", dashboard.insights.stressHabits],
            ["Time leaks", dashboard.insights.timeLeaks],
            ["Automate, defer, or remove", dashboard.insights.automateDeferRemove],
            ["Unlock decision", dashboard.insights.unlockDecision],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-2xl border border-border bg-background/70 p-4"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {label}
              </p>
              <p className="mt-3 text-sm leading-6 text-foreground">
                {String(value || "The planner did not return a suggestion yet.")}
              </p>
            </div>
          ))}
        </div>
      </PreviewPanel>
    </div>
  );
}

export default TrackerDashboardPanel;
