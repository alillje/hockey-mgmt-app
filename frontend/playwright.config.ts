import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "@playwright/test";

const macChrome =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executablePath =
  process.env.HOCKEY_CHROME_PATH ||
  (existsSync(macChrome) ? macChrome : undefined);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5273",
    viewport: { width: 1440, height: 1100 },
    launchOptions: { executablePath },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command:
        "dotnet run --project ../backend --no-launch-profile -- --urls http://127.0.0.1:5280",
      url: "http://127.0.0.1:5280/api/health",
      env: {
        DatabasePath:
          process.env.HOCKEY_E2E_DATABASE_PATH ||
          path.resolve("../.tools/e2e/hockey.db"),
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5273",
      url: "http://127.0.0.1:5273",
      env: { HOCKEY_API_URL: "http://127.0.0.1:5280" },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
