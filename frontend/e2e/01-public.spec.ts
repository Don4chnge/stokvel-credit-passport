import { expect, test } from "@playwright/test";

test.describe("public website", () => {
  test("hero states the positioning and shows the Passport", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your contributions. Your financial identity.");
    await expect(page.getByText("Make years of responsible stokvel saving visible to the financial system.")).toBeVisible();
    await expect(page.getByTestId("passport-card").first()).toBeVisible();
    await expect(page.getByText("Illustrative Passport. The name and figures are invented.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Explore Your Passport" })).toHaveAttribute("href", "/register");
  });

  test("hero skyline changes city by itself, with no city picker", async ({ page }) => {
    await page.goto("/");
    const scenes = page.getByTestId("city-scenes");
    await expect(scenes).toHaveAttribute("data-city", "cpt");
    await expect(scenes.getByTestId("city-caption")).toContainText("Cape Town, Western Cape");
    // no control lets a visitor choose a city
    for (const name of ["Cape Town", "Gqeberha", "Kimberley", "Bloemfontein", "Durban", "Rustenburg", "Polokwane", "Mbombela", "Johannesburg", "Pretoria"])
      await expect(scenes.getByRole("button", { name })).toHaveCount(0);
    // it moves on without any input
    await expect(scenes).toHaveAttribute("data-city", "gq", { timeout: 12_000 });
    await expect(scenes.getByTestId("city-caption")).toContainText("Gqeberha, Eastern Cape");
    await expect(scenes).toHaveAttribute("data-city", "kim", { timeout: 12_000 });
    // the pause control stops it, for people who need stillness
    await scenes.getByRole("button", { name: "Pause the skyline animation" }).click();
    await page.waitForTimeout(8_000);
    await expect(scenes).toHaveAttribute("data-city", "kim");
    await scenes.getByRole("button", { name: "Play the skyline animation" }).click();
    await expect(scenes).toHaveAttribute("data-city", "bfn", { timeout: 12_000 });
  });

  test("every navigation link reaches its section", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Main" });
    for (const [label, id] of [["How It Works", "how-it-works"], ["For Members", "for-members"], ["For Stokvels", "for-stokvels"],
      ["For Lenders", "for-lenders"], ["Security", "security"]] as const) {
      await nav.getByRole("link", { name: label }).click();
      await expect(page).toHaveURL(new RegExp(`#${id}$`));
      await expect(page.locator(`#${id}`)).toBeInViewport();
    }
    await nav.getByRole("link", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/signin$/);
    await page.goto("/");
    await nav.getByRole("link", { name: "Get Started" }).click();
    await expect(page).toHaveURL(/\/register$/);
  });

  test("all ten content sections are present", async ({ page }) => {
    await page.goto("/");
    for (const id of ["problem", "how-it-works", "for-members", "for-stokvels", "security", "consent", "for-lenders", "faq", "pilot"])
      await expect(page.locator(`section#${id}`)).toHaveCount(1);
    await expect(page.locator("#how-it-works ol > li")).toHaveCount(5);
    await expect(page.getByRole("contentinfo")).toContainText("Every figure, name and organisation shown in this prototype is synthetic");
  });

  test("ledger demo detects a changed record and recovers", async ({ page }) => {
    await page.goto("/#security");
    const demo = page.getByTestId("ledger-demo");
    await expect(demo.getByTestId("demo-status")).toHaveText("Chain intact");
    await demo.getByRole("button", { name: /Change contribution #2/ }).click();
    await expect(demo.getByTestId("demo-status")).toHaveText("Tampering detected");
    await expect(demo.getByText("Hash mismatch")).toBeVisible();
    await expect(demo.getByText("Chain broken upstream")).toHaveCount(2);
    await demo.getByRole("button", { name: "Restore the original record" }).click();
    await expect(demo.getByTestId("demo-status")).toHaveText("Chain intact");
  });

  test("FAQ answers open", async ({ page }) => {
    await page.goto("/#faq");
    await page.getByText("Is the Contribution Reliability Index a credit score?").click();
    await expect(page.getByText("A credit bureau did not produce it")).toBeVisible();
  });

  test("pilot form validates then registers interest", async ({ page }) => {
    await page.goto("/#pilot");
    const form = page.getByRole("form", { name: "Pilot programme registration" });
    await form.getByRole("button", { name: "Register for the pilot" }).click();
    await expect(form.getByLabel("Your name")).toBeFocused(); // browser blocks the empty form
    await form.getByLabel("Your name").fill("Zodwa Test");
    await form.getByLabel("Email").fill("zodwa@example.co.za");
    await form.getByLabel("Stokvel or organisation").fill("Test Savings Club");
    await form.getByRole("checkbox").check();
    await form.getByRole("button", { name: "Register for the pilot" }).click();
    await expect(page.getByText("Registered. The team will contact you about the pilot programme.")).toBeVisible();
  });

  test("legal page carries the review checklist and no compliance claim", async ({ page }) => {
    await page.goto("/legal");
    await expect(page.getByText("does not claim legal compliance")).toBeVisible();
    await expect(page.getByTestId("legal-checklist").locator("li")).toHaveCount(10);
  });

  test("unknown verification code is reported as no match", async ({ page }) => {
    await page.goto("/verify/NOTAREALCODE");
    await expect(page.getByTestId("verify-result")).toContainText("No match");
  });
});
