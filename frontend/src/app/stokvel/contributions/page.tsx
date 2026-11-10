"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { track } from "@/lib/analytics";
import { day, METHOD_LABEL, rand } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { useGroup } from "@/lib/group";
import { Badge, Empty, Hash, Loading, Modal, Notice, PageHeader } from "@/components/ui";

export default function GroupContributions() {
  const { group, reload } = useGroup();
  const { user } = useAuth();
  const [queue, setQueue] = useState<any[] | null>(null);
  const [calendar, setCalendar] = useState<any[]>([]);
  const [recent, setRecent] = useState<any[]>([]);
  const [action, setAction] = useState<{ kind: "reject" | "reverse"; c: any } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canVerify = group && ["owner", "treasurer"].includes(group.my_role);

  const load = useCallback(async () => {
    if (!group) return;
    const [q, cal, rec] = await Promise.all([
      api(`/stokvels/${group.id}/contributions?status=pending,under_review`), api(`/stokvels/${group.id}/calendar`),
      api(`/stokvels/${group.id}/contributions?status=verified,reversed,rejected`)]);
    setQueue(q); setCalendar(cal); setRecent(rec.slice(0, 25));
  }, [group]);
  useEffect(() => { setQueue(null); load().catch((e) => setError(e.message)); }, [load]);

  async function verify(c: any) {
    setError(""); setNotice("");
    try {
      await api(`/contributions/${c.id}/verify`, { method: "POST" });
      void track("contribution_verified", { method: "manually_verified" });
      setNotice(`Verified ${rand(c.amount)} from ${c.member_name}. The record is sealed on the ledger.`);
      await Promise.all([load(), reload()]);
    } catch (err) { setError(err instanceof ApiError ? err.message : "Verification failed."); }
  }
  async function submitAction(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!action) return;
    setError("");
    try {
      await api(`/contributions/${action.c.id}/${action.kind}`, { method: "POST", body: { note: new FormData(e.currentTarget).get("note") || null } });
      setNotice(action.kind === "reject" ? "Contribution rejected. Nothing was added to the ledger." : "Reversal recorded as a new ledger event. The original record is unchanged.");
      setAction(null); await Promise.all([load(), reload()]);
    } catch (err) { setError(err instanceof ApiError ? err.message : "The action failed."); }
  }

  if (!group) return null;
  return (
    <>
      <PageHeader title="Contributions" lead="Check self-reported payments against the group account. Verified payments are sealed on the ledger and update each member's Passport." />
      {notice && <div className="mb-6"><Notice tone="success">{notice}</Notice></div>}
      {error && !action && <div className="mb-6"><Notice tone="error">{error}</Notice></div>}

      <section aria-label="Waiting for review">
        <h2 className="text-2xl">Waiting for review</h2>
        {!queue ? <Loading /> : queue.length === 0 ? <div className="mt-4"><Empty title="Nothing to review">Self-reported payments appear here. Payments confirmed by the payment provider skip this queue.</Empty></div> : (
          <ul className="mt-4 space-y-3" data-testid="review-queue">
            {queue.map((c) => (
              <li key={c.id} className="panel flex flex-wrap items-center justify-between gap-4 p-5" data-testid="review-item">
                <div>
                  <p className="font-serif text-xl">{c.member_name} <span className="text-sage">·</span> {rand(c.amount)}</p>
                  <p className="mt-1 text-sm text-sage">{c.period_label}, paid {day(c.paid_at)}. Reference <span className="font-mono text-xs text-ivory">{c.reference}</span></p>
                  <div className="mt-2 flex flex-wrap items-center gap-2"><Badge status={c.status} /><span className="text-xs text-sage">{METHOD_LABEL[c.verification_method]}. Not yet checked against the bank.</span></div>
                  {c.review_note && <p className="mt-2 max-w-prose text-sm text-copper">{c.review_note}</p>}
                </div>
                {canVerify ? (
                  c.member_id === user?.id ? <p className="max-w-[14rem] text-xs text-sage">Your own contribution. Another treasurer or the owner must verify it.</p> : (
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-primary" onClick={() => verify(c)}>Verify payment</button>
                      <button className="btn-danger" onClick={() => { setError(""); setAction({ kind: "reject", c }); }}>Reject</button>
                    </div>)
                ) : <p className="text-xs text-sage">Treasurers and owners verify payments.</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-12" aria-label="Contribution calendar">
        <h2 className="text-2xl">Contribution calendar</h2>
        <p className="mt-1 text-sm text-sage">Each period reconciled: who paid, who paid late and what is outstanding.</p>
        <div className="panel mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px]" data-testid="calendar-table">
            <thead className="border-b border-line"><tr><th className="th">Period</th><th className="th">Due</th><th className="th">Status</th><th className="th text-right">Paid</th><th className="th text-right">Late</th><th className="th text-right">Missed</th><th className="th text-right">Outstanding</th><th className="th text-right">Collected</th></tr></thead>
            <tbody className="divide-y divide-line">
              {calendar.map((p) => (
                <tr key={p.schedule_id}>
                  <td className="td whitespace-nowrap">{p.period_label}</td><td className="td whitespace-nowrap text-sage">{day(p.due_date)}</td>
                  <td className="td"><Badge status={p.state} /></td>
                  <td className="td text-right">{p.verified} of {p.eligible}</td>
                  <td className="td text-right text-copper">{p.late || ""}</td>
                  <td className="td text-right text-[#e6a493]">{p.missed || ""}</td>
                  <td className="td text-right" title={p.outstanding_members.join(", ")}>{p.outstanding || ""}{p.awaiting_review ? <span className="ml-1 text-xs text-sage">(+{p.awaiting_review} in review)</span> : null}</td>
                  <td className="td whitespace-nowrap text-right font-serif">{rand(p.collected)}<span className="ml-1 text-xs text-sage">of {rand(p.expected)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12" aria-label="Recent decisions">
        <h2 className="text-2xl">Recently verified, reversed or rejected</h2>
        <div className="panel mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="border-b border-line"><tr><th className="th">Member</th><th className="th">Period</th><th className="th text-right">Amount</th><th className="th">Status</th><th className="th">Proof</th><th className="th">Ledger hash</th><th className="th"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody className="divide-y divide-line">
              {recent.map((c) => (
                <tr key={c.id}><td className="td">{c.member_name}</td><td className="td whitespace-nowrap">{c.period_label}</td><td className="td text-right font-serif">{rand(c.amount)}</td>
                  <td className="td"><Badge status={c.status} /></td><td className="td text-sage">{METHOD_LABEL[c.verification_method]}</td><td className="td"><Hash value={c.ledger_hash} /></td>
                  <td className="td text-right">{c.status === "verified" && canVerify && <button className="text-xs text-sage underline-offset-4 hover:text-ivory hover:underline" onClick={() => { setError(""); setAction({ kind: "reverse", c }); }}>Reverse</button>}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {action && (
        <Modal title={action.kind === "reject" ? "Reject this contribution" : "Reverse this contribution"} onClose={() => setAction(null)}>
          <p className="text-sm text-sage">{action.c.member_name}, {action.c.period_label}, {rand(action.c.amount)}. {action.kind === "reverse"
            ? "The verified record stays on the ledger. A reversal is added as a new linked record."
            : "The member is able to submit the contribution again."}</p>
          <form onSubmit={submitAction} className="mt-4 space-y-4">
            <div><label className="label" htmlFor="note">Reason</label><textarea id="note" name="note" rows={3} maxLength={500} required className="field" /></div>
            {error && <Notice tone="error">{error}</Notice>}
            <button className="btn-danger">{action.kind === "reject" ? "Reject contribution" : "Record reversal"}</button>
          </form>
        </Modal>
      )}
    </>
  );
}
