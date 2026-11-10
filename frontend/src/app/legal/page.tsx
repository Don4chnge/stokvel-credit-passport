import type { Metadata } from "next";
import { SiteFooter, SiteNav } from "@/components/Shell";

export const metadata: Metadata = { title: "Legal and privacy" };

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

function Block({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return <section id={id} className="border-t border-line py-10"><h2 className="text-2xl">{title}</h2><div className="mt-4 max-w-prose space-y-3 leading-relaxed text-sage">{children}</div></section>;
}

export default function Legal() {
  return (
    <>
      <SiteNav />
      <main id="main" className="mx-auto max-w-page px-5 py-16">
        <h1 className="text-4xl">Legal and privacy</h1>
        <p className="mt-4 max-w-prose rounded-md border border-copper/50 p-4 text-sm text-copper">Placeholder text for a prototype. Nothing here has had legal review. The product is designed with POPIA in mind and does not claim legal compliance.</p>
        <div className="mt-10">
          <Block id="privacy" title="Privacy policy (placeholder)">
            <p>The platform collects your name, email, stokvel memberships and contribution records. It uses them to keep your contribution ledger, calculate your reliability index and produce your Passport.</p>
            <p>The platform does not sell member data. It does not approve or decline credit. A lender sees your Passport only through a link you create.</p>
            <p>Age band and gender, where a member provides them, are stored apart from scoring inputs and used only for fairness audits.</p>
          </Block>
          <Block id="consent" title="Consent">
            <p>Sharing is opt-in, per lender and per link. You choose the fields, set an expiry of 1 to 90 days and revoke at any time. Every access attempt is logged and shown to you.</p>
            <p>Product analytics is off unless you allow it. Analytics events carry no names, amounts, references or identity numbers.</p>
          </Block>
          <Block id="retention" title="Data retention policy (placeholder)">
            <p>Account details are kept while your account is open. After a deletion request, personal details are removed following review.</p>
            <p>Ledger entries are retained in pseudonymised form so the hash chain stays verifiable. Sharing links and access logs are kept for 24 months. Audit logs are kept for 5 years.</p>
            <p>These periods are proposals for the pilot and need legal confirmation.</p>
          </Block>
          <Block id="access" title="Access, correction and deletion">
            <p>Download everything held about you from Account and privacy. Report an incorrect contribution record from your Contributions page. Request account deletion from Account and privacy.</p>
          </Block>
          <Block id="regulatory" title="Regulatory status">
            <p>This is a prototype. The operator is not a registered credit bureau, credit provider or financial services provider. Payments run in TEST MODE and no money moves.</p>
            <p>Calling the product a member-owned Passport does not remove regulatory duties. The National Credit Act and its rules on credit bureaux and credit information must be reviewed before any commercial use.</p>
            <p className="text-ivory">Legal review checklist before any live lender integration:</p>
            <ol className="list-decimal space-y-2 pl-5">{CHECKLIST.map((c) => <li key={c}>{c}</li>)}</ol>
          </Block>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
