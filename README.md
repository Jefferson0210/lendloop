# LendLoop

**Borrow what you need. Lend what you don't.**

A neighborhood tool-lending board. Neighbors list tools they are willing to lend, request each
other's tools for a date range, and get automatic notifications and overdue reminders through n8n.

| Layer | Choice |
|---|---|
| App | Next.js 16 (App Router), TypeScript, Tailwind CSS |
| Auth | Clerk |
| Data and backend logic | Convex (queries, mutations, scheduled actions, HTTP actions) |
| Automation | n8n (self-hosted with Docker) |
| Tests | Vitest |

---

## Architecture

```
 Browser (Next.js + Clerk)
   │  Convex React client, authenticated with the Clerk JWT ("convex" template)
   ▼
 Convex ── queries/mutations ── every permission check happens here (convex/lib/auth.ts)
   │
   │ 1. A loan changes ──► outbox row (webhookDeliveries) in the SAME transaction
   │                       └─► scheduled action signs + POSTs it to n8n, retries with backoff
   ▼
 n8n "Loan request notification"   (webhook, HMAC verified)
   ├─ notifies the right person (mock log; swap for email/Slack)
   └─ signed POST /n8n/notification-status ──► Convex records it (idempotent)

 n8n "Daily overdue reminders"     (schedule, 09:00 UTC)
   ├─ signed GET  /n8n/overdue-loans      ──► Convex returns only what is needed
   ├─ sends each reminder (mock log)
   └─ signed POST /n8n/reminder-status   ──► Convex records it (idempotent per loan+day)

 n8n "Error handler"               (error workflow of both)
   └─ signed POST /n8n/automation-error  ──► visible to admins in the app
```

Key files:

| Path | What it does |
|---|---|
| `convex/schema.ts` | Tables: users, tools, loans, webhookDeliveries (outbox), automationEvents, automationErrors |
| `convex/lib/auth.ts` | `requireUser` / `requireAdmin`: the server-side authorization helpers |
| `convex/tools.ts`, `convex/loans.ts` | Listings and the loan lifecycle, each mutation checks ownership/role |
| `convex/lib/outbox.ts`, `convex/webhooks.ts` | Outbox + delivery to n8n with retries |
| `convex/http.ts` | Signed HTTP endpoints that n8n calls |
| `convex/lib/hmac.ts` | HMAC-SHA256 sign/verify (shared format with the n8n Code nodes) |
| `n8n/workflows/*.json` | Exported n8n workflows (no secrets inside) |
| `docker-compose.yml` | Local n8n |
| `tests/` | Unit tests, including Convex ⇄ n8n signature compatibility |

---

## Local setup

### Prerequisites
- Node.js 20.9+ and npm
- Docker Desktop (for n8n)
- A free [Clerk](https://clerk.com) account

### 1. Install
```bash
npm install
```

### 2. Clerk
1. Create an application in the Clerk dashboard (email + Google is fine).
2. **Configure → Integrations → Convex → Activate**. This creates the `convex` JWT template that
   Convex verifies. Copy the **Frontend API URL** it shows (e.g. `https://xxx.clerk.accounts.dev`).
   (If your dashboard has no Convex integration, create a JWT template named exactly `convex` under
   **Configure → JWT templates** using the Convex preset.)
3. **API keys**: the quickest way is the Clerk CLI, which writes both keys into `.env.local`:
   ```bash
   npx clerk@latest link       # sign in and pick the app / Development instance
   npx clerk@latest env pull
   ```
   Or copy the publishable and secret keys from the dashboard into `.env.local`:
   ```bash
   cp .env.example .env.local
   # NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   # CLERK_SECRET_KEY=sk_test_...
   ```

### 3. Convex
The easiest path runs the Convex backend locally, so n8n (also local) can reach it:
```bash
npx convex dev --local        # keep it running; writes CONVEX_* to .env.local
```
In a second terminal, set the backend environment (these live in Convex, not in `.env.local`):
```bash
SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-app>.clerk.accounts.dev
npx convex env set N8N_SHARED_SECRET "$SECRET"
npx convex env set N8N_LOAN_WEBHOOK_URL http://localhost:5678/webhook/lendloop-loan-event
npx convex env set ADMIN_EMAILS you@example.com     # optional: these emails sign up as admin
echo "$SECRET"   # you need the same value for n8n below
```
> Using a Convex cloud deployment instead (`npx convex dev`) works too, but then n8n must be
> reachable from the internet (n8n Cloud or a tunnel) and `LENDLOOP_CONVEX_SITE_URL` must be your
> `https://<deployment>.convex.site` URL.

### 4. n8n
```bash
cp n8n/.env.example n8n/.env      # set LENDLOOP_SHARED_SECRET to the same $SECRET
docker compose up -d
docker compose exec n8n n8n import:workflow --separate --input=/workflows
```
Open http://localhost:5678, create the local owner account, then open each workflow and
**activate** the two LendLoop workflows (the error handler runs automatically when they fail).

### 5. Run the app
```bash
npm run dev                       # http://localhost:3000
```
Sign in, list a tool, and request it from a second account (an incognito window works).
To make an existing user an admin later:
```bash
npx convex run admin:setRole '{"email":"you@example.com","role":"admin"}'
```

### Trying the automations
- **Notifications**: request a tool from a second account, then approve it. Each step creates an
  execution of *Loan request notification* in n8n (the mock message is in its output), and the loan
  card shows "Notification sent via mock-log".
- **Overdue reminders** without waiting for a due date:
  ```bash
  npx convex run devtools:makeOverdue '{"loanId":"<approved loan id>","daysLate":2}'
  ```
  then open *Daily overdue reminders* in n8n and click **Execute workflow** (it has a manual trigger
  next to the daily schedule). The loan card shows "Reminder sent via mock-log", and running it again
  the same day sends nothing new.
- **Failure handling**: stop Convex or n8n and repeat an action. Undelivered webhooks retry with
  backoff and, if they keep failing, appear under *Admin → Automation health*.

### Tests and checks
```bash
npm test          # unit tests (HMAC compatibility with n8n, date logic)
npm run typecheck
npm run lint
npm run e2e       # end-to-end, needs the local stack running (see below)
```

`npm run e2e` (`scripts/e2e.mjs`) exercises the real stack with no browser: it creates two Clerk
test users (development instance, `+clerk_test` emails), gets Convex tokens for them through the
Clerk Backend API and then lists a tool, requests and approves it, waits for both n8n
notifications to be written back, makes the loan overdue, runs the reminder workflow twice to
prove it does not duplicate, checks the permission rules (edit/delete/approve/admin-only) and
cleans up the test users. Last run: 19/19 checks passed.

---

## Environment variables

| Where | Variable | Purpose |
|---|---|---|
| `.env.local` | `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOYMENT` | Written by `npx convex dev` |
| `.env.local` | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk keys |
| Convex env | `CLERK_JWT_ISSUER_DOMAIN` | Clerk Frontend API URL, used to verify JWTs |
| Convex env | `N8N_SHARED_SECRET` | HMAC secret shared with n8n |
| Convex env | `N8N_LOAN_WEBHOOK_URL` | n8n production webhook URL |
| Convex env | `ADMIN_EMAILS` | Optional comma-separated list of admin emails |
| `n8n/.env` | `LENDLOOP_SHARED_SECRET` | Same value as `N8N_SHARED_SECRET` |
| `n8n/.env` | `LENDLOOP_CONVEX_SITE_URL` | Convex HTTP actions URL as seen from the container |

All real values are git-ignored; only the `.env.example` files are committed.

---

## Roles and access control

Rules are enforced **in Convex functions**, not only in the UI. The UI hides buttons, but every
mutation re-checks who is calling (`convex/lib/auth.ts`):

| Action | Who |
|---|---|
| See the public list (name + category only) | Anyone, no sign-in |
| Browse all tools with availability, request a loan | Signed-in users |
| Edit a listing | Its owner only |
| Delete a listing | Its owner (if not lent out), or an admin |
| Approve / decline a request | Owner of the tool only |
| Cancel a request | The borrower who made it |
| Mark a loan as returned | Owner or borrower of that loan |
| See all loans, mark a "Trusted lender", see automation failures, retry webhooks | Admin |

Roles are never accepted from the client: new users are `user` unless their email is in
`ADMIN_EMAILS`, and roles can be changed with an internal mutation only reachable from the CLI.

---

## Automation design

**Convex → n8n (request notifications).** Each loan change writes an event to an outbox table in the
same transaction, so an event is sent if and only if the change committed. A scheduled action signs
and delivers it, retrying with backoff (10 s, 1 min, 5 min, 30 min, 2 h). After the last attempt the
event is marked `failed` and shows up in the admin dashboard with a Retry button. Delivery is
*at least once*: every event has an `eventId`, and the n8n workflow remembers handled ids so a
retried delivery never notifies twice.

**n8n → Convex (overdue reminders and status write-backs).** The daily workflow fetches overdue
loans from a signed endpoint, reminds each borrower and records the result. Write-backs are
idempotent by key (`reminder:<loanId>:<date>`, `notify:<eventId>`), and the overdue endpoint skips
loans already reminded today, so re-running the workflow or retrying an HTTP call never creates
duplicate records or duplicate reminders.

**Failures are visible.** HTTP nodes retry three times. If an execution still fails, the
*Error handler* workflow logs it and reports it to Convex, and admins see it under
*Admin → Automation health*. Failed webhook deliveries appear there too.

**Signing.** Both directions use HMAC-SHA256 over `timestamp.METHOD.path.rawBody`, sent in
`X-LendLoop-Timestamp` and `X-LendLoop-Signature`. Including the method and path prevents a
signature from being reused against another endpoint, and a 5-minute window limits replay.
Verification uses a constant-time comparison, and n8n checks the raw body (Webhook "Raw body"
option), not a re-serialized copy. `tests/hmac.test.ts` checks that Convex (Web Crypto) and the n8n
Code nodes (`node:crypto`) produce identical signatures.

**Secrets.** The shared secret lives in Convex environment variables and in n8n's container
environment, read with `$env` in the Code nodes. It never appears in code or in the exported
workflow JSON. (n8n credentials cannot be read from a Code node, which is why the secret is an
env var; `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` enables that.)

---

## Security and data minimization

- **Public page** returns only tool name and category, for tools available today. No owner data.
- **Signed-in users** see other members by first name only. Emails are never sent to the browser
  except to admins.
- **Webhook payloads** carry only what the message needs: event type, tool name, dates, status,
  and the recipient's first name and email. Overdue responses contain the same minimal fields.
- **Inputs are validated server-side**: lengths, enums, valid dates, start not in the past,
  maximum loan length (30 days), no double booking, no borrowing your own tool.
- **Loans keep a snapshot of the tool name**, so history stays readable after a listing is deleted.
- Notification delivery is a mock log line in this demo; it logs only first name, email and the
  message text.

---

## What I would change for production

- **Real delivery channel**: replace the mock Code nodes with Email (SMTP/SendGrid) or Slack nodes,
  with credentials stored as n8n credentials.
- **Hosting**: Convex cloud + n8n Cloud (or n8n behind HTTPS on a VM), and set
  `LENDLOOP_CONVEX_SITE_URL` to the `.convex.site` URL. Never expose n8n over plain HTTP.
- **Durable dedup in n8n**: workflow static data is fine for a demo; in production I would let Convex
  be the single source of truth (check `notify:<eventId>` before sending) or use a Redis/DB node.
- **Secret rotation**: support two active secrets during rotation (verify against either).
- **Observability**: ship Convex and n8n logs to Datadog/Sentry, alert on `failed` deliveries and on
  any `automationErrors` row; add metrics for retry counts.
- **Time zones**: dates are treated as UTC calendar days; store each neighborhood's time zone and run
  reminders at a local hour.
- **Abuse limits**: rate-limit requests per user, add reporting/blocking, and paginate large lists.
- **Privacy**: a retention policy for old loans and automation logs, and account deletion that removes
  personal data.
- **More tests**: Convex function tests with `convex-test` for every permission rule, and run the
  end-to-end script in CI against a preview deployment.

---

## Notes

Built with AI assistance, which the take-home explicitly allows. LendLoop is a fictional company
created for this exercise.
