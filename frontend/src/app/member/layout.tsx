"use client";
import { PortalShell } from "@/components/Shell";
import type { User } from "@/lib/auth";

const NAV = [
  { href: "/member", label: "Overview" }, { href: "/member/contributions", label: "Contributions" },
  { href: "/member/passport", label: "Credit Passport" }, { href: "/member/sharing", label: "Consent centre" },
  { href: "/member/account", label: "Account and privacy" },
];
const allow = (u: User) => u.role === "member";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <PortalShell title="Member portal" nav={NAV} allow={allow}>{children}</PortalShell>;
}
