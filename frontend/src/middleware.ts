import { NextRequest, NextResponse } from "next/server";

/**
 * Content Security Policy with a fresh nonce on every page request.
 * Scripts run only when they carry the nonce, so injected markup is not able to execute code.
 */
export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== "production";
  const analytics = process.env.NEXT_PUBLIC_POSTHOG_KEY ? ` ${process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com"}` : "";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'", // inline style attributes are used by the animation library. Styles are not able to run code
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${analytics}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [{
    source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
    missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }],
  }],
};
