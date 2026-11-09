"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { LoanCard } from "@/components/LoanCard";
import { EmptyState, Loading, PageHeader } from "@/components/ui";

export default function IncomingRequestsPage() {
  const loans = useQuery(api.loans.incoming);
  const pending = loans?.filter((l) => l.status === "requested") ?? [];
  const rest = loans?.filter((l) => l.status !== "requested") ?? [];

  return (
    <div>
      <PageHeader title="Incoming requests" subtitle="Neighbors who want to borrow your tools." />
      {loans === undefined ? (
        <Loading />
      ) : loans.length === 0 ? (
        <EmptyState title="No requests yet">When someone asks for one of your tools, it shows up here.</EmptyState>
      ) : (
        <div className="space-y-8">
          {pending.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">Waiting for you</h2>
              <ul className="space-y-3">
                {pending.map((loan) => (
                  <li key={loan._id}>
                    <LoanCard loan={loan} perspective="owner" />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {rest.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">History</h2>
              <ul className="space-y-3">
                {rest.map((loan) => (
                  <li key={loan._id}>
                    <LoanCard loan={loan} perspective="owner" />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
