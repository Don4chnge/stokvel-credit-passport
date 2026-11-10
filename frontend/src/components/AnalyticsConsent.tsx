"use client";
import { useEffect, useState } from "react";
import { analyticsConfigured, consentDecided, setConsent } from "@/lib/analytics";

/** Shown only when PostHog is configured and the visitor has not chosen yet. */
export function AnalyticsConsent() {
  const [show, setShow] = useState(false);
  useEffect(() => { setShow(analyticsConfigured() && !consentDecided()); }, []);
  if (!show) return null;
  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-xl rounded-lg border border-line bg-forest p-4 shadow-2xl" role="region" aria-label="Analytics consent">
      <p className="text-sm text-sage">Allow anonymous product analytics? Events carry no names, amounts or references. You decide, and the product works either way.</p>
      <div className="mt-3 flex gap-3">
        <button className="btn-primary" onClick={() => { setConsent(true); setShow(false); }}>Allow analytics</button>
        <button className="btn-quiet" onClick={() => { setConsent(false); setShow(false); }}>Decline</button>
      </div>
    </div>
  );
}
