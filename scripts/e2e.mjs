#!/usr/bin/env node
/**
 * End-to-end check of LendLoop against a running local stack:
 *   npx convex dev --local   +   docker compose up -d   (workflows imported and published)
 *
 * It creates two Clerk TEST users (development instance only, "+clerk_test" emails),
 * signs in as each of them through Clerk's Backend API, and drives the real Convex
 * functions: list a tool, request it, approve it, wait for the n8n notifications to
 * be written back, make the loan overdue, run the reminder workflow twice (to prove
 * idempotency) and check that the permission rules are enforced on the server.
 *
 *   npm run e2e
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { anyApi as api } from "convex/server";

// ---------------------------------------------------------------- setup

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const CLERK = "https://api.clerk.com/v1";
const SECRET = env.CLERK_SECRET_KEY;
const CONVEX_URL = env.NEXT_PUBLIC_CONVEX_URL;
if (!SECRET?.startsWith("sk_test_")) throw new Error("e2e needs a Clerk *development* secret key in .env.local");
if (!CONVEX_URL) throw new Error("NEXT_PUBLIC_CONVEX_URL missing; is `npx convex dev` running?");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(label, ok, extra = "") {
  console.log(`${ok ? "✔" : "✖"} ${label}${extra ? `  (${extra})` : ""}`);
  if (!ok) failures++;
}
async function clerk(path, options = {}) {
  const res = await fetch(`${CLERK}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json", ...options.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Clerk ${path} -> ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}
async function expectError(label, promise, code) {
  try {
    await promise;
    check(label, false, "expected an error");
  } catch (e) {
    const got = e?.data?.code ?? e?.message;
    check(label, code ? got === code : true, String(got));
  }
}
function sh(cmd) {
  return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, MSYS_NO_PATHCONV: "1" } }).toString();
}

/** A Clerk test user with a fresh Convex-scoped JWT for every call. */
async function testUser(firstName) {
  const email = `lendloop-e2e-${firstName.toLowerCase()}+clerk_test@example.com`;
  const existing = await clerk(`/users?email_address=${encodeURIComponent(email)}`);
  const user = existing[0] ?? (await clerk("/users", {
    method: "POST",
    body: JSON.stringify({ email_address: [email], first_name: firstName, skip_password_requirement: true }),
  }));
  const session = await clerk("/sessions", { method: "POST", body: JSON.stringify({ user_id: user.id }) });
  const client = new ConvexHttpClient(CONVEX_URL);
  return {
    clerkId: user.id,
    sessionId: session.id,
    async as() {
      const { jwt } = await clerk(`/sessions/${session.id}/tokens/convex`, { method: "POST" });
      client.setAuth(jwt);
      return client;
    },
  };
}

async function waitFor(label, fn, timeoutMs = 45_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await fn();
    if (value) return value;
    await sleep(1500);
  }
  check(label, false, "timed out");
  return null;
}

// ---------------------------------------------------------------- run

const today = new Date().toISOString().slice(0, 10);
const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

console.log("Creating Clerk test users…");
const olivia = await testUser("Olivia"); // owner
const ben = await testUser("Ben"); // borrower
await (await olivia.as()).mutation(api.users.store, {});
await (await ben.as()).mutation(api.users.store, {});

console.log("\nPublic page");
const anon = new ConvexHttpClient(CONVEX_URL);
const toolId = await (await olivia.as()).mutation(api.tools.create, {
  name: `E2E ladder ${Date.now() % 10000}`,
  category: "hand_tools",
  condition: "good",
  description: "Created by scripts/e2e.mjs",
});
const publicList = await anon.query(api.tools.listPublic, {});
const publicRow = publicList.find((t) => t._id === toolId);
check("anonymous visitors see the new tool", Boolean(publicRow));
check("public rows expose only id, name and category", publicRow && Object.keys(publicRow).sort().join() === "_id,category,name");

console.log("\nPermissions (enforced in Convex)");
await expectError("anonymous user cannot browse the full catalog", anon.query(api.tools.list, {}), "UNAUTHENTICATED");
await expectError("borrower cannot edit someone else's listing",
  (await ben.as()).mutation(api.tools.update, { toolId, name: "hacked", category: "other", condition: "worn", description: "x" }), "FORBIDDEN");
await expectError("borrower cannot delete someone else's listing", (await ben.as()).mutation(api.tools.remove, { toolId }), "FORBIDDEN");
await expectError("owner cannot borrow their own tool",
  (await olivia.as()).mutation(api.loans.request, { toolId, startDate: today, endDate: inDays(1) }), "INVALID");
await expectError("non-admin cannot read all loans", (await ben.as()).query(api.loans.all, {}), "FORBIDDEN");
await expectError("loan cannot start in the past",
  (await ben.as()).mutation(api.loans.request, { toolId, startDate: "2020-01-01", endDate: "2020-01-02" }), "INVALID");

console.log("\nLoan lifecycle + n8n notifications");
const loanId = await (await ben.as()).mutation(api.loans.request, { toolId, startDate: today, endDate: inDays(2) });
check("borrower requested the tool", Boolean(loanId));
await expectError("borrower cannot approve their own request", (await ben.as()).mutation(api.loans.approve, { loanId }), "FORBIDDEN");
await (await olivia.as()).mutation(api.loans.approve, { loanId });
const approved = (await (await ben.as()).query(api.loans.myRequests, {})).find((l) => l._id === loanId);
check("loan is approved", approved?.status === "approved");

const notified = await waitFor("n8n reported both notifications back", async () => {
  const loan = (await (await ben.as()).query(api.loans.myRequests, {})).find((l) => l._id === loanId);
  const sent = loan?.activity.filter((a) => a.kind === "request_notification" && a.status === "sent") ?? [];
  return sent.length >= 2 ? sent : null;
});
if (notified) check("request + approval notifications recorded (via n8n)", true, `${notified.length} events, channel ${notified[0].channel}`);

console.log("\nOverdue reminders + idempotency");
sh(`npx convex run devtools:makeOverdue "{\\"loanId\\":\\"${loanId}\\",\\"daysLate\\":2}"`);
const overdueLoan = (await (await ben.as()).query(api.loans.myRequests, {})).find((l) => l._id === loanId);
check("loan is now overdue", overdueLoan?.overdue === true, `due ${overdueLoan?.endDate}`);

const runReminders = () =>
  sh("docker compose exec -T -e N8N_RUNNERS_BROKER_PORT=5690 -e N8N_PORT=5691 n8n n8n execute --id=LLoopOverdue0001");
const reminderCount = async () =>
  ((await (await ben.as()).query(api.loans.myRequests, {})).find((l) => l._id === loanId)?.activity ?? []).filter(
    (a) => a.kind === "overdue_reminder" && a.status === "sent",
  ).length;

const firstRun = runReminders();
check("reminder workflow run #1 succeeded", /"status":\s*"success"/.test(firstRun));
check("one reminder recorded", (await reminderCount()) === 1);
const secondRun = runReminders();
check("reminder workflow run #2 succeeded", /"status":\s*"success"/.test(secondRun));
check("running it again the same day does not duplicate the reminder", (await reminderCount()) === 1);

console.log("\nWrap up");
await (await olivia.as()).mutation(api.loans.markReturned, { loanId });
const returned = (await (await olivia.as()).query(api.loans.incoming, {})).find((l) => l._id === loanId);
check("owner marked the loan as returned", returned?.status === "returned");
await (await olivia.as()).mutation(api.tools.remove, { toolId });
check("owner deleted the listing", !(await anon.query(api.tools.listPublic, {})).some((t) => t._id === toolId));

for (const u of [olivia, ben]) {
  await clerk(`/sessions/${u.sessionId}/revoke`, { method: "POST" }).catch(() => {});
  await clerk(`/users/${u.clerkId}`, { method: "DELETE" }).catch(() => {});
}
console.log("Removed the Clerk test users.");

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
