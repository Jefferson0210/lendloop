import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { notFound, requireAdmin } from "./lib/auth";
import { role } from "./lib/validators";

/** Users with their lending stats, for the admin dashboard. */
export const users = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    return Promise.all(
      users.map(async (u) => {
        const lent = await ctx.db
          .query("loans")
          .withIndex("by_owner", (q) => q.eq("ownerId", u._id))
          .collect();
        return {
          _id: u._id,
          name: u.name,
          email: u.email,
          role: u.role,
          trustedLender: u.trustedLender,
          completedLoans: lent.filter((l) => l.status === "returned").length,
        };
      }),
    );
  },
});

export const setTrustedLender = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, { userId, trusted }) => {
    await requireAdmin(ctx);
    if (!(await ctx.db.get(userId))) notFound("User not found.");
    await ctx.db.patch(userId, { trustedLender: trusted });
  },
});

/** Automation health: undelivered webhooks and errors reported by n8n. */
export const automationHealth = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const failed = await ctx.db
      .query("webhookDeliveries")
      .withIndex("by_status", (q) => q.eq("status", "failed"))
      .order("desc")
      .take(20);
    const skipped = await ctx.db
      .query("webhookDeliveries")
      .withIndex("by_status", (q) => q.eq("status", "skipped"))
      .order("desc")
      .take(20);
    const pending = await ctx.db
      .query("webhookDeliveries")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(50);
    const errors = await ctx.db.query("automationErrors").order("desc").take(20);
    return {
      pendingCount: pending.length,
      deliveries: [...failed, ...skipped].map((d) => ({
        _id: d._id,
        eventId: d.eventId,
        type: d.type,
        status: d.status,
        attempts: d.attempts,
        lastError: d.lastError,
        createdAt: d._creationTime,
      })),
      errors: errors.map((e) => ({
        _id: e._id,
        workflow: e.workflow,
        node: e.node,
        message: e.message,
        executionId: e.executionId,
        occurredAt: e.occurredAt,
      })),
    };
  },
});

/**
 * Bootstrap or change a role from the CLI (needs deploy access, not callable from the browser):
 *   npx convex run admin:setRole '{"email":"you@example.com","role":"admin"}'
 */
export const setRole = internalMutation({
  args: { email: v.string(), role },
  handler: async (ctx, { email, role }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email.toLowerCase()))
      .unique();
    if (!user) notFound(`No user with email ${email}. Sign in once first.`);
    await ctx.db.patch(user._id, { role });
    return { userId: user._id, role };
  },
});
