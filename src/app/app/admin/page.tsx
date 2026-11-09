"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { LoanCard } from "@/components/LoanCard";
import { Badge, Button, Card, EmptyState, ErrorText, Loading, PageHeader } from "@/components/ui";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { CATEGORY_LABELS, errorMessage, timeAgo } from "@/lib/format";

export default function AdminPage() {
  const me = useCurrentUser();
  if (me === undefined) return <Loading />;
  if (me?.role !== "admin") return <EmptyState title="Admins only" />;
  return (
    <div className="space-y-10">
      <PageHeader title="Admin" subtitle="Moderate listings, review loans and keep an eye on automations." />
      <AutomationHealth />
      <Members />
      <AllListings />
      <AllLoans />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-stone-900">{title}</h2>
      {children}
    </section>
  );
}

function AutomationHealth() {
  const health = useQuery(api.admin.automationHealth);
  const retry = useMutation(api.webhooks.retryFailed);
  if (health === undefined) return <Loading />;
  const clean = health.deliveries.length === 0 && health.errors.length === 0;
  return (
    <Section title="Automation health">
      <Card>
        <p className="text-sm text-stone-600">
          {health.pendingCount} webhook event(s) in the retry queue.
          {clean && " No failures. ✓"}
        </p>
        {health.deliveries.length > 0 && (
          <ul className="mt-3 divide-y divide-stone-100 text-sm">
            {health.deliveries.map((d) => (
              <li key={d._id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <Badge tone={d.status === "failed" ? "red" : "amber"}>{d.status}</Badge>{" "}
                  <span className="font-mono text-xs">{d.type}</span> · {d.attempts} attempt(s) · {timeAgo(d.createdAt)}
                  {d.lastError && <span className="block text-xs text-stone-500">{d.lastError}</span>}
                </span>
                <Button variant="secondary" onClick={() => retry({ deliveryId: d._id })}>
                  Retry
                </Button>
              </li>
            ))}
          </ul>
        )}
        {health.errors.length > 0 && (
          <ul className="mt-3 divide-y divide-stone-100 text-sm">
            {health.errors.map((e) => (
              <li key={e._id} className="py-2">
                <Badge tone="red">n8n error</Badge> <span className="font-medium">{e.workflow}</span>
                {e.node && <span className="text-stone-500"> · {e.node}</span>} · {timeAgo(e.occurredAt)}
                <span className="block text-xs text-stone-500">{e.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Section>
  );
}

function Members() {
  const users = useQuery(api.admin.users);
  const setTrusted = useMutation(api.admin.setTrustedLender);
  if (users === undefined) return <Loading />;
  return (
    <Section title="Members">
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Completed loans</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {users.map((u) => (
              <tr key={u._id}>
                <td className="px-4 py-2 font-medium">
                  {u.name} {u.trustedLender && <span className="text-emerald-700">★</span>}
                </td>
                <td className="px-4 py-2 text-stone-600">{u.email ?? "—"}</td>
                <td className="px-4 py-2">{u.role}</td>
                <td className="px-4 py-2">{u.completedLoans}</td>
                <td className="px-4 py-2 text-right">
                  <Button variant="secondary" onClick={() => setTrusted({ userId: u._id, trusted: !u.trustedLender })}>
                    {u.trustedLender ? "Remove trusted" : "Mark trusted lender"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </Section>
  );
}

function AllListings() {
  const tools = useQuery(api.tools.list, {});
  const remove = useMutation(api.tools.remove);
  const [error, setError] = useState<string | null>(null);
  if (tools === undefined) return <Loading />;
  return (
    <Section title="All listings">
      <ErrorText message={error} />
      {tools.length === 0 ? (
        <EmptyState title="No listings" />
      ) : (
        <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
          {tools.map((t) => (
            <li key={t._id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span>
                <span className="font-medium">{t.name}</span>{" "}
                <span className="text-stone-500">
                  · {CATEGORY_LABELS[t.category]} · by {t.isMine ? "you" : t.owner.name}
                </span>
              </span>
              <Button
                variant="danger"
                onClick={async () => {
                  if (!confirm(`Remove “${t.name}”? Open requests and loans on it will be cancelled.`)) return;
                  setError(null);
                  try {
                    await remove({ toolId: t._id });
                  } catch (err) {
                    setError(errorMessage(err));
                  }
                }}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function AllLoans() {
  const loans = useQuery(api.loans.all);
  if (loans === undefined) return <Loading />;
  return (
    <Section title="All loans">
      {loans.length === 0 ? (
        <EmptyState title="No loans yet" />
      ) : (
        <ul className="space-y-3">
          {loans.map((loan) => (
            <li key={loan._id}>
              <LoanCard loan={loan} perspective="admin" />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
