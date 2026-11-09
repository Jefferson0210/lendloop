"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CATEGORIES, type Category } from "../../../convex/lib/validators";
import { Badge, Button, Card, EmptyState, ErrorText, Field, inputClass, Loading, PageHeader } from "@/components/ui";
import { CATEGORY_ICONS, CATEGORY_LABELS, CONDITION_LABELS, errorMessage, todayUtc } from "@/lib/format";

export default function BrowsePage() {
  const [category, setCategory] = useState<Category | "all">("all");
  const tools = useQuery(api.tools.list, category === "all" ? {} : { category });

  return (
    <div>
      <PageHeader title="Browse tools" subtitle="Everything your neighbors are willing to lend." />

      <div className="mb-5 flex flex-wrap gap-2">
        {(["all", ...CATEGORIES] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`rounded-full border px-3 py-1 text-sm transition ${
              category === c
                ? "border-emerald-700 bg-emerald-700 text-white"
                : "border-stone-300 bg-white text-stone-700 hover:border-stone-400"
            }`}
          >
            {c === "all" ? "All" : `${CATEGORY_ICONS[c]} ${CATEGORY_LABELS[c]}`}
          </button>
        ))}
      </div>

      {tools === undefined ? (
        <Loading />
      ) : tools.length === 0 ? (
        <EmptyState title="Nothing here yet">Try another category, or list one of your own tools.</EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {tools.map((tool) => (
            <li key={tool._id}>
              <ToolCard tool={tool} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Tool = FunctionReturnType<typeof api.tools.list>[number];

function ToolCard({ tool }: { tool: Tool }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-stone-500">
            {CATEGORY_ICONS[tool.category]} {CATEGORY_LABELS[tool.category]}
          </p>
          <h3 className="mt-0.5 font-semibold text-stone-900">{tool.name}</h3>
        </div>
        {tool.status === "available" ? <Badge tone="green">Available</Badge> : <Badge tone="amber">On loan</Badge>}
      </div>
      <p className="mt-2 flex-1 text-sm text-stone-600">{tool.description}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-500">
        <span>Condition: {CONDITION_LABELS[tool.condition]}</span>
        <span>·</span>
        <span>
          Lent by {tool.isMine ? "you" : tool.owner.name}
          {tool.owner.trusted && <span className="ml-1 text-emerald-700">★ Trusted</span>}
        </span>
      </div>
      {!tool.isMine && (
        <div className="mt-4">
          {open ? (
            <RequestForm toolId={tool._id} onDone={() => setOpen(false)} />
          ) : (
            <Button variant="secondary" onClick={() => setOpen(true)}>
              Request to borrow
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function RequestForm({ toolId, onDone }: { toolId: Id<"tools">; onDone: () => void }) {
  const request = useMutation(api.loans.request);
  const today = todayUtc();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (sent) {
    return <p className="text-sm text-emerald-800">Request sent. You&apos;ll find it under “My requests”.</p>;
  }

  return (
    <form
      className="space-y-3 rounded-lg bg-stone-50 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await request({ toolId, startDate, endDate });
          setSent(true);
          setTimeout(onDone, 2500);
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="From">
          <input type="date" className={inputClass} min={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </Field>
        <Field label="To">
          <input type="date" className={inputClass} min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
        </Field>
      </div>
      <ErrorText message={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send request"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
