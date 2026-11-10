"use client";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Notice } from "./ui";

export function PilotForm() {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState("sending"); setError("");
    try {
      await api("/pilot-interest", { method: "POST", body: {
        contact_name: f.get("contact_name"), email: f.get("email"), organisation: f.get("organisation"),
        kind: f.get("kind"), message: f.get("message") || null, consent_to_contact: f.get("consent") === "on" } });
      setState("sent");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The form did not send. Try again."); setState("idle");
    }
  }

  if (state === "sent") return <Notice tone="success">Registered. The team will contact you about the pilot programme.</Notice>;
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" aria-label="Pilot programme registration">
      <div><label className="label" htmlFor="pf-name">Your name</label><input id="pf-name" name="contact_name" required minLength={2} className="field" autoComplete="name" /></div>
      <div><label className="label" htmlFor="pf-email">Email</label><input id="pf-email" name="email" type="email" required className="field" autoComplete="email" /></div>
      <div><label className="label" htmlFor="pf-org">Stokvel or organisation</label><input id="pf-org" name="organisation" required minLength={2} className="field" /></div>
      <div><label className="label" htmlFor="pf-kind">You represent</label>
        <select id="pf-kind" name="kind" className="field" defaultValue="stokvel">
          <option value="stokvel">A stokvel</option><option value="lender">A lender or bank</option><option value="other">Something else</option>
        </select></div>
      <div className="sm:col-span-2"><label className="label" htmlFor="pf-msg">What would you like to test? (optional)</label>
        <textarea id="pf-msg" name="message" rows={3} maxLength={1000} className="field" /></div>
      <label className="flex items-start gap-3 text-sm text-sage sm:col-span-2">
        <input type="checkbox" name="consent" required className="mt-1 h-4 w-4 accent-[#C6E66B]" />
        <span>I agree to be contacted about the pilot. My details are used for this purpose only, and every message will carry an unsubscribe link.</span>
      </label>
      {error && <div className="sm:col-span-2"><Notice tone="error">{error}</Notice></div>}
      <div className="sm:col-span-2"><button className="btn-primary" disabled={state === "sending"}>{state === "sending" ? "Registering" : "Register for the pilot"}</button></div>
    </form>
  );
}
