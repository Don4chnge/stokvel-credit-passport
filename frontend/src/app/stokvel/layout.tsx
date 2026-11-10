"use client";
import Link from "next/link";
import { PortalShell } from "@/components/Shell";
import { Empty, Loading, SyntheticTag } from "@/components/ui";
import type { User } from "@/lib/auth";
import { GroupProvider, useGroup } from "@/lib/group";

const NAV = [
  { href: "/stokvel", label: "Group overview" }, { href: "/stokvel/contributions", label: "Contributions" },
  { href: "/stokvel/members", label: "Members" }, { href: "/stokvel/ledger", label: "Ledger" },
];
const allow = (u: User) => u.role === "member";

function Gate({ children }: { children: React.ReactNode }) {
  const { groups, group, select, loading } = useGroup();
  if (loading) return <Loading />;
  if (!group) return (
    <Empty title="You do not manage a stokvel" action={<Link href="/member" className="btn-primary">Go to my overview</Link>}>
      This area is for group owners, treasurers and administrators. Start a stokvel from your overview page, or ask your group owner for a role.
    </Empty>
  );
  return (
    <>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="group-select" className="text-sm text-sage">Stokvel</label>
          <select id="group-select" className="field w-auto min-w-[14rem]" value={group.id} onChange={(e) => select(e.target.value)}>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <span className="text-sm text-sage">Your role: {group.my_role}</span>
        </div>
        {group.is_synthetic && <SyntheticTag />}
      </div>
      {children}
    </>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <PortalShell title="Stokvel management" nav={NAV} allow={allow}><GroupProvider><Gate>{children}</Gate></GroupProvider></PortalShell>;
}
