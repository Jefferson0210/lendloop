import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { LoanEventType } from "./validators";

type Recipient = "owner" | "borrower";

const DEFAULT_RECIPIENT: Record<LoanEventType, Recipient> = {
  "loan.requested": "owner", // a neighbor wants your tool
  "loan.approved": "borrower",
  "loan.rejected": "borrower",
  "loan.cancelled": "owner", // the borrower withdrew the request
  "loan.returned": "borrower", // confirmation for the borrower
};

/**
 * Writes a webhook event to the outbox in the same transaction as the loan
 * change, then schedules delivery. If the mutation rolls back, no event is
 * sent; if delivery fails, the row stays and is retried.
 *
 * The payload carries only what the notification needs: the recipient's first
 * name and email, the tool name, dates and status. No other personal data.
 */
export async function enqueueLoanEvent(
  ctx: MutationCtx,
  loan: Doc<"loans">,
  type: LoanEventType,
  options: { notify?: Recipient } = {},
) {
  const recipientRole = options.notify ?? DEFAULT_RECIPIENT[type];
  const recipient = await ctx.db.get(recipientRole === "owner" ? loan.ownerId : loan.borrowerId);
  const counterpart = await ctx.db.get(recipientRole === "owner" ? loan.borrowerId : loan.ownerId);

  const eventId = crypto.randomUUID();
  const payload = {
    eventId,
    type,
    occurredAt: new Date().toISOString(),
    loan: {
      id: loan._id,
      toolName: loan.toolName,
      startDate: loan.startDate,
      endDate: loan.endDate,
      status: loan.status,
    },
    recipient: {
      role: recipientRole,
      name: recipient?.name ?? "Neighbor",
      email: recipient?.email ?? null,
    },
    counterpartName: counterpart?.name ?? "A neighbor",
  };

  const deliveryId = await ctx.db.insert("webhookDeliveries", {
    eventId,
    loanId: loan._id,
    type,
    payload: JSON.stringify(payload),
    status: "pending",
    attempts: 0,
  });
  await ctx.scheduler.runAfter(0, internal.webhooks.deliver, { deliveryId });
}
