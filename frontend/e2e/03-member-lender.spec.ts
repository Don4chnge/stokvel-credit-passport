import { expect, test } from "@playwright/test";
import { DEMO, signIn, signOut } from "./helpers";

test.describe.configure({ mode: "serial" });

test.describe("member and lender journey", () => {
  let shareLink = "";

  test("member dashboard shows the index, its reasons and history", async ({ page }) => {
    await signIn(page, DEMO.member, /\/member$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Good day, Nomvula");
    const score = Number(await page.getByTestId("ring-score").first().textContent());
    expect(score).toBeGreaterThanOrEqual(70);
    expect(score).toBeLessThanOrEqual(90);
    await expect(page.getByTestId("score-explanation")).toContainText(`Your reliability index is ${score} out of 100.`);
    await expect(page.getByTestId("score-explanation")).toContainText("One missed contribution followed by a successful recovery.");
    await expect(page.getByTestId("stat-total")).toContainText("R 5 500,00");
    await expect(page.getByTestId("stat-payments")).toContainText("11");
    await expect(page.getByText("Synthetic demo data").first()).toBeVisible();

    await page.getByRole("link", { name: "Contributions", exact: true }).click();
    const rows = page.getByTestId("contribution-table").locator("tbody tr");
    await expect(rows).toHaveCount(11);
    await expect(rows.first().locator('[data-status="verified"]')).toBeVisible();
  });

  test("member pays by PayShap Request in TEST MODE and gets a receipt", async ({ page }) => {
    await signIn(page, DEMO.member, /\/member$/);
    await page.goto("/member/contributions");
    await page.getByTestId("payable-group").first().getByRole("button", { name: "Request PayShap payment" }).first().click();
    const dialog = page.getByRole("dialog", { name: "PayShap Request" });
    await expect(dialog.getByText("TEST MODE")).toBeVisible();
    await dialog.getByRole("button", { name: "Send payment request" }).click();
    await expect(dialog.getByTestId("payment-pending")).toContainText("TEST-PSR-");
    await dialog.getByRole("button", { name: "Simulate approved payment" }).click();
    await expect(dialog.getByTestId("payment-success")).toContainText("Confirmed by the payment provider and sealed on the ledger");
    await expect(dialog.getByLabel("Transaction receipt")).toContainText("R 500,00");
    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(page.getByTestId("contribution-table").locator("tbody tr")).toHaveCount(12);
    await expect(page.getByTestId("contribution-table")).toContainText("Confirmed by payment provider");
  });

  test("a failed payment adds nothing to the ledger", async ({ page }) => {
    await signIn(page, DEMO.member, /\/member$/);
    await page.goto("/member/contributions");
    await page.getByTestId("payable-group").first().getByRole("button", { name: "Request PayShap payment" }).first().click();
    const dialog = page.getByRole("dialog", { name: "PayShap Request" });
    await dialog.getByRole("button", { name: "Send payment request" }).click();
    await dialog.getByRole("button", { name: "Simulate failed payment" }).click();
    await expect(dialog.getByTestId("payment-failed")).toContainText("Nothing was added to the ledger");
    await dialog.getByRole("button", { name: "Close", exact: true }).last().click();
    const failed = page.getByTestId("contribution-table").locator("tbody tr").filter({ has: page.locator('[data-status="rejected"]') });
    await expect(failed).toHaveCount(1);
    await expect(failed).toContainText("Not on ledger");
  });

  test("member records a payment that waits for the treasurer", async ({ page }) => {
    await signIn(page, DEMO.member, /\/member$/);
    await page.goto("/member/contributions");
    await page.getByTestId("payable-group").first().getByRole("button", { name: "Record a payment" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Record a payment" });
    await dialog.getByLabel("Bank reference (optional)").fill("EFT NOV DLAMINI");
    await dialog.getByRole("button", { name: "Record payment" }).click();
    await expect(dialog.getByTestId("payment-recorded")).toContainText("Recorded as self-reported");
    await dialog.getByRole("button", { name: "Done" }).click();
    const pending = page.getByTestId("contribution-table").locator("tbody tr").filter({ has: page.locator('[data-status="pending"]') });
    await expect(pending).toContainText("Self-reported");
    await expect(pending).toContainText("Not on ledger");
  });

  test("member reports an incorrect record", async ({ page }) => {
    await signIn(page, DEMO.member, /\/member$/);
    await page.goto("/member/contributions");
    const pending = page.getByTestId("contribution-table").locator("tbody tr").filter({ has: page.locator('[data-status="pending"]') });
    await pending.getByRole("button", { name: "Report a problem" }).click();
    await page.getByLabel("What is wrong?").fill("The reference on my slip is different.");
    await page.getByRole("button", { name: "Send report" }).click();
    await expect(page.getByTestId("contribution-table").locator('[data-status="under_review"]')).toHaveCount(1);
  });

  test("member generates a Passport and reads the score explanation", async ({ page }) => {
    await signIn(page, DEMO.member, /\/member$/);
    await page.getByRole("navigation", { name: "Member portal" }).getByRole("link", { name: "Credit Passport" }).click();
    await page.getByRole("button", { name: "Generate my Passport" }).click();
    const card = page.getByTestId("passport-card");
    await expect(card.getByTestId("passport-name")).toHaveText("Nomvula Dlamini");
    await expect(card.getByTestId("passport-id")).toHaveText(/^SCP-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    await expect(card).toContainText("not a credit bureau score");
    await expect(card).toContainText("does not guarantee credit approval");
    await expect(card.locator("svg").last()).toBeVisible(); // QR code
    await expect(page.getByTestId("factor-breakdown")).toContainText("On-time contribution rate");
    await expect(page.getByTestId("factor-breakdown").locator("> div")).toHaveCount(6);
    await expect(page.getByTestId("score-explanation")).toContainText("verified contribution records");

    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download PDF" }).click();
    expect((await download).suggestedFilename()).toMatch(/^SCP-.*\.pdf$/);
  });

  test("member shares the Passport with chosen fields and an expiry", async ({ page }) => {
    await signIn(page, DEMO.member, /\/member$/);
    await page.getByRole("link", { name: "Consent centre" }).click();
    await page.getByLabel("Contribution history").check();
    await page.getByLabel("Who is this for?").fill("Example Community Lender");
    await page.getByLabel("Access expires after").selectOption("7");
    await page.getByRole("button", { name: "Create sharing link" }).click();
    shareLink = await page.getByTestId("share-link").inputValue();
    expect(shareLink).toMatch(/\/lender\/view\/[A-Za-z0-9_-]{40,}$/);
    const row = page.getByTestId("share-row").first();
    await expect(row).toContainText("Example Community Lender");
    await expect(row).toContainText("Shares: history, index, totals");
    await expect(row).toContainText("Not opened yet.");
    await expect(row.locator('[data-status="active"]')).toBeVisible();
  });

  test("the link does nothing for someone who is not a signed-in lender", async ({ page }) => {
    await page.goto(shareLink);
    await expect(page).toHaveURL(/\/signin\?next=/);
    const token = shareLink.split("/").pop();
    expect((await page.request.get(`/api/v1/passport/shared/${token}`)).status()).toBe(401);
  });

  test("lender verifies the Passport and sees only authorised information", async ({ page }) => {
    await signIn(page, DEMO.lender, /\/lender$/);
    await page.getByLabel("Passport sharing link").fill(shareLink);
    await page.getByRole("button", { name: "Open Passport" }).click();
    await expect(page.getByTestId("verification-banner")).toContainText("Verified Passport");
    await expect(page.getByTestId("passport-name")).toHaveText("Nomvula Dlamini");
    await expect(page.getByTestId("shared-history").locator("tbody tr")).toHaveCount(12);
    await expect(page.getByText("Index explanation, not shared")).toBeVisible();
    await expect(page.getByText("Stokvel memberships, not shared")).toBeVisible();
    await expect(page.getByTestId("factor-breakdown")).toHaveCount(0);
    await expect(page.getByText("Ledger head at issue")).toBeVisible();

    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download report" }).click();
    expect((await download).suggestedFilename()).toMatch(/-shared\.pdf$/);

    await page.getByRole("link", { name: "Verification history" }).click();
    await expect(page.locator("tbody tr").first()).toContainText("Viewed");
    await signOut(page);
  });

  test("member sees who accessed the Passport, then revokes access", async ({ page }) => {
    await signIn(page, DEMO.member, /\/member$/);
    await page.goto("/member/sharing");
    const row = page.getByTestId("share-row").first();
    await expect(row).toContainText("Example Community Lender (synthetic)");
    await expect(row).toContainText("Viewed");
    await row.getByRole("button", { name: "Revoke access" }).click();
    await expect(row.locator('[data-status="revoked"]').first()).toBeVisible();
    await expect(row.getByRole("button", { name: "Revoke access" })).toHaveCount(0);
  });

  test("lender is refused after revocation", async ({ page }) => {
    await signIn(page, DEMO.lender, /\/lender$/);
    await page.goto(shareLink);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Access is no longer available");
    await expect(page.getByTestId("access-denied")).toContainText("revoked by the member");
    await expect(page.getByTestId("passport-card")).toHaveCount(0);
  });

  test("lender form rejects text that is not a link", async ({ page }) => {
    await signIn(page, DEMO.lender, /\/lender$/);
    await page.getByLabel("Passport sharing link").fill("hello");
    await page.getByRole("button", { name: "Open Passport" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "does not look like a Passport link" })).toBeVisible();
    await page.goto("/lender/view/" + "x".repeat(43));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("This link is not valid");
  });

  test("public QR check confirms authenticity without financial detail", async ({ page }) => {
    await signIn(page, DEMO.member, /\/member$/);
    const passport = await (await page.request.get("/api/v1/members/me/passport")).json();
    await page.context().clearCookies();
    await page.goto(`/verify/${passport.verification_code}`);
    const result = page.getByTestId("verify-result");
    await expect(result).toContainText("Authentic");
    await expect(result).toContainText("N.D.");
    await expect(result).not.toContainText("Nomvula");
    await expect(result).not.toContainText(/R \d/); // no rand amounts
  });
});
