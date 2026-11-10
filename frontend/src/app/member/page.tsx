"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, ApiError } from "@/lib/api";
import { track } from "@/lib/analytics";
import { day, rand, randShort } from "@/lib/format";
import { ContributionRing, RingLegend } from "@/components/ContributionRing";
import { Explanation } from "@/components/FactorBreakdown";
import { Badge, Empty, Loading, Modal, Notice, PageHeader, Stat } from "@/components/ui";

export default function Overview() {
  const [data, setData] = useState<any>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [modal, setModal] = useState<"join" | "create" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const [me, g] = await Promise.all([api("/members/me"), api("/stokvels")]);
    setData(me); setGroups(g);
  }, []);
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);

  async function join(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError("");
    try {
      const r = await api("/stokvels/join", { method: "POST", body: { join_code: new FormData(e.currentTarget).get("join_code") } });
      void track("member_joined_stokvel");
      setModal(null); setNotice(r.status === "active" ? `You joined ${r.stokvel_name}.` : `Request sent to ${r.stokvel_name}. An administrator will approve it.`);
      await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : "The request failed."); }
  }
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError("");
    const f = new FormData(e.currentTarget);
    try {
      await api("/stokvels", { method: "POST", body: { name: f.get("name"), frequency: f.get("frequency"), purpose: f.get("purpose"),
        contribution_amount: Number(f.get("amount")).toFixed(2) } });
      void track("stokvel_created", { frequency: String(f.get("frequency")) });
      setModal(null); setNotice("Stokvel created. You are the group owner."); await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : "The request failed."); }
  }

  if (!data) return error ? <Notice tone="error">{error}</Notice> : <Loading />;
  const s = data.score;
  const hasHistory = s.counts.due > 0;

  return (
    <>
      <PageHeader title={`Good day, ${data.user.full_name.split(" ")[0]}`} lead="Your verified contributions and what they say about your saving."
        actions={<><button className="btn-quiet" onClick={() => { setError(""); setModal("join"); }}>Join a stokvel</button>
          <Link href="/member/contributions" className="btn-primary">Make a contribution</Link></>} />
      {notice && <div className="mb-6"><Notice tone="success">{notice}</Notice></div>}

      {!hasHistory ? (
        <Empty title="Your index starts with your first verified contribution"
          action={<div className="flex gap-3"><button className="btn-primary" onClick={() => setModal("join")}>Join a stokvel</button><button className="btn-quiet" onClick={() => setModal("create")}>Start a stokvel</button></div>}>
          Join your stokvel with its join code, or register a new group. Once a treasurer or the payment provider verifies a contribution, your record begins.
        </Empty>
      ) : (
        <section className="panel grid items-center gap-8 p-6 md:grid-cols-[auto_1fr] md:p-8" aria-label="Contribution Reliability Index">
          <div className="flex flex-col items-center gap-3">
            <ContributionRing ticks={s.timeline} score={s.score} provisional={s.provisional} size={220} animate />
            <RingLegend />
          </div>
          <div>
            <p className="text-sm text-sage">Contribution Reliability Index</p>
            <div className="mt-2"><Explanation e={s.explanation} /></div>
            <p className="mt-4 text-xs text-sage">Experimental measure. Not a credit bureau score. <Link href="/member/passport" className="text-lime underline underline-offset-4">See the full breakdown</Link></p>
          </div>
        </section>
      )}

      <section className="mt-10 grid grid-cols-2 gap-x-8 gap-y-8 md:grid-cols-4" aria-label="Summary">
        <Stat label="Total verified contributions" value={rand(data.total_verified)} testid="stat-total" />
        <Stat label="Successful payments" value={data.successful_payments} testid="stat-payments" />
        <Stat label="Paid on time" value={data.on_time_percentage === null ? "No history" : `${data.on_time_percentage}%`} />
        <Stat label="Current monthly commitment" value={rand(data.monthly_commitment)} />
        <Stat label="Participation" value={`${data.participation_months} months`} />
        <Stat label="Active stokvel memberships" value={data.active_memberships} />
        <Stat label="Last verified" value={day(data.last_verified_at)} />
        <Stat label="Passport ID" value={<span className="font-mono text-base">{data.user.passport_id}</span>} />
      </section>

      {hasHistory && (
        <section className="mt-12" aria-label="Verified contributions by month">
          <h2 className="text-2xl">Verified contributions by month</h2>
          <div className="panel mt-4 h-64 p-4" role="img" aria-label={`Bar chart of verified contributions for the last 12 months. ${data.series.filter((m: any) => m.amount > 0).length} months have verified contributions, total ${rand(data.total_verified)}.`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#2B3D36" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "#A8B8AE", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#2B3D36" }}
                  tickFormatter={(m: string) => new Date(`${m}-01`).toLocaleDateString("en-ZA", { month: "short" })} />
                <YAxis tick={{ fill: "#A8B8AE", fontSize: 11 }} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => randShort(v)} />
                <Tooltip cursor={{ fill: "rgba(198,230,107,0.06)" }} contentStyle={{ background: "#101B19", border: "1px solid #2B3D36", borderRadius: 6, color: "#F4F1E8", fontSize: 12 }}
                  formatter={(v: any) => [rand(v), "Verified"]} />
                <Bar isAnimationActive={false} dataKey="amount" fill="#C6E66B" radius={[3, 3, 0, 0]} maxBarSize={34} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section className="mt-12 grid gap-10 lg:grid-cols-2">
        <div>
          <h2 className="text-2xl">Your stokvels</h2>
          {groups.length === 0 ? <p className="mt-4 text-sm text-sage">No memberships yet.</p> : (
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {groups.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-4 py-4">
                  <div><p>{g.name}</p><p className="text-sm text-sage">{rand(g.contribution_amount)} {g.frequency} · {g.my_role}</p></div>
                  <Badge status={g.my_status} />
                </li>
              ))}
            </ul>
          )}
          <button className="mt-4 text-sm text-lime underline underline-offset-4" onClick={() => { setError(""); setModal("create"); }}>Start a new stokvel</button>
        </div>
        <div>
          <h2 className="text-2xl">Recent activity</h2>
          {data.recent_activity.length === 0 ? <p className="mt-4 text-sm text-sage">Nothing yet. Your contributions appear here.</p> : (
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {data.recent_activity.map((c: any) => (
                <li key={c.id} className="flex items-center justify-between gap-4 py-3.5">
                  <div><p className="text-sm">{rand(c.amount)} to {c.stokvel_name}</p><p className="text-xs text-sage">{c.period_label} · {day(c.paid_at)}</p></div>
                  <Badge status={c.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {modal === "join" && (
        <Modal title="Join a stokvel" onClose={() => setModal(null)}>
          <form onSubmit={join} className="space-y-4">
            <div><label className="label" htmlFor="join_code">Join code from your stokvel</label>
              <input id="join_code" name="join_code" required minLength={4} maxLength={16} className="field font-mono uppercase" placeholder="DEMO1AB" /></div>
            {error && <Notice tone="error">{error}</Notice>}
            <button className="btn-primary">Send join request</button>
          </form>
        </Modal>
      )}
      {modal === "create" && (
        <Modal title="Start a stokvel" onClose={() => setModal(null)}>
          <form onSubmit={create} className="space-y-4">
            <div><label className="label" htmlFor="name">Group name</label><input id="name" name="name" required minLength={3} className="field" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="label" htmlFor="amount">Contribution (rand)</label><input id="amount" name="amount" type="number" min="1" step="0.01" required className="field" /></div>
              <div><label className="label" htmlFor="frequency">Schedule</label><select id="frequency" name="frequency" className="field"><option value="monthly">Monthly</option><option value="weekly">Weekly</option></select></div>
            </div>
            <div><label className="label" htmlFor="purpose">Purpose</label><select id="purpose" name="purpose" className="field">
              <option value="savings">Savings</option><option value="groceries">Groceries</option><option value="burial">Burial society</option><option value="investment">Investment</option><option value="property">Property</option></select></div>
            {error && <Notice tone="error">{error}</Notice>}
            <button className="btn-primary">Create stokvel</button>
          </form>
        </Modal>
      )}
    </>
  );
}
