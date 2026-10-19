import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", locale: "pt-BR", timezoneId: "America/Fortaleza" },
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"] } }],
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : { command: `npx next start -p ${PORT}`, url: `http://localhost:${PORT}/api/health`, reuseExistingServer: true, timeout: 60_000, env: { DEMO_ALWAYS_OPEN: "true", ENABLE_FAKE_PAYMENTS: "true" } },
});
