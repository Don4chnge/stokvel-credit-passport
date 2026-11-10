"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useGroup } from "@/lib/group";
import { LedgerTable, LedgerTools } from "@/components/LedgerTools";
import { Empty, Loading, PageHeader } from "@/components/ui";

export default function GroupLedger() {
  const { group } = useGroup();
  const [events, setEvents] = useState<any[] | null>(null);
  useEffect(() => { if (group) { setEvents(null); api(`/ledger/events?stokvel_id=${group.id}&limit=40`).then(setEvents).catch(() => setEvents([])); } }, [group]);
  if (!group) return null;
  return (
    <>
      <PageHeader title="Ledger" lead="Every verified contribution for this stokvel, sealed in an append-only hash chain. Records are never edited. Corrections and reversals are new linked records." />
      <LedgerTools />
      <section className="mt-12" aria-label="Ledger events">
        <h2 className="mb-4 text-2xl">Latest events for {group.name}</h2>
        {!events ? <Loading /> : events.length === 0 ? <Empty title="No ledger events yet">The first verified contribution creates the first record.</Empty> : <LedgerTable events={events} />}
      </section>
    </>
  );
}
