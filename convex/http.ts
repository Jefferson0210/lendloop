import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction, type ActionCtx } from "./_generated/server";
import { todayUtc, isValidDay } from "./lib/dates";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifyRequest } from "./lib/hmac";
import { notificationKey, reminderKey } from "./lib/keys";

/**
 * Endpoints for n8n. Every request must be signed with HMAC-SHA256 using the
 * shared secret (N8N_SHARED_SECRET); see lib/hmac.ts for the format.
 * Responses never include more personal data than the workflow needs.
 */

const http = httpRouter();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type Handler = (ctx: ActionCtx, body: string, request: Request) => Promise<Response>;

/** Wraps a handler with signature verification. Unsigned or tampered requests get 401. */
function signed(handler: Handler) {
  return httpAction(async (ctx, request) => {
    const body = await request.text();
    const path = new URL(request.url).pathname;
    const check = await verifyRequest(
      process.env.N8N_SHARED_SECRET,
      {
        timestamp: request.headers.get(TIMESTAMP_HEADER),
        signature: request.headers.get(SIGNATURE_HEADER),
      },
      request.method,
      path,
      body,
    );
    if (!check.ok) {
      console.warn(`Rejected n8n call to ${path}: ${check.reason}`);
      return json({ error: "invalid signature" }, 401);
    }
    return handler(ctx, body, request);
  });
}

function parse<T>(body: string): T | null {
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}

/** n8n daily workflow: which loans need a reminder today. */
http.route({
  path: "/n8n/overdue-loans",
  method: "GET",
  handler: signed(async (ctx) => {
    const today = todayUtc();
    const loans = await ctx.runQuery(internal.automation.overdueLoans, { today });
    return json({ date: today, loans });
  }),
});

/** n8n daily workflow reports each reminder. Key = loan + day, so retries are no-ops. */
http.route({
  path: "/n8n/reminder-status",
  method: "POST",
  handler: signed(async (ctx, body) => {
    const data = parse<{ loanId?: string; date?: string; status?: string; channel?: string; detail?: string }>(body);
    if (!data?.loanId || !data.date || !isValidDay(data.date) || (data.status !== "sent" && data.status !== "failed")) {
      return json({ error: "expected { loanId, date: YYYY-MM-DD, status: sent|failed }" }, 400);
    }
    const res = await ctx.runMutation(internal.automation.recordEvent, {
      idempotencyKey: reminderKey(data.loanId, data.date),
      loanId: data.loanId,
      kind: "overdue_reminder",
      status: data.status,
      channel: data.channel,
      detail: data.detail,
    });
    return json(res, res.result === "unknown_loan" ? 404 : 200);
  }),
});

/** n8n notification workflow reports the outcome of each event it handled. */
http.route({
  path: "/n8n/notification-status",
  method: "POST",
  handler: signed(async (ctx, body) => {
    const data = parse<{ eventId?: string; loanId?: string; status?: string; channel?: string; detail?: string }>(body);
    if (!data?.eventId || !data.loanId || (data.status !== "sent" && data.status !== "failed")) {
      return json({ error: "expected { eventId, loanId, status: sent|failed }" }, 400);
    }
    const res = await ctx.runMutation(internal.automation.recordEvent, {
      idempotencyKey: notificationKey(data.eventId),
      loanId: data.loanId,
      kind: "request_notification",
      status: data.status,
      channel: data.channel,
      detail: data.detail,
    });
    return json(res, res.result === "unknown_loan" ? 404 : 200);
  }),
});

/** n8n error workflow: makes failed executions visible in the admin dashboard. */
http.route({
  path: "/n8n/automation-error",
  method: "POST",
  handler: signed(async (ctx, body) => {
    const data = parse<{ workflow?: string; node?: string; message?: string; executionId?: string }>(body);
    if (!data?.workflow || !data.message) {
      return json({ error: "expected { workflow, message }" }, 400);
    }
    await ctx.runMutation(internal.automation.recordError, {
      workflow: data.workflow,
      node: data.node,
      message: data.message,
      executionId: data.executionId,
    });
    return json({ result: "recorded" });
  }),
});

export default http;
