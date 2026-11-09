import { v, type Infer } from "convex/values";

export const CATEGORIES = [
  "power_tools",
  "hand_tools",
  "garden",
  "kitchen",
  "camping",
  "cleaning",
  "other",
] as const;

export const CONDITIONS = ["like_new", "good", "fair", "worn"] as const;

export const category = v.union(...CATEGORIES.map((c) => v.literal(c)));
export const condition = v.union(...CONDITIONS.map((c) => v.literal(c)));

export const role = v.union(v.literal("admin"), v.literal("user"));

export const loanStatus = v.union(
  v.literal("requested"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("cancelled"),
  v.literal("returned"),
);

export const loanEventType = v.union(
  v.literal("loan.requested"),
  v.literal("loan.approved"),
  v.literal("loan.rejected"),
  v.literal("loan.cancelled"),
  v.literal("loan.returned"),
);

export const deliveryStatus = v.union(
  v.literal("pending"),
  v.literal("delivered"),
  v.literal("failed"),
  v.literal("skipped"),
);

export const automationEventKind = v.union(
  v.literal("request_notification"),
  v.literal("overdue_reminder"),
);

export const automationEventStatus = v.union(v.literal("sent"), v.literal("failed"));

export type Category = Infer<typeof category>;
export type Condition = Infer<typeof condition>;
export type LoanStatus = Infer<typeof loanStatus>;
export type LoanEventType = Infer<typeof loanEventType>;

export const LIMITS = {
  toolName: 80,
  description: 500,
  maxLoanDays: 30,
};
