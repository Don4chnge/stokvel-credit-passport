"use client";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { rand } from "@/lib/format";
import { Badge, Hash, Notice } from "./ui";

/** Run the integrity check and the tampering simulation. Shared by the stokvel and platform ledger screens. */
export function LedgerTools({ onVerified }: { onVerified?: (r: any) => void }) {
  const [result, setResult] = useState<any>(null);
  const [sim, setSim] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function verify() {
    setBusy("verify"); setError("");
    try { const r = await api("/ledger/verify"); setResult(r); onVerified?.(r); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Verification failed to run."); }
    setBusy("");
  }
  async function simulate() {
    setBusy("sim"); setError("");
    try { setSim(await api("/ledger/tamper-simulation", { method: "POST", body: {} })); }
    catch (err) { setError(err instanceof ApiError ? err.message : "The simulation failed to run."); }
    setBusy("");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="panel p-6" aria-label="Integrity verification">
        <h2 className="text-2xl">Integrity verification</h2>
        <p className="mt-2 text-sm text-sage">Recomputes every SHA-256 hash from the genesis hash forward and checks each link, the sequence and the stored checkpoints.</p>
        <button className="btn-primary mt-4" onClick={verify} disabled={busy === "verify"}>{busy === "verify" ? "Verifying" : "Run integrity verification"}</button>
        {result && (
          <div className="mt-5 border-t border-line pt-4" data-testid="verify-outcome">
            <Badge status={result.valid ? "valid" : "failed"} label={result.valid ? "Chain verified" : "Integrity failure"} />
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-sage">Events checked</dt><dd className="font-mono text-xs" data-testid="verify-count">{result.event_count}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-sage">Head hash</dt><dd><Hash value={result.head_hash} /></dd></div>
              <div className="flex justify-between gap-4"><dt className="text-sage">Checkpoints matched</dt><dd className="font-mono text-xs">{result.checkpoint_count}</dd></div>
            </dl>
            {result.failures.map((f: any) => <p key={`${f.seq}-${f.code}`} className="mt-2 text-sm text-[#e6a493]">{f.message}</p>)}
          </div>
        )}
      </section>

      <section className="panel p-6" aria-label="Tampering simulation">
        <h2 className="text-2xl">Tampering simulation</h2>
        <p className="mt-2 text-sm text-sage">Copies the ledger into memory, changes the amount of one historical event and verifies the copy. The stored ledger is not touched.</p>
        <button className="btn-danger mt-4" onClick={simulate} disabled={busy === "sim"}>{busy === "sim" ? "Running" : "Simulate a tampered record"}</button>
        {sim && (
          <div className="mt-5 space-y-3 border-t border-line pt-4 text-sm" data-testid="tamper-outcome">
            <p>Event <span className="font-mono">#{sim.target_seq}</span> changed from {rand(sim.original_amount)} to <span className="text-[#e6a493]">{rand(sim.tampered_amount)}</span>.</p>
            <div className="flex flex-wrap items-center gap-2"><span className="text-sage">Before the edit</span><Badge status="valid" label="Chain verified" /></div>
            <div className="flex flex-wrap items-center gap-2"><span className="text-sage">After the edit</span><Badge status="failed" label="Tampering detected" /></div>
            <p className="text-[#e6a493]" data-testid="tamper-message">{sim.after_edit.failures[0]?.message}</p>
            <div className="flex flex-wrap items-center gap-2"><span className="text-sage">Edit plus a recomputed hash</span><Badge status="failed" label="Tampering detected" /></div>
            <p className="text-[#e6a493]">{sim.after_edit_and_rehash.failures[0]?.message}</p>
            <p className="text-xs text-sage">{sim.note}</p>
          </div>
        )}
      </section>
      {error && <div className="lg:col-span-2"><Notice tone="error">{error}</Notice></div>}
    </div>
  );
}

export function LedgerTable({ events }: { events: any[] }) {
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[820px]" data-testid="ledger-table">
        <thead className="border-b border-line"><tr><th className="th">Seq</th><th className="th">Event</th><th className="th text-right">Amount</th><th className="th">Timestamp (UTC)</th><th className="th">Reference</th><th className="th">Previous hash</th><th className="th">Current hash</th></tr></thead>
        <tbody className="divide-y divide-line">
          {events.map((e) => (
            <tr key={e.event_id}>
              <td className="td font-mono text-xs">#{e.seq}</td>
              <td className="td whitespace-nowrap">{e.event_type === "CONTRIBUTION_VERIFIED" ? "Verified" : e.event_type === "CONTRIBUTION_REVERSED" ? "Reversed" : "Corrected"}<div className="text-xs text-sage">{e.verification_status.replace(/_/g, " ")}</div></td>
              <td className="td whitespace-nowrap text-right font-serif">{rand(e.amount)}</td>
              <td className="td whitespace-nowrap font-mono text-xs text-sage">{e.timestamp.slice(0, 19).replace("T", " ")}</td>
              <td className="td whitespace-nowrap font-mono text-xs text-sage">{e.transaction_reference}</td>
              <td className="td"><Hash value={e.previous_hash} n={8} /></td>
              <td className="td"><Hash value={e.current_hash} n={8} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
