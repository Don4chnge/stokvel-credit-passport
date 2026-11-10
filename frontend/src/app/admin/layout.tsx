"use client";
import { PortalShell } from "@/components/Shell";
import type { User } from "@/lib/auth";

const NAV = [{ href: "/admin", label: "Ledger integrity" }, { href: "/admin/fairness", label: "Fairness report" }, { href: "/admin/audit", label: "Audit log" }];
const allow = (u: User) => u.role === "platform_admin";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <PortalShell title="Platform administration" nav={NAV} allow={allow}>{children}</PortalShell>;
}
