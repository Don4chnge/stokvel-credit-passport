import { expect, Page } from "@playwright/test";

export const PASSWORD = "Passport-Demo-2026";
export const DEMO = {
  member: "member@demo.stokvelpassport.example",
  treasurer: "treasurer@demo.stokvelpassport.example",
  administrator: "admin@demo.stokvelpassport.example",
  lender: "lender@demo.stokvelpassport.example",
  platform: "platform@demo.stokvelpassport.example",
};

export async function signIn(page: Page, email: string, landing: RegExp) {
  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(landing);
}

export async function signOut(page: Page) {
  const menu = page.getByRole("button", { name: "Menu" });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page scrolls sideways").toBeLessThanOrEqual(1);
}
