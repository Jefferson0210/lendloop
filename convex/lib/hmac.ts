/**
 * HMAC-SHA256 signing shared by both directions of the n8n integration.
 *
 * Signed message: `${timestamp}.${METHOD}.${path}.${rawBody}`
 * Headers:        X-LendLoop-Timestamp (unix seconds), X-LendLoop-Signature (sha256=<hex>)
 *
 * Including the timestamp, method and path means a captured signature cannot be
 * replayed later or against a different endpoint. Uses Web Crypto, which the
 * default Convex runtime provides.
 */

export const SIGNATURE_HEADER = "X-LendLoop-Signature";
export const TIMESTAMP_HEADER = "X-LendLoop-Timestamp";
export const MAX_SKEW_SECONDS = 300;

const encoder = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function canonicalMessage(timestamp: string, method: string, path: string, body: string) {
  return `${timestamp}.${method.toUpperCase()}.${path}.${body}`;
}

export async function signRequest(
  secret: string,
  method: string,
  path: string,
  body: string,
  now: number = Date.now(),
): Promise<Record<string, string>> {
  const timestamp = Math.floor(now / 1000).toString();
  const hex = await hmacHex(secret, canonicalMessage(timestamp, method, path, body));
  return { [TIMESTAMP_HEADER]: timestamp, [SIGNATURE_HEADER]: `sha256=${hex}` };
}

/** Constant-time comparison so the check does not leak how many characters matched. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export async function verifyRequest(
  secret: string | undefined,
  headers: { timestamp: string | null; signature: string | null },
  method: string,
  path: string,
  body: string,
  now: number = Date.now(),
): Promise<VerifyResult> {
  if (!secret) return { ok: false, reason: "server is missing N8N_SHARED_SECRET" };
  const { timestamp, signature } = headers;
  if (!timestamp || !signature) return { ok: false, reason: "missing signature headers" };
  const ts = Number(timestamp);
  if (!Number.isInteger(ts)) return { ok: false, reason: "bad timestamp" };
  if (Math.abs(Math.floor(now / 1000) - ts) > MAX_SKEW_SECONDS) {
    return { ok: false, reason: "timestamp outside allowed window" };
  }
  const expected = `sha256=${await hmacHex(secret, canonicalMessage(timestamp, method, path, body))}`;
  return timingSafeEqual(expected, signature) ? { ok: true } : { ok: false, reason: "bad signature" };
}
