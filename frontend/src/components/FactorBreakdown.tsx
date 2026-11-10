export type Factors = Record<string, { label: string; value: number; weight: number; points: number }>;

export function FactorBreakdown({ factors }: { factors: Factors }) {
  return (
    <div className="space-y-4" data-testid="factor-breakdown">
      {Object.entries(factors).map(([key, f]) => (
        <div key={key}>
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span>{f.label}</span>
            <span className="font-mono text-xs text-sage">{Math.round(f.value)}/100 × {Math.round(f.weight * 100)}% = {f.points.toFixed(1)}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-deep" role="img" aria-label={`${f.label}: ${Math.round(f.value)} out of 100`}>
            <div className="h-full rounded-full bg-lime" style={{ width: `${Math.max(0, Math.min(100, f.value))}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Explanation({ e }: { e: { headline: string; strengths: string[]; improvements: string[]; notes: string[] } }) {
  return (
    <div data-testid="score-explanation">
      <p className="font-serif text-xl">{e.headline}</p>
      {e.strengths.length > 0 && (<>
        <p className="mt-4 text-sm text-sage">Your index is supported by:</p>
        <ul className="mt-2 space-y-1.5 text-sm">{e.strengths.map((s) => <li key={s} className="flex gap-2.5"><span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-lime" aria-hidden />{s}</li>)}</ul>
      </>)}
      {e.improvements.length > 0 && (<>
        <p className="mt-4 text-sm text-sage">What would raise it:</p>
        <ul className="mt-2 space-y-1.5 text-sm">{e.improvements.map((s) => <li key={s} className="flex gap-2.5"><span className="mt-2 h-1.5 w-1.5 flex-none rounded-full border border-copper" aria-hidden />{s}</li>)}</ul>
      </>)}
      {e.notes.map((n) => <p key={n} className="mt-3 text-xs text-sage">{n}</p>)}
    </div>
  );
}
