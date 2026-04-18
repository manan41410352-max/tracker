"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { ArrowRight, Eye, Layers3, Trophy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";

type LeaderboardEntry = {
  rank: number;
  agentId: string;
  name: string;
  score: number;
  reason: string;
};

type LeaderboardPayload = {
  generatedAt: string;
  criteria: {
    daily: string;
    weekly: string;
    monthly: string;
  };
  daily: LeaderboardEntry[];
  weekly: LeaderboardEntry[];
  monthly: LeaderboardEntry[];
  categories: Array<{
    key: string;
    label: string;
    daily: LeaderboardEntry[];
    weekly: LeaderboardEntry[];
    monthly: LeaderboardEntry[];
  }>;
};

const METRIC_LABELS: Record<string, string> = {
  sleep: "Sleep",
  energy: "Energy",
  focus: "Focus",
  work: "Work",
  money: "Money",
  friendsFamily: "Friends & family",
  health: "Health",
  littleJobs: "Little jobs",
};

function PlayerDashboardContent() {
  const searchParams = useSearchParams();
  const focusAgentId = searchParams.get("focus");
  const workspace = useQuery(api.workflow.GetPlayerWorkspaceOverview, {});
  const [leaderboardMode, setLeaderboardMode] = useState<"daily" | "weekly" | "monthly">(
    "daily"
  );
  const [leaderboard, setLeaderboard] = useState<LeaderboardPayload | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadLeaderboard = async () => {
      setLeaderboardLoading(true);

      try {
        const response = await fetch("/api/player/leaderboard", {
          cache: "no-store",
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || "Unable to load the leaderboard.");
        }

        if (active) {
          setLeaderboard(data);
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (active) {
          setLeaderboardLoading(false);
        }
      }
    };

    void loadLeaderboard();

    return () => {
      active = false;
    };
  }, []);

  const activeEntries = useMemo(
    () => leaderboard?.[leaderboardMode] || [],
    [leaderboard, leaderboardMode]
  );
  const criteriaCopy = leaderboard?.criteria?.[leaderboardMode] || "";

  return (
    <div className="space-y-6">
      <Card className="app-hero-card rounded-[2rem]">
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-3">
              <Badge className="app-chip w-fit rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-sky-700 hover:bg-transparent dark:text-sky-200">
                Leaderboard workspace
              </Badge>
              <CardTitle className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                Workflow leaderboard
              </CardTitle>
              <CardDescription className="max-w-3xl leading-7">
                Open each person's workflow and preview, then compare daily and
                weekly standings based on their tracker stats and workflow block
                setup.
              </CardDescription>
            </div>
            <div className="app-chip flex items-center gap-2 rounded-full px-4 py-2 text-sm text-muted-foreground">
              <Trophy className="size-4 text-amber-500" />
              Workflow builder and preview now jump straight here from the leaderboard shortcut.
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card className="app-panel rounded-[2rem]">
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-2xl">Leaderboard</CardTitle>
              <CardDescription className="mt-1 leading-6">
                Rankings are generated from player stats plus the workflow blocks each
                player has configured.
              </CardDescription>
            </div>
            <Tabs
              value={leaderboardMode}
              onValueChange={(value) =>
                setLeaderboardMode(value as "daily" | "weekly" | "monthly")
              }
            >
              <TabsList>
                <TabsTrigger value="daily">Daily</TabsTrigger>
                <TabsTrigger value="weekly">Weekly</TabsTrigger>
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {criteriaCopy ? (
            <p className="text-sm text-muted-foreground">{criteriaCopy}</p>
          ) : null}
        </CardHeader>
        <CardContent>
          {leaderboardLoading ? (
            <div className="grid gap-3 md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="app-metric-card h-32 animate-pulse rounded-[1.5rem]"
                />
              ))}
            </div>
          ) : activeEntries.length ? (
            <div className="grid gap-3 md:grid-cols-3">
              {activeEntries.map((entry) => (
                <div key={`${leaderboardMode}-${entry.agentId}`} className="app-metric-card rounded-[1.5rem] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Badge className="rounded-full bg-amber-500/12 px-3 py-1 text-amber-700 hover:bg-amber-500/12 dark:text-amber-200">
                      #{entry.rank}
                    </Badge>
                    <p className="text-sm font-semibold text-foreground">{entry.score}</p>
                  </div>
                  <p className="mt-4 text-lg font-semibold text-foreground">{entry.name}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{entry.reason}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No player data is available yet.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="app-panel rounded-[2rem]">
        <CardHeader>
          <CardTitle className="text-2xl">Category rankings</CardTitle>
          <CardDescription className="max-w-3xl leading-6">
            Compare players by category, not just overall score.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 xl:grid-cols-2">
            {(leaderboard?.categories || []).map((category) => {
              const entries = category[leaderboardMode] || [];

              return (
                <div
                  key={category.key}
                  className="rounded-[1.6rem] border border-border bg-background/70 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-foreground">{category.label}</p>
                      <p className="text-sm text-muted-foreground">
                        {leaderboardMode.charAt(0).toUpperCase() + leaderboardMode.slice(1)} ranking
                      </p>
                    </div>
                    <Badge variant="outline" className="rounded-full bg-background/80">
                      {entries.length} players
                    </Badge>
                  </div>

                  <div className="mt-4 space-y-3">
                    {entries.slice(0, 3).map((entry) => (
                      <div
                        key={`${category.key}-${leaderboardMode}-${entry.agentId}`}
                        className="rounded-2xl border border-border bg-background px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-foreground">
                            #{entry.rank} {entry.name}
                          </p>
                          <Badge variant="outline" className="bg-background">
                            {entry.score}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {entry.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="app-panel rounded-[2rem]">
        <CardHeader>
          <CardTitle className="text-2xl">Workflow systems</CardTitle>
          <CardDescription className="max-w-3xl leading-6">
            Each person gets direct workflow and preview access, and both pages now
            link back here through the leaderboard shortcut.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-2">
            {(workspace?.players || []).map((player: any) => {
              const isFocused = focusAgentId && focusAgentId === player.agentId;

              return (
                <Card
                  key={player.agentId}
                  className={`rounded-[1.75rem] border transition ${
                    isFocused
                      ? "border-sky-400/40 shadow-lg shadow-sky-500/10"
                      : "border-border"
                  }`}
                >
                  <CardHeader className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-xl">{player.name}</CardTitle>
                        <CardDescription className="mt-1">
                          {player.userName} • {player.userEmail || "local workspace"}
                        </CardDescription>
                      </div>
                      <Badge
                        variant="outline"
                        className="rounded-full bg-background/80 text-xs"
                      >
                        {player.latestRunStatus}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge className="app-chip rounded-full px-3 py-1 text-[11px] text-slate-700 hover:bg-transparent dark:text-slate-200">
                        <Layers3 className="mr-1 size-3.5" />
                        {player.nodeCount} nodes
                      </Badge>
                      <Badge className="app-chip rounded-full px-3 py-1 text-[11px] text-sky-700 hover:bg-transparent dark:text-sky-200">
                        {player.dailyCompletedCount} daily completions
                      </Badge>
                      <Badge className="app-chip rounded-full px-3 py-1 text-[11px] text-emerald-700 hover:bg-transparent dark:text-emerald-200">
                        {player.weeklyCompletedCount} weekly completions
                      </Badge>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {(player.workflowBlocks || []).slice(0, 6).map((block: string) => (
                        <Badge
                          key={`${player.agentId}-${block}`}
                          variant="outline"
                          className="rounded-full bg-background/70 text-xs"
                        >
                          {block}
                        </Badge>
                      ))}
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      {Object.entries(player.latestMetrics || {}).map(([key, value]) => (
                        <div
                          key={`${player.agentId}-${key}`}
                          className="rounded-2xl border border-border bg-background/70 px-3 py-3"
                        >
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            {METRIC_LABELS[key] || key}
                          </p>
                          <p className="mt-1 text-sm font-medium text-foreground">
                            {value === null || value === undefined || value === ""
                              ? "No data"
                              : String(value)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardHeader>

                  <CardContent className="flex flex-wrap gap-3">
                    <Button asChild>
                      <Link href={`/agent-builder/${player.agentId}`}>
                        Workflow
                        <ArrowRight className="size-4" />
                      </Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link href={`/agent-builder/${player.agentId}/preview`}>
                        <Eye className="size-4" />
                        Preview
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PlayerDashboardPage() {
  return (
    <Suspense fallback={<div className="app-panel rounded-[2rem] p-6">Loading leaderboard workspace...</div>}>
      <PlayerDashboardContent />
    </Suspense>
  );
}

export default PlayerDashboardPage;
