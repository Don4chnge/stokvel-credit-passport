"use client";
import { PortalShell } from "@/components/Shell";
import type { User } from "@/lib/auth";

const NAV = [{ href: "/lender", label: "Verify a Passport" }, { href: "/lender/history", label: "Verification history" }];
const allow = (u: User) => u.role === "lender";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <PortalShell title="Lender portal" nav={NAV} allow={allow}>{children}</PortalShell>;
}
