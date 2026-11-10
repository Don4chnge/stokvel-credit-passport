import { expect, Page, test } from "@playwright/test";
import { DEMO, PASSWORD, signIn } from "./helpers";

/** Security hardening, checked in a real browser. Numbers match docs/SECURITY_CHECKLIST.md. */
const ORIGIN = { Origin: "http://localhost:3000" };

function watchCsp(page: Page) {
  const violations: string[] = [];
  page.on("console", (m) => { if (/Content Security Policy|Refused to (load|execute|apply|connect)/i.test(m.text())) violations.push(m.text()); });
  page.on("pageerror", (e) => violations.push(String(e)));
  return violations;
}

test.describe("browser protections", () => {
  test("8 and 17. every page ships a nonce-based content security policy and a full header set", async ({ page }) => {
    const first = await page.goto("/");
    const csp = first!.headers()["content-security-policy"];
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    const scripts = /script-src ([^;]+)/.exec(csp)![1];
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
    for (const rule of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", "connect-src 'self'"]) expect(csp).toContain(rule);
    const h = first!.headers();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["strict-transport-security"]).toContain("max-age=63072000");
    expect(h["cross-origin-opener-policy"]).toBe("same-origin");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["x-powered-by"]).toBeUndefined();
    // a new nonce on every request
    const second = await page.goto("/signin");
    expect(/'nonce-([^']+)'/.exec(second!.headers()["content-security-policy"])?.[1]).not.toBe(nonce);
  });

  test("8. the policy blocks nothing the product needs: no violations across every portal", async ({ page }) => {
    const violations = watchCsp(page);
    for (const path of ["/", "/register", "/privacy", "/legal", "/verify/NOPE"]) { await page.goto(path); await page.waitForLoadState("networkidle"); }
    await signIn(page, DEMO.treasurer, /\/member$/);
    for (const path of ["/member", "/member/contributions", "/member/passport", "/member/sharing", "/stokvel", "/stokvel/contributions", "/stokvel/ledger"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");
    }
    await page.context().clearCookies();
    await signIn(page, DEMO.platform, /\/admin$/);
    await page.goto("/admin/fairness");
    await page.getByRole("button", { name: "Run fairness report" }).click();
    await expect(page.getByTestId("fairness-report")).toBeVisible();
    expect(violations).toEqual([]);
  });

  test("8. injected markup with inline handlers is not allowed to run code", async ({ page }) => {
    await page.goto("/");
    const blocked: string[] = [];
    page.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) blocked.push(m.text()); });
    // the classic stored-XSS payloads, written into the page the way an injection would land
    await page.evaluate(() => {
      const box = document.createElement("div");
      box.innerHTML = '<img src="/missing.png" onerror="window.__injected = 1"><a id="x" href="#" onclick="window.__injected = 2">x</a><script>window.__injected = 3<\/script>';
      document.body.appendChild(box);
      (document.getElementById("x") as HTMLElement).click();
    });
    await expect.poll(() => blocked.length).toBeGreaterThan(0);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as any).__injected)).toBeUndefined();
  });

  test("8. hostile text in a URL is shown as text and never runs", async ({ page }) => {
    await page.goto("/verify/" + encodeURIComponent("<img src=x onerror=window.__x=1>"));
    await expect(page.getByTestId("verify-result")).toContainText("No match");
    await page.goto("/lender/view/" + encodeURIComponent("<svg onload=window.__x=1>"));
    expect(await page.evaluate(() => (window as any).__x)).toBeUndefined();
    await expect(page.locator("img[src='x']")).toHaveCount(0);
  });

  test("8. sign-in never redirects to another site", async ({ page }) => {
    for (const next of ["https://evil.example/", "//evil.example", "javascript:alert(1)"]) {
      await page.context().clearCookies();
      await page.goto(`/signin?next=${encodeURIComponent(next)}`);
      await page.getByLabel("Email").fill(DEMO.member);
      await page.getByLabel("Password").fill(PASSWORD);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page).toHaveURL(/localhost:3000\/member$/);
    }
  });

  test("17. the site refuses to be framed", async ({ page }) => {
    await page.goto("/legal");
    const loaded = await page.evaluate(() => new Promise((resolve) => {
      const f = document.createElement("iframe"); f.src = "/signin";
      f.onload = () => { try { resolve(Boolean(f.contentDocument?.querySelector("form"))); } catch { resolve(false); } };
      document.body.appendChild(f); setTimeout(() => resolve(false), 4000);
    }));
    expect(loaded).toBe(false);
  });
});

test.describe("sessions and requests", () => {
  test("18. the session cookie is httpOnly, same-site and invisible to scripts", async ({ page }) => {
    await signIn(page, DEMO.member, /\/member$/);
    const cookie = (await page.context().cookies()).find((c) => c.name === "scp_session")!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("Lax");
    expect(cookie.path).toBe("/");
    expect(await page.evaluate(() => document.cookie)).not.toContain("scp_session");
    expect(await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage))).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/); // no token in browser storage
  });

  test("14. a signed-in session cannot be driven from another website", async ({ page }) => {
    await signIn(page, DEMO.member, /\/member$/);
    const body = { scopes: ["index"], expires_in_days: 7, recipient_label: "Forged Request" };
    expect((await page.request.post("/api/v1/passport/share", { data: body, headers: { Origin: "https://evil.example" } })).status()).toBe(403);
    expect((await page.request.post("/api/v1/passport/share", { data: body })).status()).toBe(403); // no origin at all
    expect((await page.request.post("/api/v1/members/me/deletion-request", { headers: { Origin: "https://evil.example" } })).status()).toBe(403);
    expect((await page.request.post("/api/v1/passport/share", { data: body, headers: ORIGIN })).status()).toBe(201); // the real site still works
    await page.goto("/member/sharing");
    await expect(page.getByTestId("share-row").filter({ hasText: "Forged Request" })).toHaveCount(1);
  });

  test("18. signing out ends the session on the server, so a copied cookie is useless", async ({ page, browser }) => {
    await signIn(page, DEMO.lender, /\/lender$/);
    const stolen = (await page.context().cookies()).filter((c) => c.name === "scp_session");
    const thief = await browser.newContext();
    await thief.addCookies(stolen);
    expect((await thief.request.get("http://localhost:3000/api/v1/auth/me")).status()).toBe(200);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/$/);
    expect((await thief.request.get("http://localhost:3000/api/v1/auth/me")).status()).toBe(401);
    await thief.close();
  });

  test("5 and 11. repeated wrong passwords lock sign-in for that email", async ({ page }) => {
    const email = `locked.${Date.now()}@example.co.za`;
    await page.goto("/signin");
    for (let i = 0; i < 5; i++) {
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(`Wrong-Guess-${i}`);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.getByRole("alert").filter({ hasText: "Email or password is incorrect." })).toBeVisible();
    }
    await page.getByLabel("Password").fill("Wrong-Guess-6");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Too many failed attempts. Try again in 15 minutes." })).toBeVisible();
  });

  test("4 and 6. admin and other protected routes answer 401 signed out and 403 for the wrong role", async ({ page }) => {
    for (const path of ["/api/v1/ledger/status", "/api/v1/analytics/fairness", "/api/v1/admin/audit-logs", "/api/v1/admin/deletion-requests", "/api/v1/members/me", "/api/v1/lender/verifications"])
      expect((await page.request.get(path)).status(), path).toBe(401);
    await signIn(page, DEMO.member, /\/member$/);
    for (const path of ["/api/v1/ledger/status", "/api/v1/analytics/fairness", "/api/v1/admin/audit-logs", "/api/v1/admin/deletion-requests", "/api/v1/lender/verifications"])
      expect((await page.request.get(path)).status(), path).toBe(403);
    expect((await page.request.post("/api/v1/ledger/checkpoints", { headers: ORIGIN })).status()).toBe(403);
  });

  test("17 and 19. API responses carry security headers and never a stack trace", async ({ page }) => {
    const res = await page.request.get("/api/v1/passport/verify/x");
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("default-src 'none'");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["cache-control"]).toBe("no-store");
    const bad = await page.request.post("/api/v1/auth/login", { data: "{not json", headers: { "Content-Type": "application/json" } });
    expect(bad.status()).toBe(422);
    expect(await bad.text()).not.toMatch(/Traceback|File "|sqlalchemy|site-packages/);
    expect((await page.request.post("/api/v1/pilot-interest", { data: { message: "x".repeat(80_000) } })).status()).toBe(413);
  });
});
