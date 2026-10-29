import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

const macChrome =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executablePath =
  process.env.HOCKEY_CHROME_PATH ||
  (existsSync(macChrome) ? macChrome : undefined);

// Run against the published .NET server. Vite's development pages do not receive its CSP.
export default defineConfig({
  testDir: "./security-e2e",
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5282",
    launchOptions: { executablePath },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "dotnet HockeyTrainer.Api.dll --urls http://127.0.0.1:5282",
    cwd: "../artifacts/publish",
    url: "http://127.0.0.1:5282/api/health",
    env: {
      ASPNETCORE_ENVIRONMENT: "Development",
      Auth__Mode: "Disabled",
      Database__Provider: "Sqlite",
      DatabasePath: path.join(tmpdir(), "hockey-xss-" + randomUUID() + ".db"),
      AllowedHosts: "127.0.0.1;localhost",
    },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
