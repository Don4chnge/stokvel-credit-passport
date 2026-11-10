import { expect, test } from "@playwright/test";
import { DEMO, expectNoHorizontalScroll, signIn } from "./helpers";

test.describe("mobile layout", () => {
  test("public site fits a phone and the menu works", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByRole("button", { name: "Menu" }).click();
    await page.locator("#mobile-menu").getByRole("link", { name: "Security" }).click();
    await expect(page.locator("#security")).toBeInViewport();
    await expect(page.locator("#mobile-menu")).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    for (const path of ["/legal", "/privacy", "/terms", "/refunds", "/cookies"]) {
      await page.goto(path);
      await expectNoHorizontalScroll(page);
    }
  });

  test("member portal fits a phone", async ({ page }) => {
    await signIn(page, DEMO.member, /\/member$/);
    await expect(page.getByTestId("ring-score").first()).toBeVisible();
    await expectNoHorizontalScroll(page);
    for (const path of ["/member/contributions", "/member/passport", "/member/sharing", "/member/account"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalScroll(page);
    }
    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("link", { name: "Overview" }).click();
    await expect(page).toHaveURL(/\/member$/);
  });

  test("stokvel, lender and admin portals fit a phone", async ({ page }) => {
    await signIn(page, DEMO.treasurer, /\/member$/);
    for (const path of ["/stokvel", "/stokvel/contributions", "/stokvel/members", "/stokvel/ledger"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalScroll(page);
    }
    await page.context().clearCookies();
    await signIn(page, DEMO.lender, /\/lender$/);
    await expectNoHorizontalScroll(page);
    await page.context().clearCookies();
    await signIn(page, DEMO.platform, /\/admin$/);
    await expect(page.getByTestId("stat-events")).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.goto("/admin/fairness");
    await page.getByRole("button", { name: "Run fairness report" }).click();
    await expect(page.getByTestId("fairness-report")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
