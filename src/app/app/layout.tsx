import { DashboardShell } from "@/components/DashboardShell";

// The dashboard only renders after Clerk and Convex confirm the session in the
// browser, so there is no server-rendered UI for Next.js to validate as an
// instant navigation. Opt this segment out of that dev-time check.
export const instant = false;

export default function DashboardLayout({ children }: LayoutProps<"/app">) {
  return <DashboardShell>{children}</DashboardShell>;
}
