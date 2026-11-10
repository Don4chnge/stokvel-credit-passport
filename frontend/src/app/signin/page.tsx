"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { homeFor, useAuth, User } from "@/lib/auth";
import { Logo, Notice } from "@/components/ui";

function SignIn() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const { setUser } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setError("");
    try {
      const res = await api<{ user: User }>("/auth/login", { method: "POST", body: { email: f.get("email"), password: f.get("password") } });
      setUser(res.user);
      const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
      router.replace(safeNext || homeFor(res.user));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign in failed. Try again."); setBusy(false);
    }
  }

  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
      <Link href="/" className="mb-10 flex items-center gap-2.5 font-serif text-lg"><Logo /> Stokvel Credit Passport</Link>
      <h1 className="text-3xl">Sign in</h1>
      <p className="mt-2 text-sage">Members, treasurers and lenders use the same sign in.</p>
      <form onSubmit={submit} className="mt-8 space-y-4" noValidate={false}>
        <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="email" className="field" /></div>
        <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" required autoComplete="current-password" className="field" /></div>
        {error && <Notice tone="error">{error}</Notice>}
        <button className="btn-primary w-full py-3" disabled={busy}>{busy ? "Signing in" : "Sign in"}</button>
      </form>
      <p className="mt-6 text-sm text-sage">New here? <Link href="/register" className="text-lime underline-offset-4 hover:underline">Create an account</Link></p>
    </main>
  );
}

export default function Page() {
  return <Suspense><SignIn /></Suspense>;
}
