import Link from "next/link";
import { BUSINESS } from "@/lib/business";
import { SiteFooter, SiteNav } from "./Shell";

const PAGES = [["/privacy", "Privacy policy"], ["/terms", "Terms of service"], ["/refunds", "Refund policy"], ["/cookies", "Cookie policy"], ["/legal", "Regulatory status and licences"]];

export function LegalBlock({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return <section id={id} className="border-t border-line py-9"><h2 className="text-2xl">{title}</h2><div className="mt-4 max-w-prose space-y-3 leading-relaxed text-sage [&_a]:text-lime [&_a]:underline [&_a]:underline-offset-4 [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-semibold [&_strong]:text-ivory">{children}</div></section>;
}

export function BusinessDetails() {
  return (
    <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-[14rem_1fr]" data-testid="business-details">
      <dt className="text-sage">Trading name</dt><dd>{BUSINESS.tradingName}</dd>
      <dt className="text-sage">Operated by</dt><dd>{BUSINESS.operator}</dd>
      <dt className="text-sage">Company registration</dt><dd>{BUSINESS.registration}</dd>
      <dt className="text-sage">Address</dt><dd>{BUSINESS.address}</dd>
      <dt className="text-sage">General contact</dt><dd>{BUSINESS.email}</dd>
      <dt className="text-sage">Privacy requests</dt><dd>{BUSINESS.privacyEmail}</dd>
      <dt className="text-sage">Information Officer</dt><dd>{BUSINESS.informationOfficer}</dd>
    </dl>
  );
}

export function LegalPage({ title, lead, current, children }: { title: string; lead: string; current: string; children: React.ReactNode }) {
  return (
    <>
      <SiteNav />
      <main id="main" className="mx-auto max-w-page px-5 py-14">
        <nav aria-label="Legal pages" className="mb-8 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {PAGES.map(([href, label]) => <Link key={href} href={href} aria-current={href === current ? "page" : undefined}
            className={href === current ? "text-ivory underline decoration-lime underline-offset-8" : "text-sage hover:text-ivory"}>{label}</Link>)}
        </nav>
        <h1 className="text-4xl">{title}</h1>
        <p className="mt-4 max-w-prose text-lg text-sage">{lead}</p>
        <p className="mt-3 text-sm text-sage">Version {BUSINESS.termsVersion}. Last updated {BUSINESS.lastUpdated}.</p>
        <p className="mt-6 max-w-prose rounded-md border border-copper/60 p-4 text-sm text-copper" role="note">
          Draft for a prototype. An attorney has not reviewed this text. It describes how the product works today and does not claim legal compliance.
        </p>
        <div className="mt-8">{children}</div>
        <section className="border-t border-line py-9"><h2 className="mb-4 text-2xl">Who operates this service</h2><BusinessDetails /></section>
      </main>
      <SiteFooter />
    </>
  );
}
