# Research notes

Collected November 2026. Figures are from public reporting and should be rechecked before use in a pitch.

## The problem

- Stokvels: about 11 million members in roughly 800,000 groups, pooling an estimated R50 billion a year.
  [Capitec targets South Africa's R50 billion stokvel market](https://www.billionaires.africa/2026/10/07/billionaire-michiel-le-rouxs-capitec-targets-south-africas-r50-billion-stokvel-market/)
- Over-indebtedness: an estimated 12 million adults over-indebted. Borrowing from informal lenders rose
  year on year. [12 Million South Africans Trapped in Debt](https://allafrica.com/stories/202608110567.html)
- PayShap handles about 45 million payments a month and supports request-to-pay.
  [The state of PayShap in 2026](https://stitch.money/blog/real-time-payments-in-south-africa-the-state-of-payshap-in-2026)
- Open finance rules for South Africa are still being phased in, so a member-permissioned record is one
  of the few routes to share alternative data today.
  [Open finance timeline](https://launchbaseafrica.com/2026/07/13/south-africas-fintechs-face-a-wave-of-new-data-and-open-finance-rules-heres-the-timeline/)

## Existing products and the gap

- Banks offer stokvel group savings accounts (for example Capitec and FNB). These hold the money and show
  balances.
- Searches found no product that turns an individual member's verified contribution record into a
  portable report a lender is able to verify. This is a search result, not proof that none exists.
  Recheck before claiming it publicly.

Differentiation of this prototype: the record belongs to the member, each contribution carries a proof
level, the ledger is tamper-evident, the index is explainable, and sharing is scoped, time-limited and
revocable.

## Regulatory questions (open)

- Whether issuing reports that lenders rely on is credit bureau activity under the National Credit Act.
- How stokvels relate to the National Credit Regulator.
  [Stokvels and the National Credit Regulator, Black Sash](https://www.blacksash.org.za/stokvels-and-the-national-credit-regulator/)
- POPIA duties for financial and demographic data.

See LEGAL_REVIEW_CHECKLIST.md.

## Development tools

Perplexity, Firecrawl, PostHog and Composio MCP connectors were not installed in the build environment.
Research used web search and page fetches. Playwright was available and runs the end-to-end tests.
PostHog is integrated in the product through its JavaScript library and stays off without a key.
