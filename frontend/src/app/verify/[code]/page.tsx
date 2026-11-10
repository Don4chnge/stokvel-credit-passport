"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { day } from "@/lib/format";
import { Loading, Logo, SyntheticTag } from "@/components/ui";

export default function Verify({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [v, setV] = useState<any>(null);
  useEffect(() => { api(`/passport/verify/${encodeURIComponent(code)}`).then(setV).catch(() => setV({ authentic: false })); }, [code]);
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-12">
      <Link href="/" className="mb-10 flex items-center gap-2.5 font-serif text-lg"><Logo /> Stokvel Credit Passport</Link>
      <h1 className="text-3xl">Passport authenticity check</h1>
      {!v ? <Loading label="Checking" /> : v.authentic ? (
        <div className="panel mt-8 p-6" data-testid="verify-result">
          <p className="font-serif text-2xl text-lime">Authentic</p>
          <p className="mt-2 text-sm text-sage">This code matches a Passport report issued by the platform.</p>
          <dl className="mt-5 grid gap-3 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-sage">Passport ID</dt><dd className="font-mono">{v.passport_id}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-sage">Holder initials</dt><dd>{v.holder_initials}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-sage">Issued</dt><dd>{day(v.generated_at)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-sage">Latest report</dt><dd>{v.is_latest ? "Yes" : "No, a newer report exists"}</dd></div>
          </dl>
          {v.is_synthetic && <SyntheticTag className="mt-4" />}
          <p className="mt-5 text-xs text-sage">No financial detail is shown here. Ask the holder for a sharing link to see more.</p>
        </div>
      ) : (
        <div className="panel mt-8 p-6" data-testid="verify-result">
          <p className="font-serif text-2xl text-[#e6a493]">No match</p>
          <p className="mt-2 text-sm text-sage">No Passport report matches this code. Check the code or ask the holder for a new Passport.</p>
        </div>
      )}
    </main>
  );
}
