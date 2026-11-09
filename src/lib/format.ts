import { ConvexError } from "convex/values";
import type { Category, Condition, LoanStatus } from "../../convex/lib/validators";

export const CATEGORY_LABELS: Record<Category, string> = {
  power_tools: "Power tools",
  hand_tools: "Hand tools",
  garden: "Garden",
  kitchen: "Kitchen",
  camping: "Camping",
  cleaning: "Cleaning",
  other: "Other",
};

export const CATEGORY_ICONS: Record<Category, string> = {
  power_tools: "🔌",
  hand_tools: "🔨",
  garden: "🌱",
  kitchen: "🍳",
  camping: "⛺",
  cleaning: "🧽",
  other: "📦",
};

export const CONDITION_LABELS: Record<Condition, string> = {
  like_new: "Like new",
  good: "Good",
  fair: "Fair",
  worn: "Worn",
};

export const LOAN_STATUS_LABELS: Record<LoanStatus, string> = {
  requested: "Pending",
  approved: "Approved",
  rejected: "Declined",
  cancelled: "Cancelled",
  returned: "Returned",
};

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function timeAgo(ms: number, now = Date.now()): string {
  const minutes = Math.round((now - ms) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Turns a ConvexError thrown by our functions into a message for the user. */
export function errorMessage(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as { message?: string } | string;
    return typeof data === "string" ? data : (data.message ?? "Something went wrong.");
  }
  return "Something went wrong. Please try again.";
}
