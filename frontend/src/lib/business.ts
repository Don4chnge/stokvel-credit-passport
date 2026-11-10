/**
 * Business details shown in the footer and on every legal page.
 * Replace the placeholders through environment variables before launch. Nothing here is invented:
 * a field that is not known yet says so.
 */
const env = (key: string, fallback: string) => process.env[key] || fallback;

export const BUSINESS = {
  tradingName: "Stokvel Credit Passport",
  operator: env("NEXT_PUBLIC_BUSINESS_OPERATOR", "Thabang Manyama, individual developer"),
  registration: env("NEXT_PUBLIC_BUSINESS_REGISTRATION", "Not yet registered as a company"),
  address: env("NEXT_PUBLIC_BUSINESS_ADDRESS", "Gauteng, South Africa"),
  email: env("NEXT_PUBLIC_BUSINESS_EMAIL", "hello@stokvelpassport.example"),
  privacyEmail: env("NEXT_PUBLIC_BUSINESS_PRIVACY_EMAIL", "privacy@stokvelpassport.example"),
  informationOfficer: env("NEXT_PUBLIC_BUSINESS_INFORMATION_OFFICER", "Not yet appointed"),
  termsVersion: "2026-11-draft",
  lastUpdated: "10 November 2026",
};
