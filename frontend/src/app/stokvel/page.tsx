"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { day, dayTime, rand } from "@/lib/format";
import { useGroup } from "@/lib/group";
import { Badge, Hash, PageHeader, Stat } from "@/components/ui";

export default function GroupOverview() {
  const { group } = useGroup();
  const [integrity, setIntegrity] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  useEffect(() => {
    if (!group) return;
    api("/ledger/verify").then(setIntegrity).catch(() => {});
    api(`/ledger/events?stokvel_id=${group.id}&limit=6`).then(setEvents).catch(() => setEvents([]));
  }, [group]);
  if (!group) return null;
  return (
    <>
      <PageHeader title={group.name} lead={`${rand(group.contribution_amount)} ${group.frequency}. Join code ${group.join_code}.`}
        actions={<Link href="/stokvel/contributions" className="btn-primary">Review contributions{group.pending_reviews ? ` (${group.pending_reviews})` : ""}</Link>} />
      <section className="grid grid-cols-2 gap-x-8 gap-y-8 md:grid-cols-4" aria-label="Group summary">
        <Stat label="Active members" value={group.member_count} testid="stat-members" />
        <Stat label={`Target for ${group.current_period || "this period"}`} value={rand(group.period_target)} />
        <Stat label="Total verified contributions" value={rand(group.total_verified)} />
        <Stat label="Outstanding this period" value={rand(group.outstanding_current)} hint={`${group.paid_current} of ${group.eligible_current} members paid`} />
        <Stat label="Completion rate" value={group.completion_rate === null ? "No period yet" : `${group.completion_rate}%`} hint={group.current_due_date ? `Due ${day(group.current_due_date)}` : undefined} />
        <Stat label="Waiting for review" value={group.pending_reviews} testid="stat-pending" />
        <Stat label="Ledger integrity" value={integrity ? <Badge status={integrity.valid ? "valid" : "failed"} label={integrity.valid ? "Chain verified" : "Integrity failure"} /> : "Checking"} />
        <Stat label="Ledger events, all groups" value={integrity?.event_count ?? "…"} />
      </section>
      <section className="mt-12">
        <div className="flex items-end justify-between gap-4"><h2 className="text-2xl">Recent ledger activity</h2><Link href="/stokvel/ledger" className="text-sm text-lime underline underline-offset-4">Open the ledger</Link></div>
        {events.length === 0 ? <p className="mt-4 text-sm text-sage">No verified contributions yet. Verified payments appear here as sealed records.</p> : (
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {events.map((e) => (
              <li key={e.event_id} className="grid gap-1 py-3 sm:grid-cols-[4rem_1fr_auto] sm:items-center">
                <span className="font-mono text-xs text-sage">#{e.seq}</span>
                <span className="text-sm">{e.event_type === "CONTRIBUTION_VERIFIED" ? "Contribution verified" : "Contribution reversed"}, {rand(e.amount)} <span className="text-sage">· {dayTime(e.timestamp)}</span></span>
                <Hash value={e.current_hash} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
