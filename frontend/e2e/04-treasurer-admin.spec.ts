import { expect, test } from "@playwright/test";
import { DEMO, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

test.describe("treasurer, stokvel administrator and platform administrator", () => {
  test("group overview shows the numbers a treasurer needs", async ({ page }) => {
    await signIn(page, DEMO.treasurer, /\/member$/);
    await page.getByRole("link", { name: "Stokvel management" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Masakhane Savings Club");
    await expect(page.getByTestId("stat-members")).toContainText("24");
    await expect(page.getByText("Your role: treasurer")).toBeVisible();
    await expect(page.locator('[data-status="valid"]')).toContainText("Chain verified");
    expect(Number((await page.getByTestId("stat-pending").locator("div").first().textContent()) || 0)).toBeGreaterThanOrEqual(3);
  });

  test("treasurer verifies a pending contribution and it lands on the ledger", async ({ page }) => {
    await signIn(page, DEMO.treasurer, /\/member$/);
    await page.goto("/stokvel/contributions");
    const queue = page.getByTestId("review-item");
    await expect(queue.first()).toBeVisible();
    const before = await queue.count();
    const eventsBefore = (await (await page.request.get("/api/v1/ledger/verify")).json()).event_count;

    const item = queue.filter({ has: page.locator('[data-status="pending"]') }).filter({ hasNot: page.getByText("Your own contribution") }).first();
    await expect(item).toContainText("Self-reported. Not yet checked against the bank.");
    await item.getByRole("button", { name: "Verify payment" }).click();
    await expect(page.getByRole("status").filter({ hasText: "The record is sealed on the ledger." })).toBeVisible();
    await expect(queue).toHaveCount(before - 1);

    const after = await (await page.request.get("/api/v1/ledger/verify")).json();
    expect(after.event_count).toBe(eventsBefore + 1);
    expect(after.valid).toBe(true);
    await expect(page.getByTestId("calendar-table").locator("tbody tr")).not.toHaveCount(0);
  });

  test("treasurer rejects a contribution with a reason", async ({ page }) => {
    await signIn(page, DEMO.treasurer, /\/member$/);
    await page.goto("/stokvel/contributions");
    const queue = page.getByTestId("review-item");
    await expect(queue.first()).toBeVisible();
    const before = await queue.count();
    await queue.filter({ hasNot: page.getByText("Your own contribution") }).first().getByRole("button", { name: "Reject" }).click();
    await page.getByLabel("Reason").fill("No matching deposit in the group account.");
    await page.getByRole("button", { name: "Reject contribution" }).click();
    await expect(page.getByText("Contribution rejected. Nothing was added to the ledger.")).toBeVisible();
    await expect(queue).toHaveCount(before - 1);
  });

  test("treasurer cannot manage members, by screen or by API", async ({ page }) => {
    await signIn(page, DEMO.treasurer, /\/member$/);
    await page.goto("/stokvel/members");
    await expect(page.getByTestId("member-table")).toBeVisible();
    await expect(page.getByRole("form", { name: "Invite a member" })).toHaveCount(0);
    await expect(page.getByTestId("join-request")).toContainText("Owners and administrators approve requests.");
    const sid = (await (await page.request.get("/api/v1/auth/me")).json()).manages_stokvels[0];
    const members = await (await page.request.get(`/api/v1/stokvels/${sid}/members`)).json();
    const target = members.find((m: any) => m.role === "member" && m.status === "active");
    expect((await page.request.delete(`/api/v1/stokvels/${sid}/members/${target.membership_id}`)).status()).toBe(403);
  });

  test("stokvel administrator approves a join request but cannot verify payments", async ({ page }) => {
    await signIn(page, DEMO.administrator, /\/member$/);
    await page.goto("/stokvel/members");
    const request = page.getByTestId("join-request");
    await expect(request).toHaveCount(1);
    await request.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByRole("status").filter({ hasText: "approved." })).toBeVisible();
    await expect(request).toHaveCount(0);
    await page.goto("/stokvel/contributions");
    await expect(page.getByTestId("review-item").first()).toContainText("Treasurers and owners verify payments.");
    await expect(page.getByRole("button", { name: "Verify payment" })).toHaveCount(0);
  });

  test("ledger integrity verification passes and tampering is detected", async ({ page }) => {
    await signIn(page, DEMO.treasurer, /\/member$/);
    await page.goto("/stokvel/ledger");
    await expect(page.getByTestId("ledger-table").locator("tbody tr").first()).toBeVisible();
    await page.getByRole("button", { name: "Run integrity verification" }).click();
    const outcome = page.getByTestId("verify-outcome");
    await expect(outcome).toContainText("Chain verified");
    expect(Number(await outcome.getByTestId("verify-count").textContent())).toBeGreaterThan(1500);

    await page.getByRole("button", { name: "Simulate a tampered record" }).click();
    const sim = page.getByTestId("tamper-outcome");
    await expect(sim.getByText("Tampering detected")).toHaveCount(2);
    await expect(sim.getByTestId("tamper-message")).toContainText("The record was altered.");
    await expect(sim).toContainText("The stored ledger was not changed.");

    // the real ledger is still intact after the simulation
    await page.getByRole("button", { name: "Run integrity verification" }).click();
    await expect(outcome).toContainText("Chain verified");
  });

  test("platform administrator sees ledger status and records a checkpoint", async ({ page }) => {
    await signIn(page, DEMO.platform, /\/admin$/);
    expect(Number(await page.getByTestId("stat-events").locator("div").first().textContent())).toBeGreaterThan(1500);
    await expect(page.getByText("Chain verified").first()).toBeVisible();
    await expect(page.getByTestId("ledger-table").locator("tbody tr")).toHaveCount(12);
    await page.getByRole("button", { name: "Record a checkpoint" }).click();
    await expect(page.getByText(/Checkpoint recorded at event #\d+/)).toBeVisible();
    await page.getByRole("link", { name: "Audit log" }).click();
    await expect(page.getByTestId("audit-table")).toContainText("ledger.checkpoint_created");
  });

  test("fairness report runs and states its limits", async ({ page }) => {
    await signIn(page, DEMO.platform, /\/admin$/);
    await page.getByRole("link", { name: "Fairness report" }).click();
    await page.getByRole("button", { name: "Run fairness report" }).click();
    const report = page.getByTestId("fairness-report");
    await expect(report).toContainText("Fairness cannot be established from synthetic data alone.");
    await expect(report.getByTestId("fairness-flags")).toContainText("Insufficient sample size");
    await expect(report.getByTestId("fairness-flags")).toContainText("All evaluated members are synthetic.");
    await expect(report.getByRole("heading", { name: "Index by age band" })).toBeVisible();
    await expect(report.getByRole("heading", { name: "Index by gender" })).toBeVisible();
    await expect(report).toContainText("Protected attributes used in scoring: none.");
    await expect(report.getByText("Sample too small").first()).toBeVisible();
  });
});
