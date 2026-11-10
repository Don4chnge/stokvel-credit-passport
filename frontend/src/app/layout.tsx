import type { Metadata } from "next";
import { headers } from "next/headers";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/instrument-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { CookieConsent } from "@/components/CookieConsent";

export const metadata: Metadata = {
  title: { default: "Stokvel Credit Passport", template: "%s · Stokvel Credit Passport" },
  description: "Make years of responsible stokvel saving visible to the financial system. A member-owned record of verified contributions.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the nonce renders every page per request, which the nonce-based Content Security Policy needs.
  await headers();
  return (
    <html lang="en-ZA">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-lime focus:px-3 focus:py-2 focus:text-forest">Skip to content</a>
        <AuthProvider>{children}<CookieConsent /></AuthProvider>
      </body>
    </html>
  );
}
