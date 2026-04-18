import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const CreateAgent = mutation({
  args: {
    name: v.string(),
    agentId: v.string(),
    userId: v.id("UserTable"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }

    return await ctx.db.insert("AgentTable", {
      name: args.name,
      agentId: args.agentId,
      published: false,
      userId: args.userId,
    });
  },
});

export const GetUserAgents = query({
  args: {
    userId: v.id("UserTable"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("AgentTable")
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .order("desc")
      .collect();
  },
});

export const GetWorkspaceAgents = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("AgentTable").order("desc").collect();
  },
});

export const GetDashboardSummary = query({
  args: {},
  handler: async (ctx) => {
    const agents = await ctx.db.query("AgentTable").order("desc").collect();
    const sortedAgents = [...agents].sort(
      (a, b) => b._creationTime - a._creationTime
    );

    return {
      totalAgents: agents.length,
      publishedAgents: agents.filter((agent) => agent.published).length,
      draftAgents: agents.filter((agent) => !agent.published).length,
      recentAgents: sortedAgents.slice(0, 6).map((agent) => ({
        _id: agent._id,
        agentId: agent.agentId,
        name: agent.name,
        published: agent.published,
        nodeCount: Array.isArray(agent.nodes) ? Math.max(agent.nodes.length - 1, 0) : 0,
        updatedAt:
          String(agent.config?.lastEditedAt || agent.config?.lastGeneratedAt || ""),
        _creationTime: agent._creationTime,
      })),
    };
  },
});

export const GetAgentById = query({
  args: {
    agentId: v.string(),
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("AgentTable")
      .filter((q) => q.eq(q.field("agentId"), args.agentId))
      .order("desc")
      .collect();

    return result[0];
  },
});

export const UpdateAgentDetail = mutation({
  args: {
    agentId: v.string(),
    name: v.optional(v.string()),
    config: v.optional(v.any()),
    nodes: v.optional(v.any()),
    edges: v.optional(v.any()),
    published: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("AgentTable")
      .filter((q) => q.eq(q.field("agentId"), args.agentId))
      .first();

    if (!agent) {
      throw new Error("Agent not found");
    }

    await ctx.db.patch(agent._id, {
      ...(args.name !== undefined && { name: args.name }),
      ...(args.config !== undefined && { config: args.config }),
      ...(args.nodes !== undefined && { nodes: args.nodes }),
      ...(args.edges !== undefined && { edges: args.edges }),
      ...(args.published !== undefined && { published: args.published }),
    });

    return { success: true, agentId: args.agentId };
  },
});

export const DebugListAllAgents = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("AgentTable").collect();
  },
});

export const UpdateAgentToolConfig = mutation({
  args: {
    id: v.id("AgentTable"),
    agentToolConfig: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      agentToolConfig: args.agentToolConfig,
    });
  },
});

export const DeleteAgentById = mutation({
  args: {
    agentId: v.string(),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db
      .query("AgentTable")
      .filter((q) => q.eq(q.field("agentId"), args.agentId))
      .first();

    if (!agent) {
      throw new Error("Agent not found");
    }

    const conversations = await ctx.db
      .query("ConversationTable")
      .filter((q) => q.eq(q.field("agentId"), agent._id))
      .collect();

    for (const conversation of conversations) {
      await ctx.db.delete(conversation._id);
    }

    await ctx.db.delete(agent._id);

    return { success: true };
  },
});
