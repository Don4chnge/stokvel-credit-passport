"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { track } from "@/lib/analytics";
import { day, dayTime, METHOD_LABEL, rand } from "@/lib/format";
import { PassportCard } from "@/components/PassportCard";
import { Explanation, FactorBreakdown } from "@/components/FactorBreakdown";
import { Badge, Hash, Loading, Notice, PageHeader } from "@/components/ui";

const SCOPE_LABEL: Record<string, string> = { index: "Reliability index", explanation: "Index explanation", totals: "Contribution totals", history: "Contribution history", memberships: "Stokvel memberships" };

export default function SharedPassport({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [p, setP] = useState<any>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);

  useEffect(() => {
    api(`/passport/shared/${encodeURIComponent(token)}`)
      .then((v) => { setP(v); void track("passport_accessed", { scope_count: v.scopes.length }); void track("lender_verification_completed", { outcome: "granted" }); })
      .catch((e) => setError({ status: e instanceof ApiError ? e.status : 0, message: e.message }));
  }, [token]);

  if (error) return (
    <>
      <PageHeader title={error.status === 410 ? "Access is no longer available" : "This link is not valid"} />
      <div data-testid="access-denied"><Notice tone="error">{error.message}</Notice></div>
      <p className="mt-4 max-w-prose text-sm text-sage">{error.status === 410
        ? "The member controls access to their Passport. Ask the member for a new link if you still need to see it."
        : "Check that you pasted the whole link."}</p>
      <Link href="/lender" className="btn-quiet mt-6">Verify another Passport</Link>
    </>
  );
  if (!p) return <Loading label="Verifying access" />;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const hidden = Object.keys(SCOPE_LABEL).filter((s) => !p.scopes.includes(s));
  return (
    <>
      <PageHeader title="Shared Passport" lead={`Access granted by the member. It ends ${dayTime(p.consent_expires_at)}, or earlier if the member revokes it.`}
        actions={<a className="btn-quiet" href={`/api/v1/passport/shared/${encodeURIComponent(token)}/pdf`}>Download report</a>} />

      <section className="mb-8 grid gap-4 rounded-lg border border-lime/40 bg-lime/5 p-5 sm:grid-cols-3" data-testid="verification-banner" aria-label="Verification result">
        <div><p className="text-xs text-sage">Authenticity</p><p className="mt-1 font-serif text-xl text-lime">Verified Passport</p></div>
        <div><p className="text-xs text-sage">Report issued</p><p className="mt-1">{day(p.generated_at)}</p></div>
        <div><p className="text-xs text-sage">Last verified contribution</p><p className="mt-1">{day(p.last_verified_at)}</p></div>
      </section>

      <div className="grid items-start gap-8 xl:grid-cols-[1.1fr_1fr]">
        <PassportCard p={p} verifyUrl={`${origin}/verify/${p.verification_code}`} />
        <div className="space-y-6">
          <div className="panel p-6">
            <h2 className="text-xl">What the member shared</h2>
            <ul className="mt-3 space-y-1.5 text-sm">
              {p.scopes.map((s: string) => <li key={s} className="flex items-center gap-2.5"><span className="h-1.5 w-1.5 rounded-full bg-lime" aria-hidden />{SCOPE_LABEL[s]}</li>)}
              {hidden.map((s) => <li key={s} className="flex items-center gap-2.5 text-sage/70"><span className="h-1.5 w-1.5 rounded-full border border-sage/60" aria-hidden />{SCOPE_LABEL[s]}, not shared</li>)}
            </ul>
          </div>
          <div className="panel p-6">
            <h2 className="text-xl">Data provenance</h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-sage">Source</dt><dd className="text-right">{p.provenance.source}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-sage">Ledger head at issue</dt><dd><Hash value={p.provenance.ledger_head_hash} /></dd></div>
              <div className="flex justify-between gap-4"><dt className="text-sage">Ledger events at issue</dt><dd className="font-mono text-xs">{p.provenance.ledger_event_count}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-sage">Verification record</dt><dd className="font-mono text-xs">{p.verification_id.slice(0, 8)}</dd></div>
            </dl>
          </div>
        </div>
      </div>

      {p.explanation && (
        <section className="mt-10 grid gap-8 lg:grid-cols-2">
          <div className="panel p-6"><h2 className="mb-3 text-2xl">Index explanation</h2><Explanation e={{ ...p.explanation, headline: p.explanation.headline.replace("Your reliability index", "The reliability index"), improvements: [] }} /></div>
          {p.index?.factors && <div className="panel p-6"><h2 className="mb-4 text-2xl">Factor breakdown</h2><FactorBreakdown factors={p.index.factors} /></div>}
        </section>
      )}

      {p.memberships && (
        <section className="mt-10"><h2 className="text-2xl">Stokvel memberships</h2>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {p.memberships.map((m: any) => <li key={m.stokvel} className="flex items-center justify-between gap-4 py-3"><div><p>{m.stokvel}</p><p className="text-xs text-sage">{m.frequency}, joined {day(m.joined_on)}</p></div><Badge status={m.status} /></li>)}
          </ul></section>
      )}

      {p.history && (
        <section className="mt-10"><h2 className="text-2xl">Verified contribution history</h2>
          <div className="panel mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px]" data-testid="shared-history">
              <thead className="border-b border-line"><tr><th className="th">Paid</th><th className="th">Stokvel</th><th className="th text-right">Amount</th><th className="th">Timing</th><th className="th">Proof</th><th className="th">Ledger hash</th></tr></thead>
              <tbody className="divide-y divide-line">
                {p.history.slice(0, 36).map((h: any) => (
                  <tr key={h.ledger_hash}><td className="td whitespace-nowrap">{day(h.date)}</td><td className="td">{h.stokvel}</td><td className="td text-right font-serif">{rand(h.amount)}</td>
                    <td className="td"><span className={h.on_time ? "text-lime" : "text-copper"}>{h.on_time ? "On time" : "Late"}</span></td>
                    <td className="td text-sage">{METHOD_LABEL[h.method]}</td><td className="td"><Hash value={h.ledger_hash} /></td></tr>
                ))}
              </tbody>
            </table>
          </div></section>
      )}
      <p className="mt-8 max-w-prose text-xs leading-relaxed text-sage">{p.disclaimer} Use it beside your own affordability and credit assessment.</p>
    </>
  );
}
