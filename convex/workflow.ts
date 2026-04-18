import { v } from "convex/values";

import { mutation, query } from "./_generated/server";

const TRACKER_MEMORY_KEY_MAP = {
  sleep: "sleep_hours",
  energy: "energy_level",
  focus: "focus_level",
  work: "work_load",
  money: "money_state",
  friendsFamily: "friends_family_state",
  health: "health_state",
  littleJobs: "little_jobs_state",
} as const;

function toTimestamp(value: string | undefined, fallback: number) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function uniqueNodeLabels(agent: any) {
  const nodes = Array.isArray(agent?.nodes) ? agent.nodes : [];
  const seen = new Set<string>();

  return nodes
    .map((node: any) => String(node?.data?.label || node?.label || node?.id || "").trim())
    .filter((label: string) => {
      if (!label || /^(start|complete)$/i.test(label) || seen.has(label)) {
        return false;
      }

      seen.add(label);
      return true;
    });
}

function buildLatestMetrics(memoryRecords: any[]) {
  const memoryMap = Object.fromEntries(
    memoryRecords.map((record) => [String(record.memoryKey), record.value])
  );

  return Object.fromEntries(
    Object.entries(TRACKER_MEMORY_KEY_MAP).map(([key, memoryKey]) => [key, memoryMap[memoryKey] ?? null])
  );
}

async function buildWorkspaceSummary(ctx: any) {
  const [agents, users, runs, memories, memoryEvents] = (await Promise.all([
    ctx.db.query("AgentTable").collect(),
    ctx.db.query("UserTable").collect(),
    ctx.db.query("WorkflowRunTable").collect(),
    ctx.db.query("AgentMemoryTable").collect(),
    ctx.db.query("AgentMemoryEventTable").collect(),
  ])) as any[];

  const usersById = new Map((users as any[]).map((user: any) => [String(user._id), user]));
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  const players = (agents as any[]).map((agent: any) => {
    const user = usersById.get(String(agent.userId)) as any;
    const agentRuns = (runs as any[])
      .filter((run: any) => String(run.agentId) === String(agent._id))
      .sort(
        (left: any, right: any) =>
          toTimestamp(String(right.updatedAt || ""), right._creationTime) -
          toTimestamp(String(left.updatedAt || ""), left._creationTime)
      );
    const latestRun = agentRuns[0] || null;
    const agentMemories = (memories as any[]).filter(
      (record: any) => String(record.agentId) === String(agent._id)
    );
    const agentMemoryEvents = (memoryEvents as any[]).filter(
      (record: any) => String(record.agentId) === String(agent._id)
    );
    const dailyRuns = agentRuns.filter(
      (run: any) => toTimestamp(String(run.updatedAt || ""), run._creationTime) >= oneDayAgo
    );
    const weeklyRuns = agentRuns.filter(
      (run: any) => toTimestamp(String(run.updatedAt || ""), run._creationTime) >= sevenDaysAgo
    );

    return {
      _id: agent._id,
      agentId: agent.agentId,
      name: agent.name,
      published: agent.published,
      userId: agent.userId,
      userName: user?.name || "Unknown user",
      userEmail: user?.email || "",
      nodeCount: Math.max((Array.isArray(agent.nodes) ? agent.nodes.length : 0) - 1, 0),
      workflowBlocks: uniqueNodeLabels(agent),
      latestRunStatus: latestRun?.status || "idle",
      latestRunUpdatedAt: latestRun?.updatedAt || "",
      latestConversationId: latestRun?.conversationId || "",
      dailyRunCount: dailyRuns.length,
      dailyCompletedCount: dailyRuns.filter((run: any) => run.status === "completed").length,
      weeklyRunCount: weeklyRuns.length,
      weeklyCompletedCount: weeklyRuns.filter((run: any) => run.status === "completed").length,
      memoryCount: agentMemories.length,
      memoryEventCount: agentMemoryEvents.length,
      latestMetrics: buildLatestMetrics(agentMemories),
    };
  });

  const workspaceUsers = (users as any[]).map((user: any) => {
    const userAgents = (agents as any[]).filter(
      (agent: any) => String(agent.userId) === String(user._id)
    );
    const userRuns = (runs as any[]).filter(
      (run: any) => String(run.userId) === String(user._id)
    );
    const userMemories = (memories as any[]).filter(
      (record: any) => String(record.userId) === String(user._id)
    );

    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      agentCount: userAgents.length,
      runCount: userRuns.length,
      completedRunCount: userRuns.filter((run: any) => run.status === "completed").length,
      memoryCount: userMemories.length,
    };
  });

  return {
    totals: {
      userCount: (users as any[]).length,
      playerCount: players.length,
      runCount: (runs as any[]).length,
      completedRunCount: (runs as any[]).filter((run: any) => run.status === "completed").length,
      memoryCount: (memories as any[]).length,
      memoryEventCount: (memoryEvents as any[]).length,
    },
    players,
    users: workspaceUsers,
  };
}

export const EnsureConversation = mutation({
  args: {
    conversationId: v.string(),
    agentId: v.id("AgentTable"),
    userId: v.id("UserTable"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("ConversationTable")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .unique();

    if (existing) {
      return existing;
    }

    const insertedId = await ctx.db.insert("ConversationTable", args);
    return ctx.db.get(insertedId);
  },
});

export const GetWorkflowRunByConversation = query({
  args: {
    conversationId: v.string(),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("WorkflowRunTable")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .unique();
  },
});

export const UpsertWorkflowRun = mutation({
  args: {
    conversationId: v.string(),
    agentId: v.id("AgentTable"),
    userId: v.id("UserTable"),
    status: v.string(),
    currentNodeId: v.optional(v.string()),
    pendingAction: v.optional(v.any()),
    state: v.optional(v.any()),
    nodeHistory: v.optional(v.any()),
    messages: v.optional(v.any()),
    browserSession: v.optional(v.any()),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("WorkflowRunTable")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, args);
      return ctx.db.get(existing._id);
    }

    const insertedId = await ctx.db.insert("WorkflowRunTable", args);
    return ctx.db.get(insertedId);
  },
});

export const GetAgentMemory = query({
  args: {
    agentId: v.id("AgentTable"),
    userId: v.id("UserTable"),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("AgentMemoryTable")
      .withIndex("by_agent_user", (q) =>
        q.eq("agentId", args.agentId).eq("userId", args.userId)
      )
      .collect();
  },
});

export const GetAgentMemoryByAgent = query({
  args: {
    agentId: v.id("AgentTable"),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("AgentMemoryTable")
      .withIndex("by_agent_user", (q) => q.eq("agentId", args.agentId))
      .collect();
  },
});

export const GetAgentMemoryTimelineByAgent = query({
  args: {
    agentId: v.id("AgentTable"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(Number(args.limit || 80), 200));

    return ctx.db
      .query("AgentMemoryEventTable")
      .withIndex("by_agent_updated", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .take(limit);
  },
});

export const GetDashboardSummary = query({
  args: {},
  handler: async (ctx) => {
    const runs = await ctx.db.query("WorkflowRunTable").collect();
    const sortedRuns = [...runs].sort((a, b) =>
      String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))
    );

    const recentRuns = await Promise.all(
      sortedRuns.slice(0, 8).map(async (run) => {
        const agent = await ctx.db.get(run.agentId);
        const fallbackHistory = Array.isArray((run.state as any)?.fallbackHistory)
          ? ((run.state as any).fallbackHistory as any[])
          : [];

        return {
          _id: run._id,
          conversationId: run.conversationId,
          status: run.status,
          updatedAt: run.updatedAt,
          agentId: agent?.agentId || "",
          agentName: agent?.name || "Unknown agent",
          pendingActionType: run.pendingAction?.type || null,
          currentNodeId: run.currentNodeId || null,
          fallbackCount: fallbackHistory.length,
          latestFallback:
            fallbackHistory.length > 0
              ? fallbackHistory[fallbackHistory.length - 1]
              : null,
        };
      })
    );

    return {
      totalRuns: runs.length,
      activeRuns: runs.filter((run) => run.status === "running").length,
      completedRuns: runs.filter((run) => run.status === "completed").length,
      pendingBrowserTakeovers: runs.filter((run) => run.status === "pending_browser")
        .length,
      autoResolvedFallbacks: runs.reduce((count, run) => {
        const fallbackHistory = Array.isArray((run.state as any)?.fallbackHistory)
          ? ((run.state as any).fallbackHistory as any[])
          : [];

        return (
          count +
          fallbackHistory.filter(
            (entry) => entry?.resolved && entry?.action === "continue"
          ).length
        );
      }, 0),
      escalatedFallbacks: runs.reduce((count, run) => {
        const fallbackHistory = Array.isArray((run.state as any)?.fallbackHistory)
          ? ((run.state as any).fallbackHistory as any[])
          : [];

        return (
          count +
          fallbackHistory.filter(
            (entry) => entry?.action === "manual_browser" || entry?.action === "stop"
          ).length
        );
      }, 0),
      recentRuns,
    };
  },
});

export const GetPlayerWorkspaceOverview = query({
  args: {},
  handler: async (ctx) => {
    const summary = await buildWorkspaceSummary(ctx);
    return {
      totals: summary.totals,
      players: summary.players,
    };
  },
});

export const GetAdminWorkspaceOverview = query({
  args: {},
  handler: async (ctx) => {
    return buildWorkspaceSummary(ctx);
  },
});

export const UpsertAgentMemory = mutation({
  args: {
    agentId: v.id("AgentTable"),
    userId: v.id("UserTable"),
    memoryKey: v.string(),
    value: v.any(),
    source: v.optional(v.string()),
    updatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const stringifyForComparison = (value: any) => {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    };

    const existing = await ctx.db
      .query("AgentMemoryTable")
      .withIndex("by_agent_user_key", (q) =>
        q
          .eq("agentId", args.agentId)
          .eq("userId", args.userId)
          .eq("memoryKey", args.memoryKey)
      )
      .unique();

    const previousValue = existing?.value;
    const changed =
      !existing ||
      stringifyForComparison(previousValue) !== stringifyForComparison(args.value) ||
      String(existing.source || "") !== String(args.source || "");

    if (existing) {
      await ctx.db.patch(existing._id, args);
      const nextRecord = await ctx.db.get(existing._id);

      if (changed) {
        await ctx.db.insert("AgentMemoryEventTable", {
          agentId: args.agentId,
          userId: args.userId,
          memoryKey: args.memoryKey,
          previousValue,
          value: args.value,
          source: args.source,
          changeKind: "update",
          updatedAt: args.updatedAt,
        });
      }

      return nextRecord;
    }

    const insertedId = await ctx.db.insert("AgentMemoryTable", args);
    const inserted = await ctx.db.get(insertedId);

    await ctx.db.insert("AgentMemoryEventTable", {
      agentId: args.agentId,
      userId: args.userId,
      memoryKey: args.memoryKey,
      previousValue: undefined,
      value: args.value,
      source: args.source,
      changeKind: "create",
      updatedAt: args.updatedAt,
    });

    return inserted;
  },
});
