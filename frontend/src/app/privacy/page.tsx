import type { Metadata } from "next";
import Link from "next/link";
import { LegalBlock, LegalPage } from "@/components/LegalPage";
import { BUSINESS } from "@/lib/business";

export const metadata: Metadata = { title: "Privacy policy" };

const DATA = [
  ["Account", "Full name, email address, password (stored only as a bcrypt hash)", "To sign you in and show your name on your Passport"],
  ["Stokvel membership", "Which stokvels you belong to, your role, the dates you joined or left", "To know which contribution periods apply to you"],
  ["Contributions", "Period, amount, payment reference, status, proof level, dates", "To build your verified record and your reliability index"],
  ["Passport and sharing", "Passport snapshots, sharing links (stored as hashes), who opened them and when", "To let you share your Passport and see every access"],
  ["Consent records", "Terms version and time you accepted, your confirmation that you are 18 or older", "To prove what you agreed to"],
  ["Security log", "Sign-ins, failed sign-ins, verifications and administration actions, with IP address", "To detect misuse and investigate disputes"],
  ["Fairness audit (optional)", "Age band and gender, only where provided", "To check that the index treats groups fairly. Never used to calculate your index"],
  ["Pilot interest form", "Name, email, organisation, your message", "To contact you about the pilot, only with your consent"],
];

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy" current="/privacy" lead="What personal information this service holds, why, and the control you have over it. Written with the Protection of Personal Information Act (POPIA) in mind.">
      <LegalBlock id="collect" title="1. What we collect and why">
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line"><tr><th className="th">Category</th><th className="th">What</th><th className="th">Why</th></tr></thead>
            <tbody className="divide-y divide-line">{DATA.map(([a, b, c]) => <tr key={a}><td className="td text-ivory">{a}</td><td className="td">{b}</td><td className="td">{c}</td></tr>)}</tbody>
          </table>
        </div>
        <p><strong>What we do not collect:</strong> identity numbers, phone numbers, home addresses, dates of birth, bank account numbers, bank statements, identity documents or location. The service has no file uploads.</p>
      </LegalBlock>
      <LegalBlock id="basis" title="2. Our grounds for using it">
        <ul><li>To provide the service you asked for when you created an account.</li><li>Your consent, for sharing a Passport, for optional analytics and for pilot contact. You withdraw consent at any time.</li>
          <li>Our legitimate interest in keeping the service secure and the ledger verifiable.</li></ul>
      </LegalBlock>
      <LegalBlock id="sharing" title="3. Who sees your information">
        <ul><li><strong>Lenders:</strong> only through a sharing link you create, only the fields you choose, until the link expires or you revoke it.</li>
          <li><strong>Your stokvel:</strong> owners, treasurers and administrators of your stokvel see your contribution records in that stokvel.</li>
          <li><strong>Service providers:</strong> hosting and database providers that run the service for us, under contract. See the <Link href="/cookies">cookie policy</Link> and the list of third parties on the <Link href="/legal#third-parties">regulatory page</Link>.</li></ul>
        <p>We do not sell personal information. We do not approve or decline credit.</p>
      </LegalBlock>
      <LegalBlock id="retention" title="4. How long we keep it">
        <ul><li>Account details: while your account is open.</li><li>Sharing links and access logs: 24 months.</li><li>Security log: 5 years.</li>
          <li>Ledger entries: kept in pseudonymised form after account deletion, so the hash chain stays verifiable.</li></ul>
        <p>These periods are proposals for the pilot and need legal confirmation.</p>
      </LegalBlock>
      <LegalBlock id="rights" title="5. Your rights">
        <ul><li><strong>Access:</strong> download everything held about you from Account and privacy.</li>
          <li><strong>Correction:</strong> report an incorrect contribution from your Contributions page.</li>
          <li><strong>Deletion:</strong> send a deletion request from Account and privacy, or email {BUSINESS.privacyEmail}. We act within 30 days.</li>
          <li><strong>Objection and withdrawal:</strong> revoke any sharing link and switch analytics off at any time.</li>
          <li><strong>Complaint:</strong> you may complain to the Information Regulator of South Africa (inforegulator.org.za).</li></ul>
      </LegalBlock>
      <LegalBlock id="children" title="6. Children">
        <p>The service is for people aged 18 or older. Registration requires you to confirm this. We do not knowingly hold information about children. If you believe a child has registered, contact {BUSINESS.privacyEmail} and we will delete the account.</p>
      </LegalBlock>
      <LegalBlock id="security" title="7. Security">
        <p>Passwords are hashed with bcrypt. Sessions use an httpOnly cookie. Sharing links are stored as hashes. Every sensitive action is logged. No system is perfectly secure. We will tell you and the Information Regulator about a breach that affects you.</p>
      </LegalBlock>
      <LegalBlock id="messages" title="8. Emails and messages">
        <p>The service sends no marketing emails today. If you register pilot interest, we contact you about the pilot only. Every message will carry a one-step unsubscribe link.</p>
      </LegalBlock>
      <LegalBlock id="transfers" title="9. Where it is stored">
        <p>The prototype runs on the operator's own equipment. A hosted version may store data outside South Africa. Before that happens this section will name the providers and countries.</p>
      </LegalBlock>
    </LegalPage>
  );
}
