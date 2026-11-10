import type { Metadata } from "next";
import { LegalBlock, LegalPage } from "@/components/LegalPage";
import { BUSINESS } from "@/lib/business";

export const metadata: Metadata = { title: "Refund policy" };

export default function Refunds() {
  return (
    <LegalPage title="Refund policy" current="/refunds" lead="The service charges nothing, so there is nothing to refund from us. This page explains what happens to contributions.">
      <LegalBlock id="fees" title="1. Platform fees">
        <p><strong>There are none.</strong> Creating an account, recording contributions, generating a Passport and sharing it are free. No card or bank details are taken.</p>
      </LegalBlock>
      <LegalBlock id="test" title="2. Payments in this prototype">
        <p>PayShap Request runs in TEST MODE. No money moves, so no refund applies.</p>
      </LegalBlock>
      <LegalBlock id="contributions" title="3. Contributions in a live version">
        <p>A contribution is a payment from you to your stokvel's own bank account. The service never holds the money, so it is not able to refund it.</p>
        <ul><li><strong>Paid the wrong amount or paid twice:</strong> ask your stokvel treasurer to return the money, and report the record from your Contributions page.</li>
          <li><strong>Payment reversed by your bank or the payment provider:</strong> the contribution is marked reversed and a reversal is added to the ledger. Your record updates.</li>
          <li><strong>Dispute with your stokvel:</strong> the stokvel's own constitution governs payouts and refunds between members.</li></ul>
      </LegalBlock>
      <LegalBlock id="future" title="4. If fees are introduced">
        <p>We will publish prices, a cooling-off period and a refund process on this page before any fee is charged, and no fee will apply without your consent.</p>
      </LegalBlock>
      <LegalBlock id="help" title="5. Help">
        <p>Questions about a payment: {BUSINESS.email}.</p>
      </LegalBlock>
    </LegalPage>
  );
}
