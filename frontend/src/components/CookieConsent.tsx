"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { consentDecided, hasConsent, setConsent } from "@/lib/analytics";

const OPEN_EVENT = "scp:open-cookie-settings";

/**
 * Cookie banner. Shown on a first visit until the visitor chooses.
 * Both choices have the same weight and one click each. Nothing optional is set before a choice.
 */
export function CookieConsent() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(!consentDecided());
    const open = () => setShow(true);
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);
  if (!show) return null;
  const choose = (granted: boolean) => { setConsent(granted); setShow(false); };
  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-lg border border-line bg-forest p-5 shadow-2xl" role="region" aria-label="Cookie choices" data-testid="cookie-banner">
      <h2 className="font-serif text-xl">Your cookie choices</h2>
      <p className="mt-2 text-sm leading-relaxed text-sage">
        We use one essential cookie to keep you signed in. Anonymous analytics is optional and stays off unless you allow it. Read the <Link href="/cookies" className="text-lime underline underline-offset-4">cookie policy</Link>.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button type="button" className="btn-quiet w-full" onClick={() => choose(false)}>Essential only</button>
        <button type="button" className="btn-quiet w-full" onClick={() => choose(true)}>Allow analytics</button>
      </div>
    </div>
  );
}

export function CookieSettingsButton() {
  const [state, setState] = useState<string>("");
  useEffect(() => { setState(consentDecided() ? (hasConsent() ? "Analytics allowed" : "Essential only") : "No choice made yet"); }, []);
  return (
    <span className="flex flex-wrap items-center gap-3">
      <button type="button" className="btn-quiet" onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}>Change cookie choices</button>
      <span className="text-sm text-sage" data-testid="cookie-state">Current choice: {state}</span>
    </span>
  );
}
