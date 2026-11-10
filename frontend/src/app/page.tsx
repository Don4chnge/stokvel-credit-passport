import Link from "next/link";
import { SiteFooter, SiteNav } from "@/components/Shell";
import { PassportCard } from "@/components/PassportCard";
import { LedgerDemo } from "@/components/LedgerDemo";
import { PilotForm } from "@/components/PilotForm";
import { ContributionRing, RingLegend } from "@/components/ContributionRing";

const SAMPLE_TIMELINE = ["on_time", "on_time", "on_time", "on_time", "missed", "on_time", "on_time", "on_time", "late", "on_time", "on_time", "on_time"].map((state) => ({ state }));
const SAMPLE = {
  member_name: "Nomvula Dlamini", passport_id: "SCP-7K4M-X2PD", verification_code: "PV3F9A21C07B", is_synthetic: true,
  last_verified_at: "2026-10-25T09:00:00Z", generated_at: "2026-11-02T09:00:00Z",
  index: { score: 84, provisional: false, model_version: "cri-1.0.0", timeline: SAMPLE_TIMELINE },
  totals: { total_verified: "5500.00", verified_count: 11, on_time_percentage: 83.3, participation_months: 12 },
};

const JOURNEY = [
  ["Register the group", "A stokvel sets its contribution amount and schedule, then invites its members."],
  ["Contribute", "A member pays by PayShap Request or records a payment made another way."],
  ["Verify", "The payment provider confirms the payment, or the treasurer checks it against the group account."],
  ["Seal on the ledger", "Each verified contribution joins a hash chain. Later edits are detectable."],
  ["Carry your Passport", "The member's record updates. The member decides who sees it and for how long."],
];

const FAQ = [
  ["Is the Contribution Reliability Index a credit score?", "No. The index is an experimental measure of contribution behaviour, from 0 to 100. A credit bureau did not produce it, and it does not guarantee approval for credit. A lender decides how much weight to give it."],
  ["Who owns the Passport?", "The member. Nobody sees a Passport unless the member creates a sharing link. Each link has an expiry date, lists exactly what is shared, and the member cancels it at any time."],
  ["How does a contribution become verified?", "Two ways. A payment provider confirms the payment, or the stokvel treasurer checks it against the group account. A screenshot or a member's own entry is never enough."],
  ["What happens when a record is wrong?", "The member reports it. The treasurer reviews. A verified record is never edited. A correction or reversal is added as a new linked record, so the history stays complete."],
  ["Does the index use my age, gender or race?", "No. The index reads contribution behaviour only: dates, amounts paid, misses and recoveries. A separate audit checks whether outcomes differ between groups."],
  ["Are real payments processed?", "Not in this prototype. Payments run in TEST MODE. Live PayShap Request needs an authorised payment provider account."],
  ["Is my stokvel's money held by the platform?", "No. The platform records and verifies contributions. The money stays in the stokvel's own bank account."],
];

function Section({ id, title, lead, children, tone = "" }: { id?: string; title: string; lead?: string; children: React.ReactNode; tone?: string }) {
  return (
    <section id={id} className={`border-t border-line ${tone}`}>
      <div className="mx-auto max-w-page px-5 py-20 lg:py-28">
        <div className="max-w-3xl">
          <h2 className="text-3xl sm:text-4xl">{title}</h2>
          {lead && <p className="mt-5 text-lg leading-relaxed text-sage">{lead}</p>}
        </div>
        <div className="mt-12">{children}</div>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <>
      <SiteNav />
      <main id="main">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="seat-field pointer-events-none absolute inset-0" aria-hidden />
          <div className="relative mx-auto grid max-w-page items-center gap-12 px-5 py-16 lg:grid-cols-[1.05fr_1fr] lg:py-24">
            <div>
              <h1 className="text-4xl leading-[1.05] sm:text-5xl lg:text-6xl">Your contributions. Your financial identity.</h1>
              <p className="mt-6 max-w-xl text-xl leading-relaxed text-sage">Make years of responsible stokvel saving visible to the financial system.</p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link href="/register" className="btn-primary px-5 py-3">Explore Your Passport</Link>
                <Link href="/#for-lenders" className="btn-quiet px-5 py-3">For Financial Institutions</Link>
              </div>
              <p className="mt-8 max-w-md border-l border-copper pl-4 font-serif text-lg italic text-ivory/90">
                Years of responsible stokvel saving should count for something.
              </p>
            </div>
            <div>
              <PassportCard p={SAMPLE} animate illustrative />
              <p className="mt-3 text-xs text-sage">Illustrative Passport. The name and figures are invented.</p>
            </div>
          </div>
        </section>

        <Section id="problem" title="A savings record the financial system does not see"
          lead="South Africans pay into stokvels every week and every month, often for years. The discipline is real. The record sits in a notebook, a group chat or a treasurer's memory.">
          <div className="grid gap-10 lg:grid-cols-3">
            {[["On the member's side", "A member contributes on time for years. A lender asks for a credit history and finds little. The saving happened where no record reaches."],
              ["On the stokvel's side", "The treasurer tracks payments by hand. Disputes about who paid take time and trust. A lost book loses the history."],
              ["On the lender's side", "A lender meets an applicant with a thin file and no way to check a claim of regular saving. A paper statement from a group is hard to trust."]].map(([h, t]) => (
              <div key={h} className="border-t border-copper/60 pt-5">
                <h3 className="text-xl">{h}</h3>
                <p className="mt-3 leading-relaxed text-sage">{t}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="how-it-works" title="How it works"
          lead="Every verified contribution becomes a sealed record. The records add up to a Passport the member owns.">
          <ol className="relative grid gap-0 lg:grid-cols-5">
            {JOURNEY.map(([h, t], i) => (
              <li key={h} className="relative border-l border-line pb-10 pl-6 lg:border-l-0 lg:border-t lg:pb-0 lg:pl-0 lg:pr-6 lg:pt-8">
                <span className="absolute -left-[7px] top-0 h-3.5 w-3.5 rounded-full border-2 border-lime bg-forest lg:-top-[7px] lg:left-0" aria-hidden />
                <p className="font-mono text-xs text-sage">Step {i + 1} of 5</p>
                <h3 className="mt-2 text-xl">{h}</h3>
                <p className="mt-2 text-sm leading-relaxed text-sage">{t}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="for-members" title="For members: a record you own"
          lead="The Passport shows what you contributed, how reliably, and why your index has its value. You decide who sees it.">
          <div className="grid items-start gap-12 lg:grid-cols-[auto_1fr]">
            <div className="flex flex-col items-center gap-4">
              <ContributionRing ticks={SAMPLE_TIMELINE} score={84} size={240} />
              <RingLegend />
              <p className="text-xs text-sage">Illustrative. One seat per contribution period.</p>
            </div>
            <div className="grid gap-8 sm:grid-cols-2">
              {[["An index you are able to read", "The index breaks into six plain factors. Each one shows its weight and your result. No hidden inputs."],
                ["Misses are not the end", "One missed month lowers the index for a time. A recovery restores part of it. A temporary interruption is not treated as a character flaw."],
                ["Share on your terms", "Create a link for one lender. Choose what the link shows and when it expires. Cancel it whenever you like."],
                ["See every access", "Your consent centre lists who opened your Passport and when. Download your own data at any time."]].map(([h, t]) => (
                <div key={h}><h3 className="text-xl">{h}</h3><p className="mt-2 leading-relaxed text-sage">{t}</p></div>
              ))}
            </div>
          </div>
        </Section>

        <Section id="for-stokvels" title="For stokvels: fewer disputes, cleaner books"
          lead="The treasurer sees who paid, who is late and what is outstanding, in one place. Members see the same record.">
          <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {[["Contribution calendar", "Each period shows paid, late, missed and outstanding members."],
              ["Three levels of proof", "Self-reported, verified by treasurer, or confirmed by the payment provider. Always labelled."],
              ["Roles", "Owner, treasurer, administrator and member, each with its own permissions."],
              ["Your money stays yours", "The platform records contributions. Funds stay in the group's bank account."]].map(([h, t]) => (
              <div key={h} className="bg-forest p-6"><h3 className="text-lg">{h}</h3><p className="mt-2 text-sm leading-relaxed text-sage">{t}</p></div>
            ))}
          </div>
        </Section>

        <Section id="security" title="Ledger security and verification"
          lead="Verified contributions are stored in an append-only chain. Each record includes the SHA-256 hash of the record before it.">
          <div className="grid items-start gap-10 lg:grid-cols-[1.2fr_1fr]">
            <LedgerDemo />
            <div className="space-y-6">
              {[["Append only", "Records are added, never overwritten. A reversal or correction is a new record linked to the original."],
                ["Checkable by anyone signed in", "One request recomputes every hash and reports the first record where the chain fails."],
                ["Honest about limits", "A hash chain exposes later edits. Someone with full control of the database could rewrite the whole chain, so chain checkpoints are designed for publication to an independent party."],
                ["Protected access", "Passwords are hashed with bcrypt. Sharing links are stored as hashes. Every sensitive action is written to an audit log."]].map(([h, t]) => (
                <div key={h} className="border-l border-line pl-5"><h3 className="text-lg">{h}</h3><p className="mt-1.5 text-sm leading-relaxed text-sage">{t}</p></div>
              ))}
            </div>
          </div>
        </Section>

        <Section id="consent" title="Member ownership and consent" tone="bg-deep/40"
          lead="The platform does not sell member data and does not approve or decline credit. Sharing starts with the member, every time.">
          <div className="grid gap-8 md:grid-cols-4">
            {[["Choose", "Pick what to share: the index, the explanation, totals, history, memberships."],
              ["Limit", "Set an expiry from 1 to 90 days."],
              ["Watch", "See each time the link is opened, and by which organisation."],
              ["Revoke", "Cancel access in one step. The link stops working at once."]].map(([h, t]) => (
              <div key={h}><p className="font-serif text-2xl text-lime">{h}</p><p className="mt-2 text-sm leading-relaxed text-sage">{t}</p></div>
            ))}
          </div>
        </Section>

        <Section id="for-lenders" title="For lenders: a verifiable signal for thin-file applicants"
          lead="When a member shares a Passport, you see contribution behaviour backed by a ledger, with its provenance, and only the fields the member authorised.">
          <div className="grid gap-10 lg:grid-cols-2">
            <ul className="space-y-5">
              {[["Consent first", "You open a Passport through a member's link. There is no member directory to browse."],
                ["Authenticity check", "Each report carries a verification code and the ledger head hash at the time of issue."],
                ["Explainable", "The index ships with its factor breakdown and model version. No black box."],
                ["A documented API", "REST endpoints with OpenAPI documentation for pilot integrations."]].map(([h, t]) => (
                <li key={h} className="flex gap-4"><span className="mt-2 h-2 w-2 flex-none rounded-full bg-lime" aria-hidden /><div><h3 className="text-lg">{h}</h3><p className="mt-1 text-sm leading-relaxed text-sage">{t}</p></div></li>
              ))}
            </ul>
            <div className="panel p-6">
              <p className="font-serif text-xl">What the index is, and is not</p>
              <p className="mt-3 text-sm leading-relaxed text-sage">The Contribution Reliability Index describes contribution behaviour inside stokvels. It has not been validated against loan repayment. Treat it as one input beside your own affordability and credit assessment under the National Credit Act.</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/register?type=lender" className="btn-primary">Create a lender account</Link>
                <a href="/api/docs" className="btn-quiet">Read the API documentation</a>
              </div>
            </div>
          </div>
        </Section>

        <Section id="faq" title="Frequently asked questions">
          <div className="max-w-3xl divide-y divide-line border-y border-line">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg">
                  {q}<span className="text-sage transition-transform group-open:rotate-45" aria-hidden>+</span>
                </summary>
                <p className="mt-3 leading-relaxed text-sage">{a}</p>
              </details>
            ))}
          </div>
        </Section>

        <Section id="pilot" title="Join the pilot programme"
          lead="The next step is a pilot with real stokvels and a lender partner, after legal, security and operational review. Register your interest.">
          <div className="max-w-3xl"><PilotForm /></div>
        </Section>
      </main>
      <SiteFooter />
    </>
  );
}
