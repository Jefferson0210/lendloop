import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { daysBetween, todayUtc } from "./lib/dates";

/**
 * Demo helper (internal: CLI only, never callable from the browser).
 * Moves an approved loan into the past so the overdue-reminder workflow has
 * something to send:
 *   npx convex run devtools:makeOverdue '{"loanId":"<id>","daysLate":2}'
 */
export const makeOverdue = internalMutation({
  args: { loanId: v.id("loans"), daysLate: v.optional(v.number()) },
  handler: async (ctx, { loanId, daysLate = 2 }) => {
    const loan = await ctx.db.get(loanId);
    if (!loan) throw new Error("Loan not found.");
    if (loan.status !== "approved") throw new Error("Only approved loans can be made overdue.");
    const length = Math.max(0, daysBetween(loan.startDate, loan.endDate));
    const day = (offset: number) => todayUtc(Date.now() - offset * 86_400_000);
    await ctx.db.patch(loanId, { startDate: day(daysLate + length), endDate: day(daysLate) });
    return { startDate: day(daysLate + length), endDate: day(daysLate) };
  },
});
