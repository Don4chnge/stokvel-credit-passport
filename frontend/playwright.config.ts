import { defineConfig, devices } from "@playwright/test";

const PY = process.env.E2E_PYTHON || "../backend/.venv/bin/python";
const backendEnv = {
  DATABASE_URL: "sqlite:///./stokvel_e2e.db", RATE_LIMIT_ENABLED: "false", BCRYPT_ROUNDS: "6",
  SECRET_KEY: "e2e-secret-key-e2e-secret-key-0123456789", FRONTEND_URL: "http://localhost:3000",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1, // one seeded database, journeys run in order
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: "http://localhost:3000", trace: "retain-on-failure", screenshot: "only-on-failure",
    // Journeys start with the cookie choice already made. e2e/05-compliance.spec.ts tests the banner itself.
    storageState: { cookies: [], origins: [{ origin: "http://localhost:3000", localStorage: [{ name: "scp_cookie_choice", value: "denied" }] }] },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /responsive\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: [
    {
      command: `cd ../backend && rm -f stokvel_e2e.db && ${PY} -m app.seed --reset && ${PY} -m uvicorn app.main:app --port 8000`,
      url: "http://127.0.0.1:8000/api/health", env: backendEnv, reuseExistingServer: !process.env.CI, timeout: 120_000,
    },
    { command: "npm run start", url: "http://localhost:3000", reuseExistingServer: !process.env.CI, timeout: 120_000 },
  ],
});
