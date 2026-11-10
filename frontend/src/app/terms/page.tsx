import type { Metadata } from "next";
import Link from "next/link";
import { LegalBlock, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms of service" };

export default function Terms() {
  return (
    <LegalPage title="Terms of service" current="/terms" lead="The rules for using Stokvel Credit Passport. By creating an account you accept them.">
      <LegalBlock id="service" title="1. What the service is">
        <p>Stokvel Credit Passport records stokvel contributions, verifies them, and lets a member share a report of that record. It is a <strong>prototype</strong>. Demonstration data is synthetic.</p>
        <p>The service is <strong>not</strong> a registered credit bureau, a credit provider, a bank or a financial adviser. The Contribution Reliability Index is an experimental measure of contribution behaviour. It is not a credit score and it does not guarantee credit approval.</p>
      </LegalBlock>
      <LegalBlock id="eligibility" title="2. Who may use it">
        <p>You must be 18 or older. You must give accurate details and keep your password private. One person, one account.</p>
      </LegalBlock>
      <LegalBlock id="fees" title="3. Fees">
        <p><strong>The service is free.</strong> There are no sign-up fees, subscription fees, transaction fees or charges for sharing a Passport. If fees are ever introduced, we will show the full price before you agree to anything, and nothing will be charged without your consent. See the <Link href="/refunds">refund policy</Link>.</p>
      </LegalBlock>
      <LegalBlock id="payments" title="4. Contributions and payments">
        <p>Payments run in TEST MODE and move no money. In a live version, contributions go from the member to the stokvel's own bank account. The service never holds member or stokvel funds.</p>
        <p>A contribution counts as verified only when a payment provider confirms it or a treasurer checks it. Verified records are never edited. Corrections and reversals are added as new linked records.</p>
      </LegalBlock>
      <LegalBlock id="use" title="5. Acceptable use">
        <ul><li>Record only real contributions you made.</li><li>Do not verify a payment you have not checked against the stokvel account.</li>
          <li>Do not attempt to access another person's records, or to interfere with the ledger or the service.</li><li>Lenders use a shared Passport only for the purpose the member shared it for.</li></ul>
      </LegalBlock>
      <LegalBlock id="disputes" title="6. Mistakes and disputes">
        <p>If a record is wrong, report it from your Contributions page. Your treasurer reviews it. If you disagree with the outcome, contact us and we will review the audit log.</p>
      </LegalBlock>
      <LegalBlock id="liability" title="7. No reliance and liability">
        <p>The service is provided as a prototype, without warranties. Do not make a lending or borrowing decision based only on a Passport. Lenders remain responsible for their own affordability and credit assessment. Nothing here limits rights you have under the Consumer Protection Act.</p>
      </LegalBlock>
      <LegalBlock id="ending" title="8. Ending your account">
        <p>You may request deletion at any time from Account and privacy. We may suspend an account that breaks these terms.</p>
      </LegalBlock>
      <LegalBlock id="law" title="9. Law and changes">
        <p>South African law applies. We will show a notice in the product before a material change to these terms takes effect, and ask you to accept the new version.</p>
      </LegalBlock>
    </LegalPage>
  );
}
