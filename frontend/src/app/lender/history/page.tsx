"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { dayTime } from "@/lib/format";
import { Badge, Empty, Loading, PageHeader } from "@/components/ui";

export default function History() {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { api("/lender/verifications").then(setRows).catch(() => setRows([])); }, []);
  return (
    <>
      <PageHeader title="Verification history" lead="Each time your organisation opened a Passport link. Member details stay visible only while their consent is active." />
      {!rows ? <Loading /> : rows.length === 0 ? <Empty title="No verifications yet">Open a Passport link from a member to record your first verification.</Empty> : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead className="border-b border-line"><tr><th className="th">Record</th><th className="th">Opened</th><th className="th">Result</th><th className="th">Consent now</th><th className="th">Scopes</th></tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => <tr key={r.id}><td className="td font-mono text-xs">{r.id.slice(0, 8)}</td><td className="td whitespace-nowrap">{dayTime(r.accessed_at)}</td>
                <td className="td"><Badge status={r.outcome} label={r.outcome === "granted" ? "Viewed" : `Blocked, ${r.outcome}`} /></td>
                <td className="td"><Badge status={r.consent_state} /></td><td className="td text-sage">{r.scopes.join(", ")}</td></tr>)}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
