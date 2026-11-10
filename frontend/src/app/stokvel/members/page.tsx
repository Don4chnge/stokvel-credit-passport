"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { day, rand } from "@/lib/format";
import { useGroup } from "@/lib/group";
import { Badge, Loading, Modal, Notice, PageHeader } from "@/components/ui";

const ROLE_HELP: Record<string, string> = {
  owner: "Full control of the group", treasurer: "Verifies contributions", administrator: "Manages members", member: "Contributes",
};

export default function Members() {
  const { group, reload } = useGroup();
  const [members, setMembers] = useState<any[] | null>(null);
  const [history, setHistory] = useState<{ m: any; rows: any[] } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canManage = group && ["owner", "administrator"].includes(group.my_role);
  const canAssign = group?.my_role === "owner";

  const load = useCallback(async () => { if (group) setMembers(await api(`/stokvels/${group.id}/members`)); }, [group]);
  useEffect(() => { setMembers(null); load().catch((e) => setError(e.message)); }, [load]);

  async function run(fn: () => Promise<any>, ok: string) {
    setError(""); setNotice("");
    try { await fn(); setNotice(ok); await Promise.all([load(), reload()]); }
    catch (err) { setError(err instanceof ApiError ? err.message : "The action failed."); }
  }
  async function invite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    await run(() => api(`/stokvels/${group.id}/members/invite`, { method: "POST", body: { email: new FormData(form).get("email") } }), "Invitation recorded.");
    form.reset();
  }
  async function showHistory(m: any) {
    setHistory({ m, rows: await api(`/stokvels/${group.id}/contributions?member_id=${m.user_id}`) });
  }

  if (!group) return null;
  const pending = (members || []).filter((m) => m.status === "pending");
  const rest = (members || []).filter((m) => m.status !== "pending");
  return (
    <>
      <PageHeader title="Members" lead={`Share join code ${group.join_code} with new members, or invite a registered member by email.`} />
      {notice && <div className="mb-6"><Notice tone="success">{notice}</Notice></div>}
      {error && <div className="mb-6"><Notice tone="error">{error}</Notice></div>}

      {canManage && (
        <form onSubmit={invite} className="panel mb-8 flex flex-wrap items-end gap-3 p-5" aria-label="Invite a member">
          <div className="min-w-[16rem] flex-1"><label className="label" htmlFor="invite-email">Invite a registered member by email</label>
            <input id="invite-email" name="email" type="email" required className="field" placeholder="member@example.co.za" /></div>
          <button className="btn-quiet">Send invitation</button>
        </form>
      )}

      {pending.length > 0 && (
        <section className="mb-10" aria-label="Membership requests">
          <h2 className="text-2xl">Membership requests</h2>
          <ul className="mt-4 space-y-3">
            {pending.map((m) => (
              <li key={m.membership_id} className="panel flex flex-wrap items-center justify-between gap-3 p-5" data-testid="join-request">
                <div><p className="font-serif text-xl">{m.name}</p><p className="text-sm text-sage">{m.email}</p></div>
                {canManage ? (
                  <div className="flex gap-2">
                    <button className="btn-primary" onClick={() => run(() => api(`/stokvels/${group.id}/members/${m.membership_id}/approve`, { method: "POST" }), `${m.name} approved.`)}>Approve</button>
                    <button className="btn-danger" onClick={() => run(() => api(`/stokvels/${group.id}/members/${m.membership_id}`, { method: "DELETE" }), `Request from ${m.name} declined.`)}>Decline</button>
                  </div>
                ) : <p className="text-xs text-sage">Owners and administrators approve requests.</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Member list">
        <h2 className="text-2xl">Member list</h2>
        {!members ? <Loading /> : (
          <div className="panel mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px]" data-testid="member-table">
              <thead className="border-b border-line"><tr><th className="th">Member</th><th className="th">Role</th><th className="th">Status</th><th className="th">Joined</th><th className="th text-right">Verified</th><th className="th text-right">In review</th><th className="th"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody className="divide-y divide-line">
                {rest.map((m) => (
                  <tr key={m.membership_id}>
                    <td className="td">{m.name}<div className="text-xs text-sage">{m.email}</div></td>
                    <td className="td">
                      {canAssign && m.role !== "owner" && m.status === "active" ? (
                        <select aria-label={`Role for ${m.name}`} className="field w-auto py-1.5" value={m.role}
                          onChange={(e) => run(() => api(`/stokvels/${group.id}/members/${m.membership_id}/role`, { method: "PATCH", body: { role: e.target.value } }), `${m.name} is now ${e.target.value}.`)}>
                          {["member", "treasurer", "administrator"].map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      ) : <span title={ROLE_HELP[m.role]}>{m.role}</span>}
                    </td>
                    <td className="td"><Badge status={m.status} /></td>
                    <td className="td whitespace-nowrap text-sage">{day(m.joined_on)}</td>
                    <td className="td whitespace-nowrap text-right">{m.verified_count} <span className="text-xs text-sage">({rand(m.verified_total)})</span></td>
                    <td className="td text-right">{m.pending_count || ""}</td>
                    <td className="td whitespace-nowrap text-right">
                      <button className="text-xs text-sage underline-offset-4 hover:text-ivory hover:underline" onClick={() => showHistory(m)}>Payment history</button>
                      {canManage && m.role !== "owner" && m.status === "active" && (
                        <button className="ml-4 text-xs text-copper underline-offset-4 hover:underline"
                          onClick={() => { if (window.confirm(`Remove ${m.name} from ${group.name}? Their verified records stay on the ledger.`)) void run(() => api(`/stokvels/${group.id}/members/${m.membership_id}`, { method: "DELETE" }), `${m.name} removed.`); }}>Remove</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {history && (
        <Modal title={`${history.m.name}: payment history`} onClose={() => setHistory(null)}>
          {history.rows.length === 0 ? <p className="text-sm text-sage">No contribution records in this stokvel yet.</p> : (
            <ul className="divide-y divide-line">
              {history.rows.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span>{c.period_label} <span className="text-sage">· {rand(c.amount)}</span></span><Badge status={c.status} />
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </>
  );
}
