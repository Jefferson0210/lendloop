"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { formatDay, LOAN_STATUS_LABELS, errorMessage, timeAgo } from "@/lib/format";
import { Badge, Button, Card, ErrorText } from "./ui";

export type Loan = FunctionReturnType<typeof api.loans.myRequests>[number];
type Perspective = "borrower" | "owner" | "admin";

const STATUS_TONE = {
  requested: "blue",
  approved: "green",
  rejected: "neutral",
  cancelled: "neutral",
  returned: "neutral",
} as const;

function activityText(a: Loan["activity"][number]) {
  const what = a.kind === "overdue_reminder" ? "Reminder" : "Notification";
  return `${what} ${a.status === "sent" ? "sent" : "failed"}${a.channel ? ` via ${a.channel}` : ""} ${timeAgo(a.at)}`;
}

export function LoanCard({ loan, perspective }: { loan: Loan; perspective: Perspective }) {
  const approve = useMutation(api.loans.approve);
  const reject = useMutation(api.loans.reject);
  const cancel = useMutation(api.loans.cancel);
  const markReturned = useMutation(api.loans.markReturned);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const counterpart =
    perspective === "borrower"
      ? `from ${loan.owner.name}${loan.owner.trusted ? " ★" : ""}`
      : perspective === "owner"
        ? `requested by ${loan.borrower.name}`
        : `${loan.borrower.name} ← ${loan.owner.name}`;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-stone-900">{loan.toolName}</h3>
          <p className="text-sm text-stone-600">
            {formatDay(loan.startDate)} – {formatDay(loan.endDate)} · {counterpart}
          </p>
        </div>
        <div className="flex gap-2">
          {loan.overdue && <Badge tone="red">Overdue</Badge>}
          <Badge tone={STATUS_TONE[loan.status]}>{LOAN_STATUS_LABELS[loan.status]}</Badge>
        </div>
      </div>

      {loan.activity.length > 0 && (
        <ul className="mt-3 space-y-0.5 border-l-2 border-stone-200 pl-3 text-xs text-stone-500">
          {loan.activity.map((a, i) => (
            <li key={i}>{activityText(a)}</li>
          ))}
        </ul>
      )}

      {perspective !== "admin" && (
        <div className="mt-4 flex flex-wrap gap-2">
          {perspective === "owner" && loan.status === "requested" && (
            <>
              <Button disabled={busy} onClick={() => run(() => approve({ loanId: loan._id }))}>
                Approve
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => run(() => reject({ loanId: loan._id }))}>
                Decline
              </Button>
            </>
          )}
          {perspective === "borrower" && loan.status === "requested" && (
            <Button variant="secondary" disabled={busy} onClick={() => run(() => cancel({ loanId: loan._id }))}>
              Cancel request
            </Button>
          )}
          {loan.status === "approved" && (
            <Button variant="secondary" disabled={busy} onClick={() => run(() => markReturned({ loanId: loan._id }))}>
              Mark as returned
            </Button>
          )}
        </div>
      )}
      <div className="mt-2">
        <ErrorText message={error} />
      </div>
    </Card>
  );
}
