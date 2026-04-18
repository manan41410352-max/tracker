import { NextResponse } from "next/server";
import { fetchQuery } from "convex/nextjs";

import { api } from "@/convex/_generated/api";
import { ollamaGenerateJson } from "@/lib/ollama";
import { tryParseJson } from "@/lib/server/runtime-utils";

export const runtime = "nodejs";

type PlayerSummary = {
  agentId: string;
  name: string;
  workflowBlocks: string[];
  dailyRunCount: number;
  dailyCompletedCount: number;
  weeklyRunCount: number;
  weeklyCompletedCount: number;
  memoryEventCount: number;
  latestMetrics: Record<string, unknown>;
};

type LeaderboardEntry = {
  rank: number;
  agentId: string;
  name: string;
  score: number;
  reason: string;
};

type LeaderboardCategory = {
  key: string;
  label: string;
  daily: LeaderboardEntry[];
  weekly: LeaderboardEntry[];
  monthly: LeaderboardEntry[];
};

function toNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function metricAverage(latestMetrics: Record<string, unknown>) {
  const values = Object.entries(latestMetrics).map(([key, value]) => {
    const numeric = toNumber(value);

    if (key === "sleep") {
      return Math.max(0, Math.min(10, numeric));
    }

    return Math.max(0, Math.min(10, numeric));
  });

  const total = values.reduce((sum, value) => sum + value, 0);
  return values.length ? total / values.length : 0;
}

function fallbackRanking(players: PlayerSummary[]) {
  const rankEntries = (
    items: Array<{ agentId: string; name: string; score: number; reason: string }>
  ) =>
    items
      .sort((left, right) => right.score - left.score)
      .map((player, index) => ({
        rank: index + 1,
        ...player,
      }));
  const daily = [...players]
    .map((player) => {
      const base = metricAverage(player.latestMetrics);
      const score =
        Math.round(
          (base * 6 +
            player.dailyCompletedCount * 14 +
            player.dailyRunCount * 6 +
            player.workflowBlocks.length * 2) *
            10
        ) / 10;

      return {
        agentId: player.agentId,
        name: player.name,
        score,
        reason: `${player.name} is ranked using current tracker metrics, daily completions, and workflow block coverage.`,
      };
    })
    ;
  const weekly = [...players]
    .map((player) => {
      const base = metricAverage(player.latestMetrics);
      const score =
        Math.round(
          (base * 5 +
            player.weeklyCompletedCount * 12 +
            player.weeklyRunCount * 5 +
            player.memoryEventCount * 0.2 +
            player.workflowBlocks.length * 2) *
            10
        ) / 10;

      return {
        agentId: player.agentId,
        name: player.name,
        score,
        reason: `${player.name} is ranked using weekly consistency, memory activity, and workflow block breadth.`,
      };
    })
    ;
  const monthly = [...players].map((player) => {
    const base = metricAverage(player.latestMetrics);
    const score =
      Math.round(
        (base * 5 +
          player.weeklyCompletedCount * 9 +
          player.weeklyRunCount * 5 +
          player.memoryEventCount * 0.3 +
          player.workflowBlocks.length * 2.5) *
          10
      ) / 10;

    return {
      agentId: player.agentId,
      name: player.name,
      score,
      reason: `${player.name} is ranked using longer-range consistency, workflow block breadth, and accumulated tracker activity.`,
    };
  });
  const categories: LeaderboardCategory[] = [
    {
      key: "recovery",
      label: "Recovery",
      daily: rankEntries(
        players.map((player) => ({
          agentId: player.agentId,
          name: player.name,
          score:
            Math.round(
              ((toNumber(player.latestMetrics.sleep) + toNumber(player.latestMetrics.health) + toNumber(player.latestMetrics.energy)) / 3) *
                10
            ) / 10,
          reason: "Recovery ranks sleep, health, and energy signals.",
        }))
      ),
      weekly: rankEntries(
        players.map((player) => ({
          agentId: player.agentId,
          name: player.name,
          score:
            Math.round(
              (
                ((toNumber(player.latestMetrics.sleep) +
                  toNumber(player.latestMetrics.health) +
                  toNumber(player.latestMetrics.energy)) /
                  3 +
                  player.weeklyCompletedCount) *
                10
              )
            ) / 10,
          reason: "Weekly recovery adds completed follow-through to sleep, health, and energy signals.",
        }))
      ),
      monthly: rankEntries(
        players.map((player) => ({
          agentId: player.agentId,
          name: player.name,
          score:
            Math.round(
              (
                ((toNumber(player.latestMetrics.sleep) +
                  toNumber(player.latestMetrics.health) +
                  toNumber(player.latestMetrics.energy)) /
                  3 +
                  player.memoryEventCount * 0.2) *
                10
              )
            ) / 10,
          reason: "Monthly recovery rewards sustained recovery signals and tracked habit updates.",
        }))
      ),
    },
    {
      key: "execution",
      label: "Execution",
      daily: rankEntries(
        players.map((player) => ({
          agentId: player.agentId,
          name: player.name,
          score: player.dailyCompletedCount * 10 + player.dailyRunCount * 4,
          reason: "Execution ranks daily completions and active workflow runs.",
        }))
      ),
      weekly: rankEntries(
        players.map((player) => ({
          agentId: player.agentId,
          name: player.name,
          score: player.weeklyCompletedCount * 9 + player.weeklyRunCount * 4,
          reason: "Weekly execution ranks follow-through and workflow activity.",
        }))
      ),
      monthly: rankEntries(
        players.map((player) => ({
          agentId: player.agentId,
          name: player.name,
          score: player.weeklyCompletedCount * 7 + player.memoryEventCount * 0.4,
          reason: "Monthly execution ranks consistency and sustained updates.",
        }))
      ),
    },
    {
      key: "consistency",
      label: "Consistency",
      daily: rankEntries(
        players.map((player) => ({
          agentId: player.agentId,
          name: player.name,
          score: player.dailyRunCount * 6 + player.memoryEventCount * 0.2,
          reason: "Consistency ranks current tracking activity and memory updates.",
        }))
      ),
      weekly: rankEntries(
        players.map((player) => ({
          agentId: player.agentId,
          name: player.name,
          score: player.weeklyRunCount * 6 + player.memoryEventCount * 0.3,
          reason: "Weekly consistency ranks repeated tracking and updates.",
        }))
      ),
      monthly: rankEntries(
        players.map((player) => ({
          agentId: player.agentId,
          name: player.name,
          score: player.weeklyRunCount * 5 + player.memoryEventCount * 0.5,
          reason: "Monthly consistency rewards sustained tracking behavior.",
        }))
      ),
    },
    {
      key: "finance",
      label: "Finance",
      daily: rankEntries(
        players.map((player) => ({
          agentId: player.agentId,
          name: player.name,
          score: toNumber(player.latestMetrics.money),
          reason: "Finance ranks current money-related tracker signals.",
        }))
      ),
      weekly: rankEntries(
        players.map((player) => ({
          agentId: player.agentId,
          name: player.name,
          score: toNumber(player.latestMetrics.money) + player.weeklyCompletedCount,
          reason: "Weekly finance combines money signals with execution follow-through.",
        }))
      ),
      monthly: rankEntries(
        players.map((player) => ({
          agentId: player.agentId,
          name: player.name,
          score: toNumber(player.latestMetrics.money) + player.memoryEventCount * 0.2,
          reason: "Monthly finance rewards finance signals and ongoing tracking updates.",
        }))
      ),
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    criteria: {
      daily:
        "Daily ranking weighs current tracker metrics, today's completions, and whether the workflow blocks cover the right domains.",
      weekly:
        "Weekly ranking weighs consistency, weekly completions, memory activity, and workflow block breadth.",
      monthly:
        "Monthly ranking weighs longer-range consistency, workflow block breadth, and accumulated tracker activity.",
    },
    daily: rankEntries(daily),
    weekly: rankEntries(weekly),
    monthly: rankEntries(monthly),
    categories,
  };
}

function isValidLeaderboardPayload(value: any) {
  return (
    value &&
    typeof value === "object" &&
    value.criteria &&
    typeof value.criteria === "object" &&
    Array.isArray(value.daily) &&
    Array.isArray(value.weekly) &&
    Array.isArray(value.monthly) &&
    Array.isArray(value.categories)
  );
}

export async function GET() {
  try {
    const workspace = await fetchQuery(api.workflow.GetPlayerWorkspaceOverview, {});
    const players = (workspace?.players || []) as PlayerSummary[];
    const fallback = fallbackRanking(players);

    if (!players.length) {
      return NextResponse.json(fallback);
    }

    try {
      const raw = await ollamaGenerateJson(
        `You are ranking players in a local productivity tracker.
Today's date is 2026-04-18.

Return only valid JSON:
{
  "criteria": {
    "daily": "",
    "weekly": "",
    "monthly": ""
  },
  "daily": [
    {
      "rank": 1,
      "agentId": "",
      "name": "",
      "score": 0,
      "reason": ""
    }
  ],
  "weekly": [
    {
      "rank": 1,
      "agentId": "",
      "name": "",
      "score": 0,
      "reason": ""
    }
  ],
  "monthly": [
    {
      "rank": 1,
      "agentId": "",
      "name": "",
      "score": 0,
      "reason": ""
    }
  ],
  "categories": [
    {
      "key": "",
      "label": "",
      "daily": [],
      "weekly": [],
      "monthly": []
    }
  ]
}

Rank the players using both:
- player stats and completion counts
- workflow blocks, because the winning criteria should respect how strong or complete each player's workflow design is

Player context:
${JSON.stringify(players, null, 2)}

Rules:
- Daily ranking should focus on current metrics, today's completions, and whether the workflow blocks fit the player's day.
- Weekly ranking should focus on consistency, weekly completions, memory activity, and workflow block breadth.
- Monthly ranking should focus on longer-range consistency and compounding effects.
- Also create category leaderboards. Good starter categories are recovery, execution, consistency, and finance, but you may adjust the labels if the player data clearly suggests better category names.
- Keep scores numeric.
- Reasons must mention either stats, workflow blocks, or both.
- Include every player in both rankings exactly once.
- Include every player in each category leaderboard too.
- Return JSON only.`,
        "qwen3:14b-q4_K_M"
      );
      const parsed = tryParseJson(raw || "");

      if (!isValidLeaderboardPayload(parsed)) {
        return NextResponse.json(fallback);
      }

      return NextResponse.json({
        generatedAt: new Date().toISOString(),
        criteria: parsed.criteria,
        daily: parsed.daily,
        weekly: parsed.weekly,
        monthly: parsed.monthly,
        categories: parsed.categories,
      });
    } catch (error) {
      console.warn("Qwen leaderboard generation failed, using deterministic fallback.", error);
      return NextResponse.json(fallback);
    }
  } catch (error) {
    const details =
      error instanceof Error ? error.message : "Unable to build the leaderboard.";

    return NextResponse.json({ error: details }, { status: 500 });
  }
}
