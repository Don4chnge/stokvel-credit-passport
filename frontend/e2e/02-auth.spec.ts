import { expect, test } from "@playwright/test";
import { DEMO, signIn } from "./helpers";

test.describe("sign in, registration and access control", () => {
  test("wrong password shows a clear error", async ({ page }) => {
    await page.goto("/signin");
    await page.getByLabel("Email").fill(DEMO.member);
    await page.getByLabel("Password").fill("wrong-password-1");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Email or password is incorrect." })).toBeVisible();
    await expect(page).toHaveURL(/\/signin/);
  });

  test("registration rejects a weak password", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Full name").fill("Weak Password");
    await page.getByLabel("Email").fill("weak@example.co.za");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Use at least 10 characters with letters and numbers." })).toBeVisible();
  });

  test("a new member registers and sees guided empty states", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Full name").fill("Naledi Newcomer");
    await page.getByLabel("Email").fill(`naledi.${Date.now()}@example.co.za`);
    await page.getByLabel("Password").fill("Brand-New-Member-2026");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/member$/);
    await expect(page.getByTestId("empty-state")).toContainText("Your index starts with your first verified contribution");
    await page.getByRole("link", { name: "Contributions", exact: true }).click();
    await expect(page.getByText("No active membership")).toBeVisible();
    await expect(page.getByText("No contributions yet")).toBeVisible();
    await page.getByRole("navigation", { name: "Member portal" }).getByRole("link", { name: "Credit Passport" }).click();
    await expect(page.getByText("You have not generated a Passport yet")).toBeVisible();
    await page.getByRole("link", { name: "Consent centre" }).click();
    await expect(page.getByText("You have not shared your Passport")).toBeVisible();
    await page.getByRole("link", { name: "Stokvel management" }).click();
    await expect(page.getByText("You do not manage a stokvel")).toBeVisible();
  });

  test("duplicate email is refused", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Full name").fill("Duplicate Person");
    await page.getByLabel("Email").fill(DEMO.member);
    await page.getByLabel("Password").fill("Another-Passw0rd-1");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "An account with this email already exists." })).toBeVisible();
  });

  test("signed-out visitors are sent to sign in and returned afterwards", async ({ page }) => {
    await page.goto("/member/passport");
    await expect(page).toHaveURL(/\/signin\?next=%2Fmember%2Fpassport/);
    await page.getByLabel("Email").fill(DEMO.member);
    await page.getByLabel("Password").fill("Passport-Demo-2026");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/member\/passport$/);
  });

  test("each role is kept inside its own portal", async ({ page }) => {
    await signIn(page, DEMO.member, /\/member$/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/member$/);
    await page.goto("/lender");
    await expect(page).toHaveURL(/\/member$/);
    const res = await page.request.get("/api/v1/analytics/fairness");
    expect(res.status()).toBe(403);
    expect((await page.request.get("/api/v1/ledger/status")).status()).toBe(403);
  });

  test("lender is kept out of member data", async ({ page }) => {
    await signIn(page, DEMO.lender, /\/lender$/);
    await page.goto("/member");
    await expect(page).toHaveURL(/\/lender$/);
    expect((await page.request.get("/api/v1/members/me")).status()).toBe(403);
    expect((await page.request.get("/api/v1/stokvels")).status()).toBe(403);
  });
});
