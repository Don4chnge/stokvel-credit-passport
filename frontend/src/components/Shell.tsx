"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { homeFor, useAuth, User } from "@/lib/auth";
import { Loading, Logo, SyntheticTag } from "./ui";

export type NavItem = { href: string; label: string };

export function SiteNav() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const links: NavItem[] = [
    { href: "/", label: "Home" }, { href: "/#how-it-works", label: "How It Works" }, { href: "/#for-members", label: "For Members" },
    { href: "/#for-stokvels", label: "For Stokvels" }, { href: "/#for-lenders", label: "For Lenders" }, { href: "/#security", label: "Security" },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-forest/90 backdrop-blur">
      <nav className="mx-auto flex max-w-page items-center justify-between gap-6 px-5 py-3.5" aria-label="Main">
        <Link href="/" className="flex items-center gap-2.5 font-serif text-lg"><Logo /> Stokvel Credit Passport</Link>
        <div className="hidden items-center gap-6 text-sm text-sage lg:flex">
          {links.slice(1).map((l) => <Link key={l.href} href={l.href} className="hover:text-ivory">{l.label}</Link>)}
        </div>
        <div className="hidden items-center gap-3 lg:flex">
          {user
            ? <Link href={homeFor(user)} className="btn-primary">Open dashboard</Link>
            : <><Link href="/signin" className="btn-quiet">Sign In</Link><Link href="/register" className="btn-primary">Get Started</Link></>}
        </div>
        <button type="button" className="btn-quiet lg:hidden" aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen(!open)}>Menu</button>
      </nav>
      {open && (
        <div id="mobile-menu" className="border-t border-line px-5 py-4 lg:hidden">
          <div className="flex flex-col gap-3 text-sage">
            {links.map((l) => <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="hover:text-ivory">{l.label}</Link>)}
            <div className="mt-2 flex gap-3">
              {user
                ? <Link href={homeFor(user)} className="btn-primary">Open dashboard</Link>
                : <><Link href="/signin" className="btn-quiet">Sign In</Link><Link href="/register" className="btn-primary">Get Started</Link></>}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-page gap-8 px-5 py-12 text-sm text-sage sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-2.5 font-serif text-lg text-ivory"><Logo /> Stokvel Credit Passport</div>
          <p className="mt-3 max-w-xs">A prototype. Not a registered credit bureau, credit provider or financial services provider.</p>
        </div>
        <div><p className="mb-3 text-ivory">Product</p><ul className="space-y-2">
          <li><Link href="/#how-it-works" className="hover:text-ivory">How it works</Link></li>
          <li><Link href="/#security" className="hover:text-ivory">Ledger security</Link></li>
          <li><Link href="/#pilot" className="hover:text-ivory">Pilot programme</Link></li>
          <li><a href="/api/docs" className="hover:text-ivory">API documentation</a></li></ul></div>
        <div><p className="mb-3 text-ivory">Legal and privacy</p><ul className="space-y-2">
          <li><Link href="/legal#privacy" className="hover:text-ivory">Privacy policy</Link></li>
          <li><Link href="/legal#consent" className="hover:text-ivory">Consent</Link></li>
          <li><Link href="/legal#retention" className="hover:text-ivory">Data retention</Link></li>
          <li><Link href="/legal#regulatory" className="hover:text-ivory">Regulatory status</Link></li></ul></div>
        <div><p className="mb-3 text-ivory">Contact</p><ul className="space-y-2">
          <li>pilot@stokvelpassport.example</li><li>Gauteng, South Africa</li></ul></div>
      </div>
      <div className="border-t border-line px-5 py-5 text-center text-xs text-sage/70">
        Every figure, name and organisation shown in this prototype is synthetic. Payments run in TEST MODE.
      </div>
    </footer>
  );
}

export function PortalShell({ title, nav, allow, children }:
  { title: string; nav: NavItem[]; allow: (u: User) => boolean; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace(`/signin?next=${encodeURIComponent(path)}`);
    else if (!allow(user)) router.replace(homeFor(user));
  }, [user, loading, allow, router, path]);

  if (loading || !user || !allow(user)) return <div className="mx-auto max-w-page px-5"><Loading label="Checking your session" /></div>;

  const active = (href: string) => (href === nav[0].href ? path === href : path.startsWith(href));
  const links = (
    <ul className="space-y-1">
      {nav.map((n) => (
        <li key={n.href}>
          <Link href={n.href} onClick={() => setOpen(false)} aria-current={active(n.href) ? "page" : undefined}
            className={`block rounded-md px-3 py-2 text-sm ${active(n.href) ? "bg-pine text-ivory" : "text-sage hover:text-ivory"}`}>{n.label}</Link>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15.5rem_1fr]">
      <aside className="border-b border-line lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <Link href="/" className="flex items-center gap-2.5 font-serif"><Logo size={22} /> Credit Passport</Link>
          <button type="button" className="btn-quiet px-3 py-1.5 lg:hidden" aria-expanded={open} onClick={() => setOpen(!open)}>Menu</button>
        </div>
        <div className={`${open ? "block" : "hidden"} px-3 pb-4 lg:block`}>
          <p className="px-3 pb-2 pt-2 text-xs text-sage/70">{title}</p>
          <nav aria-label={title}>{links}</nav>
          {user.role === "member" && (
            <div className="mt-5 border-t border-line pt-4">
              <p className="px-3 pb-2 text-xs text-sage/70">Switch workspace</p>
              <ul className="space-y-1">
                <li><Link href="/member" className="block rounded-md px-3 py-2 text-sm text-sage hover:text-ivory">My Passport</Link></li>
                <li><Link href="/stokvel" className="block rounded-md px-3 py-2 text-sm text-sage hover:text-ivory">Stokvel management</Link></li>
              </ul>
            </div>
          )}
          <div className="mt-5 border-t border-line px-3 pt-4 text-sm">
            <p className="truncate text-ivory" data-testid="current-user">{user.full_name}</p>
            <p className="truncate text-xs text-sage">{user.organisation_name || user.email}</p>
            {user.is_synthetic && <SyntheticTag className="mt-2" />}
            <button type="button" className="mt-3 block text-sm text-sage underline-offset-4 hover:text-ivory hover:underline"
              onClick={async () => { await api("/auth/logout", { method: "POST" }).catch(() => {}); window.location.assign("/"); }}>Sign out</button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-5 py-8 sm:px-8 lg:px-10 lg:py-10"><div className="mx-auto max-w-5xl">{children}</div></main>
    </div>
  );
}
