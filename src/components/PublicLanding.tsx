"use client";

import { Show, SignInButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../convex/_generated/api";
import { CATEGORY_ICONS, CATEGORY_LABELS } from "@/lib/format";
import { EmptyState, Loading } from "./ui";

export function PublicHero() {
  return (
    <section className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white px-6 py-12 sm:px-10">
      <p className="text-sm font-medium text-emerald-800">Your neighborhood tool library</p>
      <h1 className="mt-2 max-w-xl text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">
        Borrow what you need. Lend what you don&apos;t.
      </h1>
      <p className="mt-4 max-w-lg text-stone-600">
        List the tools sitting in your garage, request what you need for a weekend project, and let
        LendLoop handle the reminders.
      </p>
      <div className="mt-6">
        <Show when="signed-out">
          <SignInButton mode="modal" forceRedirectUrl="/app">
            <button className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-800">
              Sign in to lend or borrow
            </button>
          </SignInButton>
        </Show>
        <Show when="signed-in">
          <Link
            href="/app"
            className="inline-block rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-800"
          >
            Go to your dashboard
          </Link>
        </Show>
      </div>
    </section>
  );
}

/** Read-only, anonymous list: name and category only. No owner details are ever sent. */
export function PublicToolList() {
  const tools = useQuery(api.tools.listPublic);

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-stone-900">Available right now</h2>
      {tools === undefined ? (
        <Loading />
      ) : tools.length === 0 ? (
        <EmptyState title="No tools listed yet">Be the first neighbor to lend something.</EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <li key={tool._id} className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-4">
              <span aria-hidden className="text-2xl">
                {CATEGORY_ICONS[tool.category]}
              </span>
              <div>
                <p className="font-medium text-stone-900">{tool.name}</p>
                <p className="text-xs text-stone-500">{CATEGORY_LABELS[tool.category]}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
