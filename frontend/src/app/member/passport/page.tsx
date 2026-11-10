"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { track } from "@/lib/analytics";
import { day, rand } from "@/lib/format";
import { PassportCard } from "@/components/PassportCard";
import { Explanation, FactorBreakdown } from "@/components/FactorBreakdown";
import { Badge, Empty, Hash, Loading, Notice, PageHeader } from "@/components/ui";

export default function Passport() {
  const [p, setP] = useState<any>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/members/me/passport").then(setP).catch((e) => (e instanceof ApiError && e.status === 404 ? setP(null) : setError(e.message)));
  }, []);

  async function generate() {
    setBusy(true); setError("");
    try { setP(await api("/members/me/passport", { method: "POST" })); void track("passport_generated"); }
    catch (err) { setError(err instanceof ApiError ? err.message : "The Passport was not generated."); }
    setBusy(false);
  }

  if (p === undefined) return error ? <Notice tone="error">{error}</Notice> : <Loading />;
  if (p === null) return (
    <>
      <PageHeader title="Credit Passport" lead="A portable record of your verified contributions. You own it and you decide who sees it." />
      <Empty title="You have not generated a Passport yet"
        action={<button className="btn-primary" onClick={generate} disabled={busy}>{busy ? "Generating" : "Generate my Passport"}</button>}>
        Generating a Passport takes a snapshot of your verified contributions, your reliability index and the ledger state at this moment.
      </Empty>
      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
    </>
  );

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <>
      <PageHeader title="Credit Passport" lead={`Issued ${day(p.generated_at)}. Generate a new Passport after new contributions are verified.`}
        actions={<>
          <button className="btn-quiet" onClick={generate} disabled={busy}>{busy ? "Updating" : "Update Passport"}</button>
          <a className="btn-quiet" href="/api/v1/members/me/passport/pdf" onClick={() => void track("passport_downloaded")}>Download PDF</a>
          <Link className="btn-primary" href="/member/sharing">Share Passport</Link></>} />
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}

      <div className="grid items-start gap-8 xl:grid-cols-[1.1fr_1fr]">
        <PassportCard p={p} verifyUrl={`${origin}/verify/${p.verification_code}`} />
        <div className="panel p-6"><Explanation e={p.explanation} /></div>
      </div>

      <section className="mt-10 grid gap-8 lg:grid-cols-2">
        <div className="panel p-6">
          <h2 className="text-2xl">How the index is calculated</h2>
          <p className="mb-5 mt-2 text-sm text-sage">Six factors, each scored out of 100 and multiplied by its weight. Weights are experimental.</p>
          <FactorBreakdown factors={p.index.factors} />
          <p className="mt-5 text-xs text-sage">The index reads contribution behaviour only. It does not use age, gender, race, religion or any other personal characteristic.</p>
        </div>
        <div className="panel p-6">
          <h2 className="text-2xl">Stokvel membership history</h2>
          <ul className="mt-4 divide-y divide-line">
            {p.memberships.map((m: any) => (
              <li key={m.stokvel} className="flex items-center justify-between gap-4 py-3">
                <div><p>{m.stokvel}</p><p className="text-xs text-sage">{m.frequency}, {m.role}, joined {day(m.joined_on)}</p></div>
                <Badge status={m.status} />
              </li>
            ))}
          </ul>
          <h3 className="mt-6 text-lg">Data provenance</h3>
          <dl className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-sage">Ledger head at issue</dt><dd><Hash value={p.provenance.ledger_head_hash} /></dd></div>
            <div className="flex justify-between gap-4"><dt className="text-sage">Ledger events at issue</dt><dd className="font-mono text-xs">{p.provenance.ledger_event_count}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-sage">Inputs digest</dt><dd><Hash value={p.provenance.inputs_digest} /></dd></div>
          </dl>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-2xl">Verified contribution history</h2>
        <div className="panel mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-line"><tr><th className="th">Paid</th><th className="th">Stokvel</th><th className="th text-right">Amount</th><th className="th">Timing</th><th className="th">Ledger hash</th></tr></thead>
            <tbody className="divide-y divide-line">
              {p.history.slice(0, 24).map((h: any) => (
                <tr key={h.ledger_hash}><td className="td whitespace-nowrap">{day(h.date)}</td><td className="td">{h.stokvel}</td>
                  <td className="td text-right font-serif">{rand(h.amount)}</td>
                  <td className="td"><span className={h.on_time ? "text-lime" : "text-copper"}>{h.on_time ? "On time" : "Late"}</span></td>
                  <td className="td"><Hash value={h.ledger_hash} /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
        {p.history.length > 24 && <p className="mt-2 text-xs text-sage">Showing the 24 most recent of {p.history.length}. The PDF lists more.</p>}
      </section>
    </>
  );
}
