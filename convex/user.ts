import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const CreateNewUser = mutation({
  args: {
    name: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const existingUsers = await ctx.db
      .query("UserTable")
      .filter((q) => q.eq(q.field("email"), args.email))
      .collect();

    if (existingUsers.length > 0) {
      return existingUsers[0];
    }

    const userId = await ctx.db.insert("UserTable", {
      name: args.name,
      email: args.email,
      token: 5000,
    });

    return await ctx.db.get(userId);
  },
});
