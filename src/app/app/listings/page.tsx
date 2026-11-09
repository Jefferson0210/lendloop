"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { CATEGORIES, CONDITIONS, LIMITS, type Category, type Condition } from "../../../../convex/lib/validators";
import { Badge, Button, Card, EmptyState, ErrorText, Field, inputClass, Loading, PageHeader } from "@/components/ui";
import { CATEGORY_ICONS, CATEGORY_LABELS, CONDITION_LABELS, errorMessage } from "@/lib/format";

type Draft = { name: string; category: Category; condition: Condition; description: string };
const EMPTY: Draft = { name: "", category: "power_tools", condition: "good", description: "" };

export default function ListingsPage() {
  const listings = useQuery(api.tools.myListings);
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <PageHeader
        title="My listings"
        subtitle="Tools you are willing to lend."
        action={!creating && <Button onClick={() => setCreating(true)}>+ List a tool</Button>}
      />
      {creating && (
        <Card className="mb-6">
          <ToolForm onDone={() => setCreating(false)} />
        </Card>
      )}
      {listings === undefined ? (
        <Loading />
      ) : listings.length === 0 ? (
        !creating && <EmptyState title="You haven't listed anything yet">Your drill could save a neighbor a trip to the store.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {listings.map((tool) => (
            <li key={tool._id}>
              <ListingRow tool={tool} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ListingRow({ tool }: { tool: Doc<"tools"> & { status: "available" | "on_loan"; pendingRequests: number } }) {
  const remove = useMutation(api.tools.remove);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (editing) {
    return (
      <Card>
        <ToolForm tool={tool} onDone={() => setEditing(false)} />
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-stone-500">
            {CATEGORY_ICONS[tool.category]} {CATEGORY_LABELS[tool.category]} · {CONDITION_LABELS[tool.condition]}
          </p>
          <h3 className="font-semibold text-stone-900">{tool.name}</h3>
          <p className="mt-1 text-sm text-stone-600">{tool.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tool.status === "available" ? <Badge tone="green">Available</Badge> : <Badge tone="amber">On loan</Badge>}
          {tool.pendingRequests > 0 && <Badge tone="blue">{tool.pendingRequests} pending</Badge>}
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="secondary" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button
          variant="danger"
          onClick={async () => {
            if (!confirm(`Delete “${tool.name}”? Pending requests will be cancelled.`)) return;
            setError(null);
            try {
              await remove({ toolId: tool._id });
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          Delete
        </Button>
      </div>
      <div className="mt-2">
        <ErrorText message={error} />
      </div>
    </Card>
  );
}

function ToolForm({ tool, onDone }: { tool?: Doc<"tools">; onDone: () => void }) {
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const [draft, setDraft] = useState<Draft>(
    tool ? { name: tool.name, category: tool.category, condition: tool.condition, description: tool.description } : EMPTY,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          if (tool) await update({ toolId: tool._id, ...draft });
          else await create(draft);
          onDone();
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 className="font-semibold text-stone-900">{tool ? "Edit listing" : "List a tool"}</h3>
      <Field label="Name">
        <input className={inputClass} value={draft.name} maxLength={LIMITS.toolName} onChange={(e) => set("name", e.target.value)} placeholder="Cordless drill" required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category">
          <select className={inputClass} value={draft.category} onChange={(e) => set("category", e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Condition">
          <select className={inputClass} value={draft.condition} onChange={(e) => set("condition", e.target.value as Condition)}>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {CONDITION_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Short description" hint={`${draft.description.length}/${LIMITS.description}`}>
        <textarea
          className={`${inputClass} min-h-24`}
          value={draft.description}
          maxLength={LIMITS.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="18V, two batteries and a bit set. Please return it charged."
          required
        />
      </Field>
      <ErrorText message={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : tool ? "Save changes" : "Publish listing"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
