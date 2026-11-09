"use client";

import { RedirectToSignIn } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Loading } from "@/components/ui";

const TABS = [
  { href: "/app", label: "Browse tools" },
  { href: "/app/listings", label: "My listings" },
  { href: "/app/requests", label: "My requests" },
  { href: "/app/incoming", label: "Incoming requests" },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const me = useCurrentUser();
  const pathname = usePathname();

  if (me === undefined) return <Loading />;
  if (me === null) return <RedirectToSignIn />;

  const tabs = me.role === "admin" ? [...TABS, { href: "/app/admin", label: "Admin" }] : TABS;

  return (
    <div>
      <p className="mb-4 text-sm text-stone-600">
        Hi, <span className="font-medium text-stone-900">{me.name}</span>
        {me.trustedLender && <span className="ml-2 text-emerald-700">★ Trusted lender</span>}
        {me.role === "admin" && <span className="ml-2 text-stone-500">· admin</span>}
      </p>
      <nav className="mb-8 flex gap-1 overflow-x-auto rounded-xl border border-stone-200 bg-white p-1">
        {tabs.map((tab) => {
          const active = tab.href === "/app" ? pathname === "/app" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
                active ? "bg-emerald-700 text-white" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
