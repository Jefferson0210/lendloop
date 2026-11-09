import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, mutation } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { signRequest } from "./lib/hmac";

/** Backoff between attempts: 10 s, 1 min, 5 min, 30 min, 2 h. Then the event is marked failed. */
const RETRY_DELAYS_MS = [10_000, 60_000, 300_000, 1_800_000, 7_200_000];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const REQUEST_TIMEOUT_MS = 10_000;

export const getDelivery = internalQuery({
  args: { deliveryId: v.id("webhookDeliveries") },
  handler: (ctx, { deliveryId }) => ctx.db.get(deliveryId),
});

export const recordAttempt = internalMutation({
  args: {
    deliveryId: v.id("webhookDeliveries"),
    outcome: v.union(v.literal("delivered"), v.literal("retry"), v.literal("skipped")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { deliveryId, outcome, error }) => {
    const delivery = await ctx.db.get(deliveryId);
    if (!delivery || delivery.status !== "pending") return;

    if (outcome === "skipped") {
      await ctx.db.patch(deliveryId, { status: "skipped", lastError: error });
      return;
    }
    const attempts = delivery.attempts + 1;
    if (outcome === "delivered") {
      await ctx.db.patch(deliveryId, { status: "delivered", attempts, deliveredAt: Date.now(), lastError: undefined });
      return;
    }
    if (attempts >= MAX_ATTEMPTS) {
      // Visible to admins in the dashboard; never fails silently.
      await ctx.db.patch(deliveryId, { status: "failed", attempts, lastError: error });
      console.error(`Webhook ${delivery.eventId} failed after ${attempts} attempts: ${error}`);
      return;
    }
    await ctx.db.patch(deliveryId, { attempts, lastError: error });
    await ctx.scheduler.runAfter(RETRY_DELAYS_MS[attempts - 1], internal.webhooks.deliver, { deliveryId });
  },
});

/** Sends one outbox event to n8n, signed with HMAC. Retries are scheduled by `recordAttempt`. */
export const deliver = internalAction({
  args: { deliveryId: v.id("webhookDeliveries") },
  handler: async (ctx, { deliveryId }) => {
    const delivery = await ctx.runQuery(internal.webhooks.getDelivery, { deliveryId });
    if (!delivery || delivery.status !== "pending") return;

    const url = process.env.N8N_LOAN_WEBHOOK_URL;
    const secret = process.env.N8N_SHARED_SECRET;
    if (!url || !secret) {
      await ctx.runMutation(internal.webhooks.recordAttempt, {
        deliveryId,
        outcome: "skipped",
        error: "N8N_LOAN_WEBHOOK_URL or N8N_SHARED_SECRET is not set",
      });
      return;
    }

    let error: string | undefined;
    try {
      const signature = await signRequest(secret, "POST", new URL(url).pathname, delivery.payload);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-LendLoop-Event-Id": delivery.eventId, ...signature },
        body: delivery.payload,
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));
      if (!response.ok) error = `n8n answered HTTP ${response.status}`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    await ctx.runMutation(internal.webhooks.recordAttempt, {
      deliveryId,
      outcome: error ? "retry" : "delivered",
      error,
    });
  },
});

/** Admins can push a failed event back into the queue once n8n is healthy again. */
export const retryFailed = mutation({
  args: { deliveryId: v.id("webhookDeliveries") },
  handler: async (ctx, { deliveryId }) => {
    await requireAdmin(ctx);
    const delivery = await ctx.db.get(deliveryId);
    if (!delivery || (delivery.status !== "failed" && delivery.status !== "skipped")) return;
    await ctx.db.patch(deliveryId, { status: "pending", attempts: 0 });
    await ctx.scheduler.runAfter(0, internal.webhooks.deliver, { deliveryId });
  },
});
