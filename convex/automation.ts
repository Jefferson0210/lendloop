import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { daysBetween } from "./lib/dates";
import { reminderKey } from "./lib/keys";
import { automationEventKind, automationEventStatus } from "./lib/validators";

/**
 * Internal functions behind the HTTP endpoints that n8n calls (see http.ts).
 * They are not reachable from the browser.
 */

/** Approved loans past their end date that have not been reminded today. Minimal fields only. */
export const overdueLoans = internalQuery({
  args: { today: v.string() },
  handler: async (ctx, { today }) => {
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_status_and_end", (q) => q.eq("status", "approved").lt("endDate", today))
      .collect();

    const result = [];
    for (const loan of loans) {
      const alreadyReminded = await ctx.db
        .query("automationEvents")
        .withIndex("by_key", (q) => q.eq("idempotencyKey", reminderKey(loan._id, today)))
        .unique();
      if (alreadyReminded?.status === "sent") continue;

      const borrower = await ctx.db.get(loan.borrowerId);
      result.push({
        loanId: loan._id,
        toolName: loan.toolName,
        endDate: loan.endDate,
        daysOverdue: daysBetween(loan.endDate, today),
        borrower: { name: borrower?.name ?? "Neighbor", email: borrower?.email ?? null },
      });
    }
    return result;
  },
});

/**
 * Idempotent write-back from n8n. The same key can arrive many times (n8n
 * retries, a re-run execution): the first "sent" wins and later calls are no-ops.
 * A "failed" record can be upgraded to "sent" by a later successful retry.
 */
export const recordEvent = internalMutation({
  args: {
    idempotencyKey: v.string(),
    loanId: v.string(),
    kind: automationEventKind,
    status: automationEventStatus,
    channel: v.optional(v.string()),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const loanId = ctx.db.normalizeId("loans", args.loanId);
    if (!loanId || !(await ctx.db.get(loanId))) return { result: "unknown_loan" as const };

    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_key", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .unique();

    if (existing) {
      if (existing.status === "failed" && args.status === "sent") {
        await ctx.db.patch(existing._id, { status: "sent", channel: args.channel, detail: args.detail, occurredAt: Date.now() });
        return { result: "updated" as const };
      }
      return { result: "duplicate" as const };
    }

    await ctx.db.insert("automationEvents", {
      idempotencyKey: args.idempotencyKey,
      loanId,
      kind: args.kind,
      status: args.status,
      channel: args.channel,
      detail: args.detail?.slice(0, 300),
      occurredAt: Date.now(),
    });
    return { result: "created" as const };
  },
});

export const recordError = internalMutation({
  args: {
    workflow: v.string(),
    node: v.optional(v.string()),
    message: v.string(),
    executionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("automationErrors", {
      workflow: args.workflow.slice(0, 120),
      node: args.node?.slice(0, 120),
      message: args.message.slice(0, 500),
      executionId: args.executionId?.slice(0, 60),
      occurredAt: Date.now(),
    });
  },
});
