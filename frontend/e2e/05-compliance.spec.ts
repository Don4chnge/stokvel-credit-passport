import AxeBuilder from "@axe-core/playwright";
import { expect, Page, test } from "@playwright/test";
import { DEMO, signIn } from "./helpers";

/** The 20-point launch checklist, tested. Numbers in test names match docs/COMPLIANCE.md. */

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length} nodes, e.g. ${v.nodes[0].target.join(" ")})`);
}

test.describe("policies and business details", () => {
  for (const [n, path, heading, mustSay] of [
    [1, "/privacy", "Privacy policy", "We do not sell personal information."],
    [2, "/terms", "Terms of service", "The service is free."],
    [3, "/refunds", "Refund policy", "The service never holds the money"],
    [4, "/cookies", "Cookie policy", "There are no advertising cookies and no third-party trackers."],
  ] as const) {
    test(`${n}. ${heading} is published and linked from the footer`, async ({ page }) => {
      await page.goto("/");
      await page.getByRole("contentinfo").getByRole("link", { name: heading }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      await expect(page.getByText(mustSay)).toBeVisible();
      await expect(page.getByRole("note")).toContainText("An attorney has not reviewed this text");
      await expect(page.getByTestId("business-details")).toBeVisible();
    });
  }

  test("16. business details appear in the footer and are honest about what is missing", async ({ page }) => {
    await page.goto("/");
    const footer = page.getByTestId("footer-business");
    await expect(footer).toContainText("Thabang Manyama");
    await expect(footer).toContainText("Not yet registered as a company");
    await expect(footer).toContainText("Gauteng, South Africa");
  });

  test("19. fonts and images are licensed and listed", async ({ page }) => {
    await page.goto("/legal#licences");
    const table = page.getByTestId("licence-table");
    for (const item of ["Fraunces", "Instrument Sans", "IBM Plex Mono"]) await expect(table.getByRole("row", { name: new RegExp(item) })).toContainText("SIL Open Font License 1.1");
    await expect(table).toContainText("Original artwork made for this product");
  });
});

test.describe("cookies and third parties", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("5. cookie banner asks first, gives two equal choices and remembers the answer", async ({ page }) => {
    await page.goto("/");
    const banner = page.getByTestId("cookie-banner");
    await expect(banner).toBeVisible();
    const essential = banner.getByRole("button", { name: "Essential only" }), allow = banner.getByRole("button", { name: "Allow analytics" });
    // no dark pattern: same styling and the same size for both answers
    expect(await essential.getAttribute("class")).toBe(await allow.getAttribute("class"));
    const [a, b] = [await essential.boundingBox(), await allow.boundingBox()];
    expect(Math.abs(a!.width - b!.width)).toBeLessThan(2);
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]); // nothing stored before a choice
    await essential.click();
    await expect(banner).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("scp_cookie_choice"))).toBe("denied");
    await page.reload();
    await expect(banner).toHaveCount(0);
    // the choice stays changeable
    await page.goto("/cookies");
    await expect(page.getByTestId("cookie-state")).toHaveText("Current choice: Essential only");
    await page.getByRole("button", { name: "Change cookie choices" }).click();
    await page.getByTestId("cookie-banner").getByRole("button", { name: "Allow analytics" }).click();
    expect(await page.evaluate(() => localStorage.getItem("scp_cookie_choice"))).toBe("granted");
  });

  test("8. a first visit contacts no third-party domain and sets no cookie", async ({ page, context }) => {
    const outside = new Set<string>();
    page.on("request", (r) => { const host = new URL(r.url()).host; if (host !== "localhost:3000" && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) outside.add(host); });
    for (const path of ["/", "/signin", "/register", "/privacy", "/legal"]) { await page.goto(path); await page.waitForLoadState("networkidle"); }
    expect([...outside]).toEqual([]);
    expect(await context.cookies()).toEqual([]);
  });

  test("4. the cookie policy lists exactly what the site stores", async ({ page }) => {
    await page.goto("/cookies");
    const table = page.getByTestId("cookie-table");
    await expect(table.locator("tbody tr")).toHaveCount(4);
    await page.getByTestId("cookie-banner").getByRole("button", { name: "Essential only" }).click();
    await signIn(page, DEMO.member, /\/member$/);
    const cookies = (await page.context().cookies()).map((c) => c.name);
    expect(cookies).toEqual(["scp_session"]);
    const keys = await page.evaluate(() => Object.keys(localStorage));
    await page.goto("/cookies");
    for (const key of keys) await expect(page.getByTestId("cookie-table")).toContainText(key);
  });
});

test.describe("consent, data and honest design", () => {
  test("6 and 17. registration needs the terms and an 18+ confirmation, neither pre-ticked", async ({ page }) => {
    await page.goto("/register");
    const adult = page.getByLabel("I am 18 or older."), terms = page.getByLabel(/I accept the terms of service/);
    await expect(adult).not.toBeChecked();
    await expect(terms).not.toBeChecked();
    await page.getByLabel("Full name").fill("Consent Tester");
    await page.getByLabel("Email").fill(`consent.${Date.now()}@example.co.za`);
    await page.getByLabel("Password").fill("Consent-Tester-2026");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/register/); // the browser blocks the form
    // the API refuses too, so the rule does not depend on the browser
    const res = await page.request.post("/api/v1/auth/register", { data: { email: `x.${Date.now()}@example.co.za`, password: "Consent-Tester-2026", full_name: "No Consent" } });
    expect(res.status()).toBe(422);
    await adult.check();
    await terms.check();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/member$/);
    expect((await (await page.request.get("/api/v1/auth/me")).json()).terms_version).toBe("2026-11-draft");
  });

  test("6. the pilot form consent is not pre-ticked", async ({ page }) => {
    await page.goto("/#pilot");
    await expect(page.getByRole("form", { name: "Pilot programme registration" }).getByRole("checkbox")).not.toBeChecked();
  });

  test("7. forms ask only for what the service needs", async ({ page }) => {
    await page.goto("/register");
    const names = await page.locator("form input").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).name));
    expect(names.sort()).toEqual(["accept_terms", "confirm_adult", "email", "full_name", "password"]);
    await expect(page.getByLabel(/phone|identity number|ID number|date of birth|address/i)).toHaveCount(0);
  });

  test("10. no fees are hidden: the price is stated before sign-up", async ({ page }) => {
    await page.goto("/#faq");
    await page.getByText("What does it cost?").click();
    await expect(page.getByText("There are no sign-up, subscription or transaction fees")).toBeVisible();
    await page.goto("/register");
    await expect(page.getByText("Free to use.")).toBeVisible();
  });

  test("11 and 12. no reviews, testimonials, partner logos or invented numbers on the public site", async ({ page }) => {
    await page.goto("/");
    const text = (await page.locator("main").innerText()).toLowerCase();
    for (const word of ["testimonial", "trusted by", "our customers", "as seen", "5 stars", "five stars", "rated ", "reviews", "% of users", "award"]) expect(text, word).not.toContain(word);
    await expect(page.locator("main img")).toHaveCount(0); // no partner logos or stock photos
    await expect(page.getByText("Illustrative Passport. The name and figures are invented.")).toBeVisible();
    await page.goto("/legal#claims");
    await expect(page.getByText("No reviews or testimonials. None are shown anywhere on this site.")).toBeVisible();
  });

  test("18. a pilot contact unsubscribes in one step, without signing in", async ({ page }) => {
    await page.goto("/unsubscribe/some-token-from-an-email");
    await page.getByRole("button", { name: "Unsubscribe" }).click();
    await expect(page.getByText("You are unsubscribed. We will not contact you again.")).toBeVisible();
  });

  test("9 and 20. deletion is as easy as sign-up: request, see the status, cancel", async ({ page }) => {
    await signIn(page, DEMO.administrator, /\/member$/);
    await page.goto("/member/account");
    await page.getByRole("button", { name: "Request account deletion" }).click();
    await page.getByRole("button", { name: "Yes, request deletion" }).click();
    await expect(page.getByTestId("deletion-status")).toContainText("Deletion requested on");
    await page.reload();
    await expect(page.getByTestId("deletion-status")).toBeVisible();
    await page.getByRole("button", { name: "Cancel the request" }).click();
    await expect(page.getByRole("button", { name: "Request account deletion" })).toBeVisible();
  });
});

test.describe("accessibility", () => {
  test("13 and 14. public pages pass automated WCAG 2.1 AA checks (alt text, contrast, labels)", async ({ page }) => {
    for (const path of ["/", "/signin", "/register", "/privacy", "/terms", "/refunds", "/cookies", "/legal"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      if (path === "/") await page.getByRole("button", { name: "Pause the skyline animation" }).click();
      expect(await axe(page), path).toEqual([]);
    }
  });

  test("13 and 14. member, stokvel, lender and admin screens pass automated WCAG 2.1 AA checks", async ({ page }) => {
    await signIn(page, DEMO.treasurer, /\/member$/);
    for (const path of ["/member", "/member/contributions", "/member/sharing", "/member/account", "/stokvel", "/stokvel/contributions", "/stokvel/members", "/stokvel/ledger"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(await axe(page), path).toEqual([]);
    }
    await page.context().clearCookies();
    await signIn(page, DEMO.lender, /\/lender$/);
    expect(await axe(page), "/lender").toEqual([]);
    await page.context().clearCookies();
    await signIn(page, DEMO.platform, /\/admin$/);
    await expect(page.getByTestId("stat-events")).toBeVisible();
    expect(await axe(page), "/admin").toEqual([]);
    await page.goto("/admin/fairness");
    await page.getByRole("button", { name: "Run fairness report" }).click();
    await expect(page.getByTestId("fairness-report")).toBeVisible();
    expect(await axe(page), "/admin/fairness").toEqual([]);
  });

  test("13. images and charts carry text alternatives", async ({ page }) => {
    await signIn(page, DEMO.member, /\/member$/);
    await expect(page.getByRole("img", { name: /^Reliability index \d+ out of 100\./ })).toBeVisible();
    await expect(page.getByRole("img", { name: /^Bar chart of verified contributions for the last 12 months/ })).toBeVisible();
    await page.goto("/");
    await expect(page.getByText(/Background artwork: the skyline of/)).toHaveCount(1);
  });

  test("15. keyboard: skip link, visible focus, and a sign-in completed without a mouse", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);

    await page.goto("/signin");
    await page.getByLabel("Email").focus();
    const outline = await page.getByLabel("Email").evaluate((el) => getComputedStyle(el).borderColor + getComputedStyle(el).outlineStyle);
    expect(outline).not.toContain("none none");
    await page.keyboard.type(DEMO.member);
    await page.keyboard.press("Tab");
    await page.keyboard.type("Passport-Demo-2026");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/member$/);
  });

  test("15. keyboard: dialogs take focus, trap it, close on Escape and hand focus back", async ({ page }) => {
    await signIn(page, DEMO.member, /\/member$/);
    const opener = page.getByRole("button", { name: "Join a stokvel" });
    await opener.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Join a stokvel" });
    await expect(dialog.getByLabel("Join code from your stokvel")).toBeFocused();
    for (let i = 0; i < 6; i++) { await page.keyboard.press("Tab"); expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true); }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
});
