import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalMessage, signRequest, verifyRequest } from "../convex/lib/hmac";

const SECRET = "test-secret-0123456789";
const NOW = 1_800_000_000_000;

/** Exactly what the n8n Code nodes do (node:crypto). */
function n8nSign(method: string, path: string, body: string, nowMs = NOW) {
  const timestamp = Math.floor(nowMs / 1000).toString();
  const hex = createHmac("sha256", SECRET).update(`${timestamp}.${method}.${path}.${body}`).digest("hex");
  return { timestamp, signature: `sha256=${hex}` };
}

describe("HMAC signing shared by Convex and n8n", () => {
  const body = JSON.stringify({ loanId: "abc", date: "2026-11-09", status: "sent" });

  it("Convex (Web Crypto) and n8n (node:crypto) produce the same signature", async () => {
    const convex = await signRequest(SECRET, "POST", "/n8n/reminder-status", body, NOW);
    const n8n = n8nSign("POST", "/n8n/reminder-status", body);
    expect(convex["X-LendLoop-Signature"]).toBe(n8n.signature);
    expect(convex["X-LendLoop-Timestamp"]).toBe(n8n.timestamp);
  });

  it("accepts a request signed by n8n", async () => {
    const h = n8nSign("POST", "/n8n/reminder-status", body);
    await expect(verifyRequest(SECRET, h, "POST", "/n8n/reminder-status", body, NOW)).resolves.toEqual({ ok: true });
  });

  it("rejects a tampered body", async () => {
    const h = n8nSign("POST", "/n8n/reminder-status", body);
    const result = await verifyRequest(SECRET, h, "POST", "/n8n/reminder-status", body.replace("sent", "failed"), NOW);
    expect(result.ok).toBe(false);
  });

  it("rejects a signature replayed against another endpoint", async () => {
    const h = n8nSign("POST", "/n8n/reminder-status", body);
    const result = await verifyRequest(SECRET, h, "POST", "/n8n/notification-status", body, NOW);
    expect(result.ok).toBe(false);
  });

  it("rejects old timestamps (replay window is 5 minutes)", async () => {
    const h = n8nSign("POST", "/n8n/reminder-status", body, NOW - 6 * 60_000);
    const result = await verifyRequest(SECRET, h, "POST", "/n8n/reminder-status", body, NOW);
    expect(result).toEqual({ ok: false, reason: "timestamp outside allowed window" });
  });

  it("rejects requests when the server has no secret configured", async () => {
    const h = n8nSign("GET", "/n8n/overdue-loans", "");
    const result = await verifyRequest(undefined, h, "GET", "/n8n/overdue-loans", "", NOW);
    expect(result.ok).toBe(false);
  });

  it("includes method and path in the signed message", () => {
    expect(canonicalMessage("1", "get", "/x", "")).toBe("1.GET./x.");
  });
});
