"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, idempotencyKey } from "@/lib/api";
import { track } from "@/lib/analytics";
import { day, dayTime, METHOD_LABEL, rand } from "@/lib/format";
import { Badge, Empty, Hash, Loading, Modal, Notice, PageHeader, TestModeTag } from "@/components/ui";

type Payable = { schedule_id: string; period_label: string; due_date: string; amount: string; overdue: boolean };
type Flow = { membership: any; period: Payable; channel: "payshap_request" | "self_reported"; step: "confirm" | "pending" | "success" | "failed" | "recorded"; contribution?: any; key: string };

export default function Contributions() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [memberships, setMemberships] = useState<any[]>([]);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [dispute, setDispute] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [c, m] = await Promise.all([api("/members/me/contributions"), api("/members/me/memberships")]);
    setRows(c); setMemberships(m);
  }, []);
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);

  async function start(reference?: string) {
    if (!flow) return;
    setBusy(true); setError("");
    try {
      const c = await api("/contributions", { method: "POST", headers: { "Idempotency-Key": flow.key },
        body: { stokvel_id: flow.membership.stokvel_id, schedule_id: flow.period.schedule_id, channel: flow.channel, reference: reference || null } });
      void track("contribution_initiated", { channel: flow.channel });
      setFlow({ ...flow, contribution: c, step: flow.channel === "payshap_request" ? "pending" : "recorded" });
      await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : "The contribution was not created."); }
    setBusy(false);
  }
  async function simulate(outcome: "success" | "fail") {
    if (!flow?.contribution) return;
    setBusy(true); setError("");
    try {
      const r = await api(`/payments/${flow.contribution.id}/simulate`, { method: "POST", body: { outcome } });
      if (outcome === "success") void track("contribution_verified", { method: "provider_confirmed" });
      setFlow({ ...flow, contribution: r.contribution, step: outcome === "success" ? "success" : "failed" });
      await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : "The simulation failed."); }
    setBusy(false);
  }
  async function sendDispute(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError("");
    try {
      await api(`/contributions/${dispute.id}/dispute`, { method: "POST", body: { note: new FormData(e.currentTarget).get("note") } });
      setDispute(null); await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : "The report was not sent."); }
  }

  if (!rows) return error ? <Notice tone="error">{error}</Notice> : <Loading />;
  const active = memberships.filter((m) => m.status === "active");
  const open = (membership: any, period: Payable, channel: Flow["channel"]) => { setError(""); setFlow({ membership, period, channel, step: "confirm", key: idempotencyKey() }); };

  return (
    <>
      <PageHeader title="Contributions" lead="Pay or record a contribution, then follow it from pending to verified." />

      <section aria-label="Make a contribution">
        <h2 className="text-2xl">Make a contribution</h2>
        {active.length === 0 ? <div className="mt-4"><Empty title="No active membership">Join a stokvel from your overview page. Contribution periods appear here once you are a member.</Empty></div> : (
          <div className="mt-4 space-y-4">
            {active.map((m) => (
              <div key={m.membership_id} className="panel p-5" data-testid="payable-group">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-serif text-xl">{m.stokvel_name}</p>
                  <p className="text-sm text-sage">{rand(m.contribution_amount)} {m.frequency}</p>
                </div>
                {m.payable.length === 0 ? <p className="mt-3 text-sm text-sage">You are up to date. Nothing to pay right now.</p> : (
                  <ul className="mt-3 divide-y divide-line">
                    {m.payable.map((p: Payable) => (
                      <li key={p.schedule_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <div><p className="text-sm">{p.period_label} <span className="text-sage">· due {day(p.due_date)}</span></p>
                          {p.overdue && <p className="text-xs text-copper">Past the due date</p>}</div>
                        <div className="flex flex-wrap gap-2">
                          <button className="btn-primary" onClick={() => open(m, p, "payshap_request")}>Request PayShap payment</button>
                          <button className="btn-quiet" onClick={() => open(m, p, "self_reported")}>Record a payment</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-12" aria-label="Contribution history">
        <h2 className="text-2xl">Contribution history</h2>
        {rows.length === 0 ? <div className="mt-4"><Empty title="No contributions yet">Your first contribution appears here with its status and, once verified, its ledger hash.</Empty></div> : (
          <div className="panel mt-4 overflow-x-auto">
            <table className="w-full min-w-[820px]" data-testid="contribution-table">
              <thead className="border-b border-line"><tr>
                <th className="th">Period</th><th className="th">Stokvel</th><th className="th text-right">Amount</th><th className="th">Status</th>
                <th className="th">Verification</th><th className="th">Reference</th><th className="th">Ledger hash</th><th className="th"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td className="td whitespace-nowrap">{c.period_label}<div className="text-xs text-sage">paid {day(c.paid_at)}</div></td>
                    <td className="td">{c.stokvel_name}</td>
                    <td className="td whitespace-nowrap text-right font-serif">{rand(c.amount)}</td>
                    <td className="td"><Badge status={c.status} />{c.review_note && <div className="mt-1 max-w-[14rem] text-xs text-sage">{c.review_note}</div>}</td>
                    <td className="td text-sage">{METHOD_LABEL[c.verification_method]}</td>
                    <td className="td font-mono text-xs text-sage">{c.reference}</td>
                    <td className="td"><Hash value={c.ledger_hash} /></td>
                    <td className="td text-right">{!["rejected", "reversed"].includes(c.status) &&
                      <button className="text-xs text-sage underline-offset-4 hover:text-ivory hover:underline" onClick={() => { setError(""); setDispute(c); }}>Report a problem</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {flow && (
        <Modal title={flow.channel === "payshap_request" ? "PayShap Request" : "Record a payment"} onClose={() => setFlow(null)}>
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-line pb-4">
            <div><p>{flow.membership.stokvel_name}</p><p className="text-sm text-sage">{flow.period.period_label}</p></div>
            <p className="font-serif text-2xl">{rand(flow.period.amount)}</p>
          </div>
          {flow.channel === "payshap_request" && <div className="mb-4 flex items-center gap-2 text-xs text-sage"><TestModeTag /> No money moves. This simulates a PayShap Request.</div>}

          {flow.step === "confirm" && flow.channel === "payshap_request" && (<>
            <p className="text-sm text-sage">A payment request goes to your banking app. You approve it there. The provider then confirms the payment and your contribution is verified.</p>
            <button className="btn-primary mt-5" disabled={busy} onClick={() => start()}>Send payment request</button>
          </>)}
          {flow.step === "confirm" && flow.channel === "self_reported" && (
            <form onSubmit={(e) => { e.preventDefault(); void start(String(new FormData(e.currentTarget).get("reference") || "")); }} className="space-y-4">
              <p className="text-sm text-sage">Use this after an EFT or cash deposit. The record stays pending until your treasurer checks it against the group account.</p>
              <div><label className="label" htmlFor="reference">Bank reference (optional)</label>
                <input id="reference" name="reference" maxLength={64} pattern="[A-Za-z0-9 ._/\-]*" className="field font-mono" placeholder="EFT 25 NOV DLAMINI" /></div>
              <button className="btn-primary" disabled={busy}>Record payment</button>
            </form>
          )}
          {flow.step === "pending" && (
            <div data-testid="payment-pending">
              <Badge status="pending" label="Payment pending" />
              <p className="mt-3 text-sm text-sage">Waiting for approval in the banking app. Reference <span className="font-mono text-ivory">{flow.contribution.reference}</span></p>
              <div className="mt-5 rounded-md border border-dashed border-lime/40 p-4">
                <p className="text-xs text-sage">Test controls. A real provider sends this result by webhook.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn-primary" disabled={busy} onClick={() => simulate("success")}>Simulate approved payment</button>
                  <button className="btn-danger" disabled={busy} onClick={() => simulate("fail")}>Simulate failed payment</button>
                </div>
              </div>
            </div>
          )}
          {flow.step === "success" && (
            <div data-testid="payment-success">
              <Badge status="verified" label="Payment confirmed" />
              <p className="mt-3 text-sm text-sage">Confirmed by the payment provider and sealed on the ledger. Your Passport record is updated.</p>
              <dl className="mt-4 space-y-2 rounded-md border border-line p-4 text-sm" aria-label="Transaction receipt">
                <div className="flex justify-between gap-4"><dt className="text-sage">Receipt for</dt><dd>{flow.contribution.period_label}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-sage">Amount</dt><dd>{rand(flow.contribution.amount)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-sage">Reference</dt><dd className="font-mono text-xs">{flow.contribution.reference}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-sage">Verified</dt><dd>{dayTime(flow.contribution.verified_at)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-sage">Ledger hash</dt><dd><Hash value={flow.contribution.ledger_hash} /></dd></div>
              </dl>
              <button className="btn-quiet mt-5" onClick={() => setFlow(null)}>Done</button>
            </div>
          )}
          {flow.step === "failed" && (
            <div data-testid="payment-failed">
              <Badge status="failed" label="Payment failed" />
              <p className="mt-3 text-sm text-sage">The payment did not go through. Nothing was added to the ledger. Start a new request when you are ready.</p>
              <button className="btn-quiet mt-5" onClick={() => setFlow(null)}>Close</button>
            </div>
          )}
          {flow.step === "recorded" && (
            <div data-testid="payment-recorded">
              <Badge status="pending" label="Waiting for treasurer" />
              <p className="mt-3 text-sm text-sage">Recorded as self-reported. It counts toward your Passport once your treasurer verifies it.</p>
              <button className="btn-quiet mt-5" onClick={() => setFlow(null)}>Done</button>
            </div>
          )}
          {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
        </Modal>
      )}

      {dispute && (
        <Modal title="Report an incorrect record" onClose={() => setDispute(null)}>
          <p className="text-sm text-sage">{dispute.period_label}, {rand(dispute.amount)} to {dispute.stokvel_name}. Your treasurer reviews the report. A verified record is never edited. A correction is added as a new linked record.</p>
          <form onSubmit={sendDispute} className="mt-4 space-y-4">
            <div><label className="label" htmlFor="note">What is wrong?</label><textarea id="note" name="note" required minLength={5} maxLength={500} rows={3} className="field" /></div>
            {error && <Notice tone="error">{error}</Notice>}
            <button className="btn-primary">Send report</button>
          </form>
        </Modal>
      )}
    </>
  );
}
