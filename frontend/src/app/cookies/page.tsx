import type { Metadata } from "next";
import { CookieSettingsButton } from "@/components/CookieConsent";
import { LegalBlock, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Cookie policy" };

const ROWS = [
  ["scp_session", "Cookie, httpOnly", "Essential", "Keeps you signed in", "8 hours"],
  ["scp_cookie_choice", "Browser storage", "Essential", "Remembers your choice on this banner", "Until you clear it"],
  ["scp_group", "Browser storage", "Essential", "Remembers which stokvel a treasurer last opened", "Until you clear it"],
  ["PostHog (ph_*)", "Browser storage", "Analytics, optional", "Anonymous usage events. Set only after you allow analytics, and only when analytics is switched on for this site", "Up to 12 months"],
];

export default function Cookies() {
  return (
    <LegalPage title="Cookie policy" current="/cookies" lead="The service uses one essential cookie. Analytics is optional and stays off until you allow it.">
      <LegalBlock id="list" title="1. What is stored on your device">
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[680px] text-sm" data-testid="cookie-table">
            <thead className="border-b border-line"><tr><th className="th">Name</th><th className="th">Type</th><th className="th">Category</th><th className="th">Purpose</th><th className="th">Kept for</th></tr></thead>
            <tbody className="divide-y divide-line">{ROWS.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i} className={`td ${i === 0 ? "font-mono text-xs text-ivory" : ""}`}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
        <p>There are no advertising cookies and no third-party trackers. Fonts are served from this site, so no font provider sees your visit.</p>
      </LegalBlock>
      <LegalBlock id="choice" title="2. Your choice">
        <p>Essential storage is needed for sign-in and is always on. Analytics is your decision. Change it whenever you like:</p>
        <CookieSettingsButton />
      </LegalBlock>
      <LegalBlock id="analytics" title="3. What analytics would record">
        <p>Named product events such as "passport shared", with a small set of non-personal properties. Never names, emails, amounts tied to a person, payment references or identity numbers. Session recording is off.</p>
      </LegalBlock>
    </LegalPage>
  );
}
