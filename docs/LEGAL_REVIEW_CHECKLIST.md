# Legal review checklist

Complete this before any live lender integration or real member data. Nothing in this repository has had
legal review. Calling the product a member-owned Passport does not by itself remove regulatory duties.

## National Credit Act and credit information

- [ ] Legal opinion: does issuing Passport reports that lenders rely on make the operator a credit bureau
      under the National Credit Act? Is NCR registration required?
- [ ] Legal opinion: does the Contribution Reliability Index count as consumer credit information, and
      which rules on accuracy, retention, dispute and access then apply?
- [ ] Confirm the member-controlled model: member-generated reports, consent-based sharing, no sale of
      data, no automatic approval or rejection of credit.
- [ ] Confirm whether any activity is a financial service needing FSCA authorisation.
- [ ] Review marketing wording so nothing implies a credit score or guaranteed credit.

## POPIA

- [ ] Appoint and register an Information Officer.
- [ ] Complete a personal information impact assessment.
- [ ] Final privacy policy, terms of use and consent wording, drafted by an attorney.
- [ ] Lawful basis for each processing purpose, including fairness auditing of age band and gender.
- [ ] Operator agreements with hosting, database, analytics and payment providers.
- [ ] Cross-border transfer assessment for each hosting region.
- [ ] Retention schedule confirmed. Decide how deletion works beside an append-only ledger.
- [ ] Breach notification procedure.

## Payments

- [ ] Agreement with an authorised payment provider. Confirm the platform never holds member funds.
- [ ] Confirm treatment of stokvel funds under the Banks Act exemption for stokvels and NASASA rules.

## Lenders

- [ ] Data-sharing agreement per lender: purpose limit, no onward sale, retention, deletion on revocation.
- [ ] Agree how a lender may use the index beside its own affordability assessment.

## Model and security

- [ ] Validate the index against real, consented outcomes before any lender relies on it.
- [ ] Repeat the fairness audit on real pilot data with adequate group sizes.
- [ ] Independent security review and penetration test.
- [ ] Publish ledger checkpoints to an independent party.
- [ ] Complaints and dispute procedure for members.
