"use client";
import { QRCodeSVG } from "qrcode.react";
import { ContributionRing, RingTick } from "./ContributionRing";
import { SyntheticTag } from "./ui";
import { day, rand } from "@/lib/format";

export type PassportData = {
  member_name: string; passport_id: string; verification_code?: string; generated_at?: string;
  last_verified_at?: string | null; is_synthetic?: boolean;
  index?: { score: number; provisional: boolean; model_version: string; timeline?: RingTick[] };
  totals?: { total_verified: string; verified_count: number; on_time_percentage: number | null; participation_months: number };
};

export function PassportCard({ p, verifyUrl, animate = false, illustrative = false }:
  { p: PassportData; verifyUrl?: string; animate?: boolean; illustrative?: boolean }) {
  return (
    <article data-testid="passport-card"
      className="relative overflow-hidden rounded-card border border-line bg-gradient-to-br from-pine to-deep p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] sm:p-8">
      <div className="seat-field pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-sage">Stokvel Credit Passport</p>
          <p className="mt-1 font-mono text-sm text-ivory" data-testid="passport-id">{p.passport_id}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-lime/50 px-2.5 py-0.5 text-xs text-lime">
            <span className="h-1.5 w-1.5 rounded-full bg-lime" aria-hidden /> Ledger verified
          </span>
          {(p.is_synthetic || illustrative) && <SyntheticTag />}
        </div>
      </div>

      <div className="relative mt-6 grid items-center gap-6 sm:grid-cols-[auto_minmax(0,1fr)]">
        {p.index
          ? <ContributionRing ticks={p.index.timeline || []} score={p.index.score} provisional={p.index.provisional} size={190} animate={animate} />
          : <div className="flex h-[190px] w-[190px] items-center justify-center rounded-full border border-dashed border-line text-center text-xs text-sage">Index not shared</div>}
        <div>
          <h3 className="text-3xl leading-tight" data-testid="passport-name">{p.member_name}</h3>
          {p.totals && (
            <dl className="mt-5 grid grid-cols-[auto_auto] justify-start gap-x-8 gap-y-4 text-sm">
              <div><dt className="text-sage">Total verified</dt><dd className="mt-0.5 whitespace-nowrap font-serif text-xl">{rand(p.totals.total_verified)}</dd></div>
              <div><dt className="text-sage">Verified payments</dt><dd className="mt-0.5 font-serif text-xl">{p.totals.verified_count}</dd></div>
              <div><dt className="text-sage">Paid on time</dt><dd className="mt-0.5 font-serif text-xl">{p.totals.on_time_percentage ?? 0}%</dd></div>
              <div><dt className="text-sage">Participation</dt><dd className="mt-0.5 font-serif text-xl">{p.totals.participation_months} months</dd></div>
            </dl>
          )}
        </div>
      </div>

      <div className="relative mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-line pt-5">
        <dl className="grid gap-1 text-xs text-sage">
          <div className="flex gap-2"><dt>Last verified contribution</dt><dd className="text-ivory">{day(p.last_verified_at)}</dd></div>
          {p.generated_at && <div className="flex gap-2"><dt>Issued</dt><dd className="text-ivory">{day(p.generated_at)}</dd></div>}
          {p.index && <div className="flex gap-2"><dt>Model</dt><dd className="font-mono text-ivory">{p.index.model_version}</dd></div>}
          {p.verification_code && <div className="flex gap-2"><dt>Verification code</dt><dd className="font-mono text-ivory">{p.verification_code}</dd></div>}
        </dl>
        {verifyUrl && (
          <div className="rounded-md bg-ivory p-2" title="Scan to check that this Passport is authentic">
            <QRCodeSVG value={verifyUrl} size={72} bgColor="#F4F1E8" fgColor="#101B19" />
          </div>
        )}
      </div>
      <p className="relative mt-4 text-xs leading-relaxed text-sage/80">
        The Contribution Reliability Index is an experimental measure of contribution behaviour. It is not a credit bureau score and it does not guarantee credit approval.
      </p>
    </article>
  );
}
