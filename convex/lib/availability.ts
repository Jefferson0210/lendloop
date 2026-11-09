import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { todayUtc } from "./dates";

export type ToolStatus = "available" | "on_loan";

/**
 * A tool is "on loan" while an approved loan has started and has not been
 * returned (overdue loans still count). Future approved loans do not block it
 * from showing as available today.
 */
export async function toolStatus(ctx: QueryCtx, toolId: Id<"tools">): Promise<ToolStatus> {
  const today = todayUtc();
  const loans = await ctx.db
    .query("loans")
    .withIndex("by_tool", (q) => q.eq("toolId", toolId))
    .collect();
  const active = loans.some((l) => l.status === "approved" && l.startDate <= today);
  return active ? "on_loan" : "available";
}

export async function approvedLoansFor(ctx: QueryCtx, toolId: Id<"tools">): Promise<Doc<"loans">[]> {
  const loans = await ctx.db
    .query("loans")
    .withIndex("by_tool", (q) => q.eq("toolId", toolId))
    .collect();
  return loans.filter((l) => l.status === "approved");
}
