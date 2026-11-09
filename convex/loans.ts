import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { forbidden, invalid, notFound, requireAdmin, requireUser } from "./lib/auth";
import { approvedLoansFor } from "./lib/availability";
import { daysBetween, isValidDay, rangesOverlap, todayUtc } from "./lib/dates";
import { enqueueLoanEvent } from "./lib/outbox";
import { LIMITS } from "./lib/validators";

// ---------------------------------------------------------------- reads

async function describeLoan(ctx: QueryCtx, loan: Doc<"loans">) {
  const [owner, borrower, events] = await Promise.all([
    ctx.db.get(loan.ownerId),
    ctx.db.get(loan.borrowerId),
    ctx.db
      .query("automationEvents")
      .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
      .order("desc")
      .take(5),
  ]);
  const today = todayUtc();
  return {
    _id: loan._id,
    _creationTime: loan._creationTime,
    toolId: loan.toolId,
    toolName: loan.toolName,
    startDate: loan.startDate,
    endDate: loan.endDate,
    status: loan.status,
    returnedAt: loan.returnedAt,
    overdue: loan.status === "approved" && loan.endDate < today,
    owner: { name: owner?.name ?? "Neighbor", trusted: owner?.trustedLender ?? false },
    borrower: { name: borrower?.name ?? "Neighbor" },
    activity: events.map((e) => ({ kind: e.kind, status: e.status, channel: e.channel, at: e.occurredAt })),
  };
}

/** Loans where I am the borrower ("My requests"). */
export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", me._id))
      .order("desc")
      .collect();
    return Promise.all(loans.map((l) => describeLoan(ctx, l)));
  },
});

/** Requests and loans on my tools ("Incoming requests"). */
export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_owner", (q) => q.eq("ownerId", me._id))
      .order("desc")
      .collect();
    return Promise.all(loans.map((l) => describeLoan(ctx, l)));
  },
});

/** Every loan in the system. Admins only. */
export const all = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const loans = await ctx.db.query("loans").order("desc").take(200);
    return Promise.all(loans.map((l) => describeLoan(ctx, l)));
  },
});

// ---------------------------------------------------------------- writes

async function loadLoan(ctx: QueryCtx, loanId: Doc<"loans">["_id"]) {
  const loan = await ctx.db.get(loanId);
  if (!loan) notFound("Loan not found.");
  return loan;
}

export const request = mutation({
  args: { toolId: v.id("tools"), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, { toolId, startDate, endDate }) => {
    const me = await requireUser(ctx);
    const tool = await ctx.db.get(toolId);
    if (!tool) notFound("Tool not found.");
    if (tool.ownerId === me._id) invalid("You can't borrow your own tool.");

    if (!isValidDay(startDate) || !isValidDay(endDate)) invalid("Dates must be valid days (YYYY-MM-DD).");
    if (startDate < todayUtc()) invalid("The loan can't start in the past.");
    if (endDate < startDate) invalid("The end date must be on or after the start date.");
    if (daysBetween(startDate, endDate) + 1 > LIMITS.maxLoanDays) {
      invalid(`Loans can last at most ${LIMITS.maxLoanDays} days.`);
    }

    const approved = await approvedLoansFor(ctx, toolId);
    if (approved.some((l) => rangesOverlap(l.startDate, l.endDate, startDate, endDate))) {
      invalid("The tool is already booked for some of those days.");
    }
    const mine = await ctx.db
      .query("loans")
      .withIndex("by_tool", (q) => q.eq("toolId", toolId))
      .collect();
    if (mine.some((l) => l.borrowerId === me._id && l.status === "requested")) {
      invalid("You already have a pending request for this tool.");
    }

    const loanId = await ctx.db.insert("loans", {
      toolId,
      toolName: tool.name,
      ownerId: tool.ownerId,
      borrowerId: me._id,
      startDate,
      endDate,
      status: "requested",
    });
    await enqueueLoanEvent(ctx, (await ctx.db.get(loanId))!, "loan.requested");
    return loanId;
  },
});

/** Owner approves. Other pending requests that overlap the same days are declined automatically. */
export const approve = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const me = await requireUser(ctx);
    const loan = await loadLoan(ctx, loanId);
    if (loan.ownerId !== me._id) forbidden("Only the owner of the tool can approve this request.");
    if (loan.status !== "requested") invalid("Only pending requests can be approved.");

    const others = await ctx.db
      .query("loans")
      .withIndex("by_tool", (q) => q.eq("toolId", loan.toolId))
      .collect();
    if (others.some((l) => l.status === "approved" && rangesOverlap(l.startDate, l.endDate, loan.startDate, loan.endDate))) {
      invalid("Those days are already booked by another loan.");
    }

    const now = Date.now();
    await ctx.db.patch(loanId, { status: "approved", decidedAt: now });
    await enqueueLoanEvent(ctx, { ...loan, status: "approved" }, "loan.approved");

    for (const other of others) {
      if (
        other._id !== loanId &&
        other.status === "requested" &&
        rangesOverlap(other.startDate, other.endDate, loan.startDate, loan.endDate)
      ) {
        await ctx.db.patch(other._id, { status: "rejected", decidedAt: now });
        await enqueueLoanEvent(ctx, { ...other, status: "rejected" }, "loan.rejected");
      }
    }
  },
});

export const reject = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const me = await requireUser(ctx);
    const loan = await loadLoan(ctx, loanId);
    if (loan.ownerId !== me._id) forbidden("Only the owner of the tool can decline this request.");
    if (loan.status !== "requested") invalid("Only pending requests can be declined.");
    await ctx.db.patch(loanId, { status: "rejected", decidedAt: Date.now() });
    await enqueueLoanEvent(ctx, { ...loan, status: "rejected" }, "loan.rejected");
  },
});

/** The borrower withdraws a request that hasn't been answered yet. */
export const cancel = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const me = await requireUser(ctx);
    const loan = await loadLoan(ctx, loanId);
    if (loan.borrowerId !== me._id) forbidden("Only the person who asked can cancel this request.");
    if (loan.status !== "requested") invalid("Only pending requests can be cancelled.");
    await ctx.db.patch(loanId, { status: "cancelled", decidedAt: Date.now() });
    await enqueueLoanEvent(ctx, { ...loan, status: "cancelled" }, "loan.cancelled");
  },
});

/** Either side of an approved loan can mark it as returned. */
export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const me = await requireUser(ctx);
    const loan = await loadLoan(ctx, loanId);
    if (loan.ownerId !== me._id && loan.borrowerId !== me._id) {
      forbidden("You can only update loans you are part of.");
    }
    if (loan.status !== "approved") invalid("Only active loans can be marked as returned.");
    await ctx.db.patch(loanId, { status: "returned", returnedAt: Date.now() });
    await enqueueLoanEvent(ctx, { ...loan, status: "returned" }, "loan.returned");
  },
});
