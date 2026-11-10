"use client";
import Link from "next/link";
import { use, useState } from "react";
import { api } from "@/lib/api";
import { Logo, Notice } from "@/components/ui";

export default function Unsubscribe({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  async function unsubscribe() {
    try { await api(`/pilot-interest/unsubscribe/${encodeURIComponent(token)}`, { method: "POST" }); setDone(true); }
    catch { setError("The request did not go through. Try again."); }
  }
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-12">
      <Link href="/" className="mb-10 flex items-center gap-2.5 font-serif text-lg"><Logo /> Stokvel Credit Passport</Link>
      <h1 className="text-3xl">Stop messages about the pilot</h1>
      {done ? <div className="mt-6"><Notice tone="success">You are unsubscribed. We will not contact you again.</Notice></div> : (<>
        <p className="mt-3 text-sage">One step. No sign-in and no questions.</p>
        <button className="btn-primary mt-6 self-start" onClick={unsubscribe}>Unsubscribe</button>
        {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
      </>)}
    </main>
  );
}
