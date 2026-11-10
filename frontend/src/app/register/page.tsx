"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { homeFor, useAuth, User } from "@/lib/auth";
import { track } from "@/lib/analytics";
import { Logo, Notice } from "@/components/ui";

function Register() {
  const router = useRouter();
  const { setUser } = useAuth();
  const [type, setType] = useState<"member" | "lender">(useSearchParams().get("type") === "lender" ? "lender" : "member");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password"));
    if (password.length < 10 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError("Use at least 10 characters with letters and numbers."); return;
    }
    setBusy(true); setError("");
    try {
      const res = await api<{ user: User }>("/auth/register", { method: "POST", body: {
        email: f.get("email"), password, full_name: f.get("full_name"), account_type: type,
        organisation_name: type === "lender" ? f.get("organisation_name") : null } });
      setUser(res.user);
      void track("user_signed_up", { account_type: type });
      router.replace(homeFor(res.user));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed. Try again."); setBusy(false);
    }
  }

  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
      <Link href="/" className="mb-10 flex items-center gap-2.5 font-serif text-lg"><Logo /> Stokvel Credit Passport</Link>
      <h1 className="text-3xl">Create your account</h1>
      <div className="mt-6 grid grid-cols-2 gap-2 rounded-md border border-line p-1" role="tablist" aria-label="Account type">
        {(["member", "lender"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={type === t} onClick={() => setType(t)}
            className={`rounded px-3 py-2 text-sm ${type === t ? "bg-pine text-ivory" : "text-sage hover:text-ivory"}`}>
            {t === "member" ? "Stokvel member" : "Lender"}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div><label className="label" htmlFor="full_name">Full name</label><input id="full_name" name="full_name" required minLength={2} autoComplete="name" className="field" /></div>
        {type === "lender" && <div><label className="label" htmlFor="organisation_name">Organisation</label><input id="organisation_name" name="organisation_name" required minLength={2} className="field" /></div>}
        <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="email" className="field" /></div>
        <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" required autoComplete="new-password" className="field" aria-describedby="pw-hint" />
          <p id="pw-hint" className="mt-1.5 text-xs text-sage">At least 10 characters, with letters and numbers.</p></div>
        {error && <Notice tone="error">{error}</Notice>}
        <button className="btn-primary w-full py-3" disabled={busy}>{busy ? "Creating account" : "Create account"}</button>
      </form>
      <p className="mt-4 text-xs leading-relaxed text-sage">By creating an account you agree to the <Link href="/legal#privacy" className="underline">privacy policy</Link>. This is a prototype. Use test details only.</p>
      <p className="mt-6 text-sm text-sage">Already registered? <Link href="/signin" className="text-lime underline-offset-4 hover:underline">Sign in</Link></p>
    </main>
  );
}

export default function Page() {
  return <Suspense><Register /></Suspense>;
}
