"use client";
import { useEffect, useState } from "react";
import { rand } from "@/lib/format";

type Row = { seq: number; member: string; amount: string; date: string };
const ROWS: Row[] = [
  { seq: 1, member: "Member A", amount: "500.00", date: "2026-07-25" },
  { seq: 2, member: "Member B", amount: "500.00", date: "2026-07-25" },
  { seq: 3, member: "Member A", amount: "500.00", date: "2026-08-25" },
  { seq: 4, member: "Member C", amount: "500.00", date: "2026-08-26" },
];
const GENESIS = "0".repeat(64);

async function sha256(text: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const canonical = (r: Row) => JSON.stringify({ amount: r.amount, date: r.date, member: r.member, seq: r.seq });

/** A working hash chain in the browser. Edit one amount and the chain reports the break. */
export function LedgerDemo() {
  const [stored, setStored] = useState<{ row: Row; prev: string; hash: string }[]>([]);
  const [tampered, setTampered] = useState(false);
  const [check, setCheck] = useState<boolean[]>([]);

  useEffect(() => {
    (async () => {
      let prev = GENESIS;
      const out = [];
      for (const row of ROWS) {
        const hash = await sha256(prev + canonical(row));
        out.push({ row, prev, hash });
        prev = hash;
      }
      setStored(out);
      setCheck(out.map(() => true));
    })();
  }, []);

  useEffect(() => {
    if (!stored.length) return;
    (async () => {
      const result: boolean[] = [];
      let broken = false;
      for (const s of stored) {
        const row = tampered && s.row.seq === 2 ? { ...s.row, amount: "5000.00" } : s.row;
        const ok = (await sha256(s.prev + canonical(row))) === s.hash;
        if (!ok) broken = true;
        result.push(!broken);
      }
      setCheck(result);
    })();
  }, [tampered, stored]);

  const intact = check.every(Boolean);
  return (
    <div className="panel overflow-hidden" data-testid="ledger-demo">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <p className="font-serif text-xl">Try to change the record</p>
          <p className="text-sm text-sage">Four illustrative contributions, hashed with SHA-256 in your browser.</p>
        </div>
        <span data-testid="demo-status" className={`rounded-full border px-3 py-1 text-xs font-medium ${intact ? "border-lime/50 text-lime" : "border-[#d98a7a]/60 text-[#e6a493]"}`}>
          {intact ? "Chain intact" : "Tampering detected"}
        </span>
      </div>
      <ol>
        {stored.map((s, i) => {
          const edited = tampered && s.row.seq === 2;
          return (
            <li key={s.row.seq} className={`grid gap-1 border-b border-line px-5 py-3 sm:grid-cols-[2.5rem_1fr_auto] sm:items-center ${check[i] ? "" : "bg-[#d98a7a]/10"}`}>
              <span className="font-mono text-xs text-sage">#{s.row.seq}</span>
              <div>
                <p className="text-sm">{s.row.member} paid <span className={edited ? "text-[#e6a493] line-through" : ""}>{rand(s.row.amount)}</span>
                  {edited && <span className="ml-2 text-[#e6a493]">{rand("5000")}</span>} on {s.row.date}</p>
                <p className="hash break-all">{s.hash.slice(0, 24)}… links to {s.prev.slice(0, 10)}…</p>
              </div>
              <span className={`text-xs ${check[i] ? "text-lime" : "text-[#e6a493]"}`}>{check[i] ? "Verified" : edited ? "Hash mismatch" : "Chain broken upstream"}</span>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <button type="button" className={tampered ? "btn-quiet" : "btn-danger"} onClick={() => setTampered(!tampered)}>
          {tampered ? "Restore the original record" : "Change contribution #2 to R 5 000"}
        </button>
        <p className="text-xs text-sage">Each record carries the hash of the record before. One edit breaks every link after.</p>
      </div>
    </div>
  );
}
