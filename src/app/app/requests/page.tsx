"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { LoanCard } from "@/components/LoanCard";
import { EmptyState, Loading, PageHeader } from "@/components/ui";

export default function MyRequestsPage() {
  const loans = useQuery(api.loans.myRequests);
  return (
    <div>
      <PageHeader title="My requests" subtitle="Tools you asked to borrow, and loans you have open." />
      {loans === undefined ? (
        <Loading />
      ) : loans.length === 0 ? (
        <EmptyState title="No requests yet">Find something you need under “Browse tools”.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {loans.map((loan) => (
            <li key={loan._id}>
              <LoanCard loan={loan} perspective="borrower" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
