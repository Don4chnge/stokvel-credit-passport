"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { dayTime } from "@/lib/format";
import { LedgerTable, LedgerTools } from "@/components/LedgerTools";
import { Badge, Hash, Loading, Notice, PageHeader, Stat } from "@/components/ui";

export default function AdminLedger() {
  const [s, setS] = useState<any>(null);
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => setS(await api("/ledger/status")), []);
  useEffect(() => { void load(); }, [load]);

  async function checkpoint() {
    const cp = await api("/ledger/checkpoints", { method: "POST" });
    setNotice(`Checkpoint recorded at event #${cp.seq}. Publish this hash outside the database.`);
    await load();
  }
  if (!s) return <Loading />;
  return (
    <>
      <PageHeader title="Ledger integrity" lead="The contribution ledger across every stokvel on the platform." actions={<button className="btn-quiet" onClick={checkpoint}>Record a checkpoint</button>} />
      {notice && <div className="mb-6"><Notice tone="success">{notice}</Notice></div>}
      <section className="mb-10 grid grid-cols-2 gap-x-8 gap-y-8 md:grid-cols-4" aria-label="Ledger status">
        <Stat label="Ledger events" value={s.event_count} testid="stat-events" />
        <Stat label="Chain verification" value={<Badge status={s.valid ? "valid" : "failed"} label={s.valid ? "Chain verified" : "Integrity failure"} />} />
        <Stat label="Failed integrity checks" value={s.failed_integrity_checks} hint="Recorded in the audit log" />
        <Stat label="Latest event hash" value={<Hash value={s.head_hash} />} />
      </section>
      <LedgerTools onVerified={() => void load()} />
      <section className="mt-10 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0"><h2 className="mb-4 text-2xl">Recent ledger activity</h2><LedgerTable events={s.recent_events} /></div>
        <div>
          <h2 className="mb-4 text-2xl">Checkpoints</h2>
          <ul className="divide-y divide-line border-y border-line">
            {s.checkpoints.map((c: any) => <li key={`${c.seq}-${c.created_at}`} className="py-3 text-sm"><p>Event #{c.seq} <span className="text-sage">· {dayTime(c.created_at)}</span></p><Hash value={c.head_hash} /></li>)}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-sage">{s.trust_note}</p>
        </div>
      </section>
    </>
  );
}
