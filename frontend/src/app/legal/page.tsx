import type { Metadata } from "next";
import { LegalBlock, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Regulatory status and licences" };

const CHECKLIST = [
  "Obtain a legal opinion on whether sharing Passport reports with lenders makes the operator a credit bureau under the National Credit Act, and whether NCR registration is required.",
  "Confirm whether any activity amounts to a credit-related or financial service needing FSCA or NCR authorisation.",
  "Complete a POPIA personal information impact assessment and appoint an Information Officer.",
  "Draft final privacy policy, terms of use and consent wording with a qualified attorney.",
  "Sign an operator agreement with each payment provider and each hosting provider.",
  "Agree a data-sharing agreement with every pilot lender, including purpose limits and no onward sale.",
  "Commission an independent security review and penetration test.",
  "Define incident response, breach notification and member complaint procedures.",
  "Validate the index against real outcomes, with informed consent, before any lender relies on it.",
  "Publish ledger checkpoints to an independent party.",
];

const THIRD_PARTIES = [
  ["PostHog", "Product analytics", "Optional. Loads only after you allow analytics, and only when a key is configured. Off in this build"],
  ["Payment provider", "PayShap Request", "None connected. TEST MODE only"],
  ["Hosting and database", "Running the service", "None yet. The prototype is not deployed"],
];
const LICENCES = [
  ["Fraunces", "Headline typeface", "SIL Open Font License 1.1"],
  ["Instrument Sans", "Interface typeface", "SIL Open Font License 1.1"],
  ["IBM Plex Mono", "Hashes and identifiers", "SIL Open Font License 1.1"],
  ["City skylines, logo, contribution ring", "Illustrations", "Original artwork made for this product. No stock photographs or third-party images are used"],
  ["Next.js, React, Recharts, Motion, qrcode.react", "Frontend libraries", "MIT or ISC licences"],
  ["FastAPI, SQLAlchemy, Pydantic, ReportLab", "Backend libraries", "MIT or BSD licences"],
];

export default function Legal() {
  return (
    <LegalPage title="Regulatory status and licences" current="/legal" lead="Where this prototype stands with regulators, which outside services it uses, and the licences of everything it ships.">
      <LegalBlock id="regulatory" title="1. Regulatory status">
        <p>The operator is not a registered credit bureau, credit provider or financial services provider. Payments run in TEST MODE and no money moves.</p>
        <p>Calling the product a member-owned Passport does not remove regulatory duties. The National Credit Act and its rules on credit bureaux and credit information must be reviewed before any commercial use.</p>
        <p><strong>Legal review checklist before any live lender integration:</strong></p>
        <ol className="list-decimal space-y-2 pl-5" data-testid="legal-checklist">{CHECKLIST.map((c) => <li key={c} className="!ml-0 !list-decimal">{c}</li>)}</ol>
      </LegalBlock>
      <LegalBlock id="claims" title="2. What we do not claim">
        <ul><li>No partnerships, endorsements, customers or pilot results. None exist yet.</li><li>No reviews or testimonials. None are shown anywhere on this site.</li>
          <li>Every name, figure and organisation in the product is synthetic and labelled.</li><li>The index has not been validated against loan repayment.</li></ul>
      </LegalBlock>
      <LegalBlock id="third-parties" title="3. Third-party services">
        <div className="overflow-x-auto rounded-lg border border-line"><table className="w-full min-w-[560px] text-sm" data-testid="third-party-table">
          <thead className="border-b border-line"><tr><th className="th">Service</th><th className="th">Purpose</th><th className="th">Status</th></tr></thead>
          <tbody className="divide-y divide-line">{THIRD_PARTIES.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i} className={`td ${i === 0 ? "text-ivory" : ""}`}>{c}</td>)}</tr>)}</tbody></table></div>
        <p>A first visit to this site makes no request to any other domain.</p>
      </LegalBlock>
      <LegalBlock id="licences" title="4. Fonts, images and software licences">
        <div className="overflow-x-auto rounded-lg border border-line"><table className="w-full min-w-[560px] text-sm" data-testid="licence-table">
          <thead className="border-b border-line"><tr><th className="th">Item</th><th className="th">Use</th><th className="th">Licence</th></tr></thead>
          <tbody className="divide-y divide-line">{LICENCES.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i} className={`td ${i === 0 ? "text-ivory" : ""}`}>{c}</td>)}</tr>)}</tbody></table></div>
      </LegalBlock>
      <LegalBlock id="accessibility" title="5. Accessibility">
        <p>The site is built to work with a keyboard and a screen reader, with text alternatives for images and charts and colour contrast checked against WCAG 2.1 level AA. Moving artwork has a pause control and stops for visitors who prefer reduced motion. Report a barrier to the contact address below.</p>
      </LegalBlock>
    </LegalPage>
  );
}
