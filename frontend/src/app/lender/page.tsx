"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Notice, PageHeader } from "@/components/ui";

export default function LenderHome() {
  const router = useRouter();
  const [error, setError] = useState("");

  function open(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = String(new FormData(e.currentTarget).get("link") || "").trim();
    const token = raw.includes("/") ? raw.split("/").filter(Boolean).pop() || "" : raw;
    if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) { setError("That does not look like a Passport link. Paste the full link the member sent you."); return; }
    router.push(`/lender/view/${token}`);
  }

  return (
    <>
      <PageHeader title="Verify a Passport" lead="Open a Passport with the link a member sent you. You see only what that member chose to share, for as long as they allow." />
      <form onSubmit={open} className="panel p-6" aria-label="Open a shared Passport">
        <label className="label" htmlFor="link">Passport sharing link</label>
        <div className="flex flex-wrap gap-3">
          <input id="link" name="link" required className="field min-w-0 flex-1 font-mono text-xs" placeholder="https://…/lender/view/…" />
          <button className="btn-primary">Open Passport</button>
        </div>
        {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
      </form>
      <section className="mt-10 grid gap-8 md:grid-cols-3">
        {[["Consent based", "There is no member directory. Access exists only through a link a member created for you."],
          ["Time limited", "Each link expires. The member is able to revoke it earlier. Every access attempt is logged and visible to the member."],
          ["One input, not a decision", "The reliability index describes stokvel contribution behaviour. It has not been validated against loan repayment and it is not a credit bureau score."]].map(([h, t]) => (
          <div key={h} className="border-t border-line pt-4"><h2 className="text-xl">{h}</h2><p className="mt-2 text-sm leading-relaxed text-sage">{t}</p></div>
        ))}
      </section>
    </>
  );
}
