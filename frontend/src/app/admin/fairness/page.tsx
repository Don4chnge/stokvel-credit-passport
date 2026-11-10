"use client";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, ApiError } from "@/lib/api";
import { dayTime, titleCase } from "@/lib/format";
import { Notice, PageHeader, SyntheticTag } from "@/components/ui";

const SERIES = ["#C6E66B", "#B78A62", "#A8B8AE", "#7FA6A0", "#E6A493", "#F4F1E8"];

function distribution(groups: any[]) {
  const shown = groups.filter((g) => g.group !== "Not recorded");
  return groups[0].distribution.map((b: any, i: number) => {
    const row: any = { bin: b.bin };
    shown.forEach((g) => { row[g.group] = g.n ? Math.round((g.distribution[i].count / g.n) * 100) : 0; });
    return row;
  });
}

export default function Fairness() {
  const [r, setR] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true); setError("");
    try { setR(await api("/analytics/fairness")); } catch (err) { setError(err instanceof ApiError ? err.message : "The report failed to run."); }
    setBusy(false);
  }

  return (
    <>
      <PageHeader title="Fairness report" lead="Checks whether index outcomes differ across age and gender groups. Protected attributes are stored apart from scoring inputs and are read only by this audit."
        actions={<button className="btn-primary" onClick={run} disabled={busy}>{busy ? "Running the audit" : "Run fairness report"}</button>} />
      {error && <Notice tone="error">{error}</Notice>}
      {!r && !error && <div className="panel p-6 text-sm text-sage">Run the report to score every member and compare groups. Each run is stored with its model version.</div>}
      {r && (
        <div data-testid="fairness-report">
          <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-sage">
            {r.data_is_synthetic && <SyntheticTag />}<span>Model <span className="font-mono text-ivory">{r.model_version}</span></span>
            <span>{r.members_evaluated} members evaluated</span><span>Run {dayTime(r.run_at)}</span>
          </div>
          <Notice tone="error">Fairness cannot be established from synthetic data alone. These results demonstrate the audit method. They are not evidence about real members.</Notice>

          <section className="mt-6 panel p-6"><h2 className="text-2xl">Flags</h2>
            <ul className="mt-3 space-y-1.5 text-sm" data-testid="fairness-flags">{r.flags.map((f: string) => <li key={f} className="flex gap-2.5"><span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-copper" aria-hidden />{f}</li>)}</ul>
            <p className="mt-4 text-xs text-sage">Scoring inputs: <span className="font-mono">{r.scoring_inputs.join(", ")}</span>. Protected attributes used in scoring: none. Scores are never adjusted by group.</p>
          </section>

          {r.attributes.map((a: any) => (
            <section key={a.attribute} className="mt-10">
              <h2 className="text-2xl">Index by {a.attribute.replace("_", " ")}</h2>
              <p className="mt-1 text-sm text-sage">Largest gap between group averages: {a.largest_mean_gap} points. {a.gap_is_reliable ? "Every group has at least 30 members." : "At least one group is below 30 members, so the gap is unreliable."}</p>
              <div className="mt-4 grid gap-6">
                <div className="panel overflow-x-auto">
                  <table className="w-full min-w-[460px]">
                    <thead className="border-b border-line"><tr><th className="th">Group</th><th className="th text-right">Members</th><th className="th text-right">Average</th><th className="th text-right">Median</th><th className="th text-right">25th to 75th</th><th className="th text-right">At or above {r.threshold}</th></tr></thead>
                    <tbody className="divide-y divide-line">
                      {a.groups.map((g: any) => (
                        <tr key={g.group}><td className="td">{g.group}{g.small_sample && <div className="text-xs text-copper">Sample too small</div>}</td>
                          <td className="td text-right">{g.n}</td><td className="td text-right font-serif">{g.mean}</td><td className="td text-right">{g.median}</td>
                          <td className="td whitespace-nowrap text-right text-sage">{g.p25} to {g.p75}</td><td className="td text-right">{Math.round(g.share_at_or_above_threshold * 100)}%</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="panel h-72 p-4" role="img" aria-label={`Index distribution by ${a.attribute.replace("_", " ")}, share of each group per index band`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={distribution(a.groups)} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="#2B3D36" vertical={false} />
                      <XAxis dataKey="bin" tick={{ fill: "#A8B8AE", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#2B3D36" }} />
                      <YAxis tick={{ fill: "#A8B8AE", fontSize: 11 }} tickLine={false} axisLine={false} width={40} unit="%" />
                      <Tooltip cursor={{ fill: "rgba(198,230,107,0.06)" }} contentStyle={{ background: "#101B19", border: "1px solid #2B3D36", borderRadius: 6, fontSize: 12 }} formatter={(v: any) => `${v}% of group`} />
                      <Legend wrapperStyle={{ fontSize: 12, color: "#A8B8AE" }} />
                      {a.groups.filter((g: any) => g.group !== "Not recorded").map((g: any, i: number) => <Bar isAnimationActive={false} key={g.group} dataKey={g.group} fill={SERIES[i % SERIES.length]} radius={[2, 2, 0, 0]} />)}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>
          ))}

          <section className="mt-10 grid gap-6 lg:grid-cols-2">
            <div className="panel p-6"><h2 className="text-2xl">Missing data</h2>
              <table className="mt-3 w-full text-sm"><thead><tr><th className="th pl-0">Attribute</th><th className="th text-right">Missing</th><th className="th text-right">Avg, missing</th><th className="th pr-0 text-right">Avg, recorded</th></tr></thead>
                <tbody className="divide-y divide-line">{Object.entries(r.missing_data).map(([k, v]: any) => <tr key={k}><td className="td pl-0">{titleCase(k)}</td><td className="td text-right">{v.missing} ({Math.round(v.share_missing * 100)}%)</td><td className="td text-right">{v.mean_score_missing ?? "None"}</td><td className="td pr-0 text-right">{v.mean_score_recorded}</td></tr>)}</tbody></table>
            </div>
            <div className="panel p-6"><h2 className="text-2xl">Error-rate analysis</h2>
              {r.error_analysis.available ? (<>
                <p className="mt-2 text-xs text-copper">Synthetic label. {r.error_analysis.label_definition}</p>
                <table className="mt-3 w-full text-sm"><thead><tr><th className="th pl-0">Group</th><th className="th text-right">Members</th><th className="th text-right">False negatives</th><th className="th pr-0 text-right">False positives</th></tr></thead>
                  <tbody className="divide-y divide-line">{[...r.error_analysis.by_gender, ...r.error_analysis.by_age_band].map((g: any) => <tr key={g.group}><td className="td pl-0">{g.group}{g.small_sample && <span className="ml-2 text-xs text-copper">small</span>}</td><td className="td text-right">{g.n}</td>
                    <td className="td text-right">{g.false_negative_rate === null ? "None" : `${Math.round(g.false_negative_rate * 100)}%`}</td><td className="td pr-0 text-right">{g.false_positive_rate === null ? "None" : `${Math.round(g.false_positive_rate * 100)}%`}</td></tr>)}</tbody></table>
              </>) : <p className="mt-2 text-sm text-sage">{r.error_analysis.reason}</p>}
            </div>
          </section>

          <section className="mt-10 panel p-6"><h2 className="text-2xl">Limitations of this evaluation</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-sage">{r.limitations.map((l: string) => <li key={l} className="flex gap-2.5"><span className="mt-2 h-1.5 w-1.5 flex-none rounded-full border border-sage" aria-hidden />{l}</li>)}</ul></section>
        </div>
      )}
    </>
  );
}
