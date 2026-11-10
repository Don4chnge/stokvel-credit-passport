"use client";
import { useState } from "react";
import { shortHash, titleCase } from "@/lib/format";

const STATUS_STYLE: Record<string, string> = {
  verified: "border-lime/50 text-lime", active: "border-lime/50 text-lime", granted: "border-lime/50 text-lime",
  succeeded: "border-lime/50 text-lime", valid: "border-lime/50 text-lime",
  pending: "border-sage/50 text-sage", invited: "border-sage/50 text-sage", open: "border-sage/50 text-sage",
  upcoming: "border-line text-sage", closed: "border-line text-sage",
  under_review: "border-copper/60 text-copper", expired: "border-copper/60 text-copper",
  rejected: "border-[#d98a7a]/60 text-[#e6a493]", reversed: "border-[#d98a7a]/60 text-[#e6a493]",
  revoked: "border-[#d98a7a]/60 text-[#e6a493]", failed: "border-[#d98a7a]/60 text-[#e6a493]",
};

export function Badge({ status, label }: { status: string; label?: string }) {
  return (
    <span data-status={status} className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status] || "border-line text-sage"}`}>
      {label || titleCase(status)}
    </span>
  );
}

export function Hash({ value, n = 10 }: { value?: string | null; n?: number }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="hash">Not on ledger</span>;
  return (
    <button type="button" title={`${value} (select to copy)`} className="hash hover:text-ivory"
      onClick={() => { void navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>
      {copied ? "Copied" : shortHash(value, n)}
    </button>
  );
}

export function Stat({ label, value, hint, testid }: { label: string; value: React.ReactNode; hint?: string; testid?: string }) {
  return (
    <div className="border-t border-line pt-4" data-testid={testid}>
      <div className="font-serif text-2xl text-ivory">{value}</div>
      <div className="mt-1 text-sm text-sage">{label}</div>
      {hint && <div className="mt-0.5 text-xs text-sage/70">{hint}</div>}
    </div>
  );
}

export function SyntheticTag({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-copper/50 px-2.5 py-0.5 text-xs text-copper ${className}`}
      title="Invented for demonstration. No real person, stokvel or lender.">
      <span className="h-1.5 w-1.5 rounded-full bg-copper" aria-hidden /> Synthetic demo data
    </span>
  );
}

export function TestModeTag() {
  return <span className="inline-flex items-center rounded border border-lime/40 bg-lime/10 px-2 py-0.5 font-mono text-[11px] font-medium tracking-wide text-lime">TEST MODE</span>;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "success"; children: React.ReactNode }) {
  const style = tone === "error" ? "border-[#d98a7a]/50 text-[#f0b9ab]" : tone === "success" ? "border-lime/40 text-lime" : "border-line text-sage";
  return <div role={tone === "error" ? "alert" : "status"} className={`rounded-md border bg-deep/60 px-4 py-3 text-sm ${style}`}>{children}</div>;
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="panel flex flex-col items-start gap-3 px-6 py-10" data-testid="empty-state">
      <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden>
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return <circle key={i} cx={22 + Math.cos(a) * 17} cy={22 + Math.sin(a) * 17} r="2" fill="none" stroke="#A8B8AE" strokeOpacity=".6" />;
        })}
      </svg>
      <h3 className="text-xl">{title}</h3>
      {children && <p className="max-w-prose text-sm text-sage">{children}</p>}
      {action}
    </div>
  );
}

export function PageHeader({ title, lead, actions }: { title: string; lead?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl">{title}</h1>
        {lead && <p className="mt-2 max-w-prose text-sage">{lead}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return <div className="py-16 text-sm text-sage" role="status">{label}…</div>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-deep/80 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label={title}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-line bg-forest p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="text-2xl">{title}</h2>
          <button type="button" onClick={onClose} className="text-sm text-sage hover:text-ivory" aria-label="Close">Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        return <circle key={i} cx={16 + Math.cos(a) * 12} cy={16 + Math.sin(a) * 12} r={i < 9 ? 2.1 : 1.6}
          fill={i < 9 ? "#C6E66B" : "none"} stroke={i < 9 ? "none" : "#A8B8AE"} />;
      })}
      <circle cx="16" cy="16" r="3.2" fill="#F4F1E8" />
    </svg>
  );
}
