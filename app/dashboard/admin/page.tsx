"use client";

import { useQuery } from "convex/react";
import { Database, FolderKanban, Users, Workflow } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api } from "@/convex/_generated/api";

const totalCards = [
  {
    key: "userCount",
    label: "People",
    icon: Users,
  },
  {
    key: "playerCount",
    label: "Player systems",
    icon: FolderKanban,
  },
  {
    key: "runCount",
    label: "Workflow runs",
    icon: Workflow,
  },
  {
    key: "memoryCount",
    label: "Memory records",
    icon: Database,
  },
] as const;

function AdminDashboardPage() {
  const overview = useQuery(api.workflow.GetAdminWorkspaceOverview, {});

  return (
    <div className="space-y-6">
      <Card className="app-hero-card rounded-[2rem]">
        <CardHeader className="space-y-4">
          <Badge className="app-chip w-fit rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-sky-700 hover:bg-transparent dark:text-sky-200">
            Admin workspace
          </Badge>
          <div className="space-y-2">
            <CardTitle className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
              Admin view of every tracked person
            </CardTitle>
            <CardDescription className="max-w-3xl leading-7">
              Review all available people, player systems, workflow runs, and reusable
              memory from one place.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {totalCards.map((item) => (
          <Card key={item.key} className="app-metric-card rounded-[1.6rem]">
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    {item.label}
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-foreground">
                    {overview?.totals?.[item.key] ?? "—"}
                  </p>
                </div>
                <div className="flex size-11 items-center justify-center rounded-2xl bg-white/75 text-sky-700 shadow-sm dark:bg-slate-950/80 dark:text-sky-200">
                  <item.icon className="size-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="app-panel rounded-[2rem]">
          <CardHeader>
            <CardTitle className="text-2xl">People</CardTitle>
            <CardDescription>
              Every person currently available in the workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(overview?.users || []).map((user: any) => (
              <div
                key={String(user._id)}
                className="rounded-[1.4rem] border border-border bg-background/70 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{user.name}</p>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  </div>
                  <Badge variant="outline" className="rounded-full bg-background/80">
                    {user.agentCount} systems
                  </Badge>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-2xl border border-border bg-background/80 px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      Runs
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {user.runCount}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background/80 px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      Completed
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {user.completedRunCount}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background/80 px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      Memory
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {user.memoryCount}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="app-panel rounded-[2rem]">
          <CardHeader>
            <CardTitle className="text-2xl">Player systems</CardTitle>
            <CardDescription>
              Current workflow and metric snapshots for every player system.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(overview?.players || []).map((player: any) => (
              <div
                key={player.agentId}
                className="rounded-[1.4rem] border border-border bg-background/70 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{player.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {player.userName} • {player.userEmail || "local workspace"}
                    </p>
                  </div>
                  <Badge variant="outline" className="rounded-full bg-background/80">
                    {player.latestRunStatus}
                  </Badge>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge className="app-chip rounded-full px-3 py-1 text-[11px] text-slate-700 hover:bg-transparent dark:text-slate-200">
                    {player.nodeCount} nodes
                  </Badge>
                  <Badge className="app-chip rounded-full px-3 py-1 text-[11px] text-sky-700 hover:bg-transparent dark:text-sky-200">
                    {player.dailyCompletedCount} daily completions
                  </Badge>
                  <Badge className="app-chip rounded-full px-3 py-1 text-[11px] text-emerald-700 hover:bg-transparent dark:text-emerald-200">
                    {player.weeklyCompletedCount} weekly completions
                  </Badge>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {(player.workflowBlocks || []).slice(0, 8).map((block: string) => (
                    <Badge
                      key={`${player.agentId}-${block}`}
                      variant="outline"
                      className="rounded-full bg-background/80 text-xs"
                    >
                      {block}
                    </Badge>
                  ))}
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-4">
                  {Object.entries(player.latestMetrics || {}).map(([key, value]) => (
                    <div
                      key={`${player.agentId}-${key}`}
                      className="rounded-2xl border border-border bg-background/80 px-3 py-3"
                    >
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        {key}
                      </p>
                      <p className="mt-1 text-sm font-medium text-foreground">
                        {value === null || value === undefined || value === ""
                          ? "No data"
                          : String(value)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default AdminDashboardPage;
