"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { track } from "@/lib/analytics";
import { dayTime } from "@/lib/format";
import { Badge, Empty, Loading, Notice, PageHeader } from "@/components/ui";

const SCOPES: [string, string, string][] = [
  ["index", "Reliability index", "Your index out of 100 and the model version."],
  ["explanation", "Index explanation", "The factor breakdown and the reasons behind your index."],
  ["totals", "Contribution totals", "Total verified, number of payments, on-time rate, participation length."],
  ["history", "Contribution history", "Each verified contribution with its date, amount and ledger hash."],
  ["memberships", "Stokvel memberships", "The stokvels you belong to and when you joined."],
];

export default function Sharing() {
  const [shares, setShares] = useState<any[] | null>(null);
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => setShares(await api("/passport/shares")), []);
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const scopes = SCOPES.map(([k]) => k).filter((k) => f.get(`scope_${k}`) === "on");
    if (!scopes.length) { setError("Choose at least one item to share."); return; }
    setBusy(true); setError(""); setLink("");
    try {
      const r = await api("/passport/share", { method: "POST", body: { scopes, expires_in_days: Number(f.get("expires")), recipient_label: f.get("recipient") } });
      void track("passport_shared", { scope_count: scopes.length, expires_in_days: Number(f.get("expires")) });
      setLink(`${window.location.origin}/lender/view/${r.token}`);
      (e.target as HTMLFormElement).reset();
      await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : "The link was not created."); }
    setBusy(false);
  }
  async function revoke(id: string) {
    await api(`/passport/share/${id}`, { method: "DELETE" });
    void track("passport_revoked");
    await load();
  }

  return (
    <>
      <PageHeader title="Consent centre" lead="Nobody sees your Passport unless you create a link. Choose what a lender sees, set an expiry, and cancel access whenever you like." />

      <section className="panel p-6" aria-label="Share your Passport">
        <h2 className="text-2xl">Share your Passport</h2>
        <form onSubmit={create} className="mt-5 grid gap-6 lg:grid-cols-2">
          <fieldset>
            <legend className="label">Information to share</legend>
            <div className="space-y-3">
              {SCOPES.map(([key, name, hint]) => (
                <label key={key} className="flex items-start gap-3">
                  <input type="checkbox" name={`scope_${key}`} className="mt-1 h-4 w-4 accent-[#C6E66B]" />
                  <span><span className="block text-sm">{name}</span><span className="block text-xs text-sage">{hint}</span></span>
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-sage">Nothing is selected for you. Your name, Passport ID and verification status are always included.</p>
          </fieldset>
          <div className="space-y-4">
            <div><label className="label" htmlFor="recipient">Who is this for?</label>
              <input id="recipient" name="recipient" required minLength={2} maxLength={160} className="field" placeholder="Name of the lender" /></div>
            <div><label className="label" htmlFor="expires">Access expires after</label>
              <select id="expires" name="expires" className="field" defaultValue="7">
                <option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></div>
            {error && <Notice tone="error">{error}</Notice>}
            <button className="btn-primary" disabled={busy}>{busy ? "Creating link" : "Create sharing link"}</button>
          </div>
        </form>
        {link && (
          <div className="mt-6 rounded-md border border-lime/40 bg-lime/5 p-4" data-testid="share-link-box">
            <p className="text-sm text-lime">Link created. It is shown once. Send it to your lender now.</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <input readOnly value={link} aria-label="Sharing link" data-testid="share-link" className="field min-w-0 flex-1 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="btn-quiet" onClick={() => { void navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied" : "Copy link"}</button>
            </div>
          </div>
        )}
      </section>

      <section className="mt-10" aria-label="Links you created">
        <h2 className="text-2xl">Links you created</h2>
        {!shares ? <Loading /> : shares.length === 0 ? <div className="mt-4"><Empty title="You have not shared your Passport">Links you create appear here, with every access recorded.</Empty></div> : (
          <ul className="mt-4 space-y-4">
            {shares.map((s) => (
              <li key={s.id} className="panel p-5" data-testid="share-row">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-serif text-xl">{s.recipient_label}</p>
                    <p className="mt-1 text-sm text-sage">Shares: {s.scopes.join(", ")}</p>
                    <p className="text-xs text-sage">Created {dayTime(s.created_at)}. {s.state === "revoked" ? `Revoked ${dayTime(s.revoked_at)}.` : `Expires ${dayTime(s.expires_at)}.`}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge status={s.state} />
                    {s.state === "active" && <button className="btn-danger" onClick={() => revoke(s.id)}>Revoke access</button>}
                  </div>
                </div>
                <div className="mt-4 border-t border-line pt-3">
                  <p className="text-xs text-sage">Access log</p>
                  {s.access_log.length === 0 ? <p className="mt-1 text-sm text-sage">Not opened yet.</p> : (
                    <ul className="mt-1.5 space-y-1 text-sm">
                      {s.access_log.map((a: any, i: number) => (
                        <li key={i} className="flex flex-wrap items-center gap-3"><span>{a.organisation}</span><span className="text-sage">{dayTime(a.accessed_at)}</span><Badge status={a.outcome} label={a.outcome === "granted" ? "Viewed" : `Blocked, ${a.outcome}`} /></li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
