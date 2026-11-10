"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { analyticsConfigured, hasConsent, setConsent } from "@/lib/analytics";
import { useAuth } from "@/lib/auth";
import { Notice, PageHeader } from "@/components/ui";

export default function Account() {
  const { user } = useAuth();
  const [msg, setMsg] = useState("");
  const [analytics, setAnalytics] = useState(() => hasConsent());

  async function download() {
    const data = await api("/members/me/export");
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = "my-stokvel-passport-data.json"; a.click();
    URL.revokeObjectURL(url);
    setMsg("Your data file was downloaded.");
  }
  async function requestDeletion() {
    const r = await api("/members/me/deletion-request", { method: "POST" });
    setMsg(r.detail);
  }
  async function toggleAnalytics(next: boolean) {
    setConsent(next); setAnalytics(next);
    await api("/members/me/analytics-consent", { method: "PATCH", body: { analytics_consent: next } });
  }

  return (
    <>
      <PageHeader title="Account and privacy" lead="Your details, your data and your choices." />
      {msg && <div className="mb-6"><Notice tone="success">{msg}</Notice></div>}
      <div className="space-y-6">
        <section className="panel p-6"><h2 className="text-2xl">Your details</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-sage">Name</dt><dd>{user?.full_name}</dd></div>
            <div><dt className="text-sage">Email</dt><dd>{user?.email}</dd></div>
            <div><dt className="text-sage">Passport ID</dt><dd className="font-mono">{user?.passport_id}</dd></div>
          </dl></section>
        <section className="panel p-6"><h2 className="text-2xl">Download your information</h2>
          <p className="mt-2 max-w-prose text-sm text-sage">A file with your account, every contribution record, your Passport and every sharing link you created.</p>
          <button className="btn-quiet mt-4" onClick={download}>Download my data</button></section>
        <section className="panel p-6"><h2 className="text-2xl">Correct a record</h2>
          <p className="mt-2 max-w-prose text-sm text-sage">Open <Link href="/member/contributions" className="text-lime underline-offset-4 hover:underline">Contributions</Link> and choose Report a problem beside the record. Your treasurer reviews it.</p></section>
        <section className="panel p-6"><h2 className="text-2xl">Product analytics</h2>
          <p className="mt-2 max-w-prose text-sm text-sage">Anonymous usage events help improve the product. They carry no names, amounts, references or identity numbers.</p>
          {analyticsConfigured() ? (
            <label className="mt-4 flex items-center gap-3 text-sm"><input type="checkbox" checked={analytics} onChange={(e) => toggleAnalytics(e.target.checked)} className="h-4 w-4 accent-[#C6E66B]" /> Allow anonymous analytics</label>
          ) : <p className="mt-3 text-sm text-sage">Analytics is switched off in this environment. Nothing is collected.</p>}</section>
        <section className="panel p-6"><h2 className="text-2xl">Delete your account</h2>
          <p className="mt-2 max-w-prose text-sm text-sage">Send a deletion request. Personal details are removed after review. Ledger entries stay in pseudonymised form so the chain remains verifiable. See the <Link href="/legal#retention" className="text-lime underline-offset-4 hover:underline">data retention policy</Link>.</p>
          <button className="btn-danger mt-4" onClick={requestDeletion}>Request account deletion</button></section>
      </div>
    </>
  );
}
