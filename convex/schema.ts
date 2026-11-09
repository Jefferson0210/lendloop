import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  automationEventKind,
  automationEventStatus,
  category,
  condition,
  deliveryStatus,
  loanEventType,
  loanStatus,
  role,
} from "./lib/validators";

export default defineSchema({
  // One row per Clerk user. We keep only what the app needs:
  // a display name for the UI and an email so n8n can notify the user.
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.optional(v.string()),
    role,
    trustedLender: v.boolean(),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category,
    condition,
    description: v.string(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_category", ["category"]),

  // Dates are calendar days ("YYYY-MM-DD"), interpreted in UTC.
  loans: defineTable({
    toolId: v.id("tools"),
    // Snapshot so loan history still reads well if the listing is deleted later.
    toolName: v.string(),
    ownerId: v.id("users"),
    borrowerId: v.id("users"),
    startDate: v.string(),
    endDate: v.string(),
    status: loanStatus,
    decidedAt: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
  })
    .index("by_tool", ["toolId"])
    .index("by_borrower", ["borrowerId"])
    .index("by_owner", ["ownerId"])
    .index("by_status_and_end", ["status", "endDate"]),

  // Outbox for Convex -> n8n webhooks. Each row is one event with its own
  // eventId, so n8n can deduplicate if a retry delivers the same event twice.
  webhookDeliveries: defineTable({
    eventId: v.string(),
    loanId: v.id("loans"),
    type: loanEventType,
    payload: v.string(),
    status: deliveryStatus,
    attempts: v.number(),
    lastError: v.optional(v.string()),
    deliveredAt: v.optional(v.number()),
  })
    .index("by_event", ["eventId"])
    .index("by_status", ["status"])
    .index("by_loan", ["loanId"]),

  // What the automations reported back (n8n -> Convex). `idempotencyKey` is
  // unique per logical action, so retried callbacks never create duplicates.
  automationEvents: defineTable({
    idempotencyKey: v.string(),
    loanId: v.id("loans"),
    kind: automationEventKind,
    status: automationEventStatus,
    channel: v.optional(v.string()),
    detail: v.optional(v.string()),
    occurredAt: v.number(),
  })
    .index("by_key", ["idempotencyKey"])
    .index("by_loan", ["loanId"]),

  // Failures reported by the n8n error workflow, shown to admins.
  automationErrors: defineTable({
    workflow: v.string(),
    node: v.optional(v.string()),
    message: v.string(),
    executionId: v.optional(v.string()),
    occurredAt: v.number(),
  }),
});
