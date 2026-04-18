import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

//convex automatically create unique id for u, so dont need to create id field
export default defineSchema({
    UserTable:defineTable({
        name:v.string(),
        email:v.string(),
        Subscribtion:v.optional(v.string()),
        token:v.number()
    }).index("by_email", ["email"]),

    AgentTable: defineTable({
  agentId: v.string(),
  name: v.string(),
  config: v.optional(v.any()),
  nodes: v.optional(v.any()),
  edges: v.optional(v.any()),
  published: v.boolean(),
  userId: v.id("UserTable"),//connect with userTable
  agentToolConfig: v.optional(v.any()),
})
.index("by_user", ["userId"]), //to check how many agents a user has created


    ConversationTable:defineTable({
        conversationId: v.string(),
        agentId: v.id('AgentTable'),
        userId: v.id('UserTable'),
    }).index("by_conversation", ["conversationId"])
      .index("by_agent_user", ["agentId", "userId"]),

    WorkflowRunTable: defineTable({
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
    }).index("by_conversation", ["conversationId"])
      .index("by_agent_user", ["agentId", "userId"]),

    AgentMemoryTable: defineTable({
        agentId: v.id("AgentTable"),
        userId: v.id("UserTable"),
        memoryKey: v.string(),
        value: v.any(),
        source: v.optional(v.string()),
        updatedAt: v.string(),
    }).index("by_agent_user_key", ["agentId", "userId", "memoryKey"])
      .index("by_agent_user", ["agentId", "userId"]),

    AgentMemoryEventTable: defineTable({
        agentId: v.id("AgentTable"),
        userId: v.id("UserTable"),
        memoryKey: v.string(),
        previousValue: v.optional(v.any()),
        value: v.any(),
        source: v.optional(v.string()),
        changeKind: v.string(),
        updatedAt: v.string(),
    }).index("by_agent_updated", ["agentId", "updatedAt"])
      .index("by_agent_user_updated", ["agentId", "userId", "updatedAt"])
      .index("by_agent_key_updated", ["agentId", "memoryKey", "updatedAt"])
})
