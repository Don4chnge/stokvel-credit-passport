"use client";
/**
 * PostHog, optional. With no NEXT_PUBLIC_POSTHOG_KEY every call is a no-op and the app works as normal.
 * Events carry no names, no amounts tied to people, no references, no identity numbers.
 * The distinct id is a one-way hash of the internal user id.
 */
const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";
const CONSENT = "scp_analytics_consent";

let client: any = null;
let loading: Promise<any> | null = null;

export type AnalyticsEvent =
  | "user_signed_up" | "member_joined_stokvel" | "stokvel_created" | "contribution_initiated"
  | "contribution_verified" | "passport_generated" | "passport_downloaded" | "passport_shared"
  | "passport_accessed" | "passport_revoked" | "lender_verification_completed";

const ALLOWED_PROPS = new Set(["channel", "frequency", "scope_count", "expires_in_days", "account_type", "outcome", "method"]);

export const analyticsConfigured = () => Boolean(KEY);
export const hasConsent = () => typeof window !== "undefined" && window.localStorage.getItem(CONSENT) === "granted";
export const consentDecided = () => typeof window !== "undefined" && window.localStorage.getItem(CONSENT) !== null;

export function setConsent(granted: boolean) {
  window.localStorage.setItem(CONSENT, granted ? "granted" : "denied");
  if (!granted && client) { client.opt_out_capturing(); client.reset(); }
  if (granted) void load();
}

async function load() {
  if (!KEY || !hasConsent() || typeof window === "undefined") return null;
  if (client) return client;
  loading ??= import("posthog-js").then(({ default: posthog }) => {
    posthog.init(KEY, {
      api_host: HOST, autocapture: false, capture_pageview: true, disable_session_recording: true,
      persistence: "localStorage", mask_all_text: true, person_profiles: "identified_only",
    });
    client = posthog;
    return posthog;
  });
  return loading;
}

async function pseudonym(userId: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`scp:${userId}`));
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export async function identify(userId: string, role: string) {
  const ph = await load();
  if (ph) ph.identify(await pseudonym(userId), { role });
}

export function sanitise(props: Record<string, unknown> = {}) {
  return Object.fromEntries(Object.entries(props).filter(([k, v]) => ALLOWED_PROPS.has(k) && ["string", "number", "boolean"].includes(typeof v)));
}

export async function track(event: AnalyticsEvent, props: Record<string, unknown> = {}) {
  const ph = await load();
  if (ph) ph.capture(event, sanitise(props));
}

export async function resetAnalytics() {
  if (client) client.reset();
}
