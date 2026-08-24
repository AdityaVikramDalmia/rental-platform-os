import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

const checks = [
  {
    name: "Test Admin preset",
    kind: "quick",
    label: "Test Admin",
    expectedPath: "/admin/dashboard",
    expectSignOut: true,
  },
  {
    name: "Agent Bot preset",
    kind: "quick",
    label: "Agent Bot",
    expectedPath: "/admin/dashboard",
    expectSignOut: true,
  },
  {
    name: "Manual Test Admin",
    kind: "manual",
    email: "admin@example.com",
    password: "DevAdmin123!",
    expectedPath: "/admin/dashboard",
    expectSignOut: true,
  },
  {
    name: "Manual Agent bot",
    kind: "manual",
    email: "agent@example.com",
    password: "DevAgent123!",
    expectedPath: "/admin/dashboard",
    expectSignOut: true,
  },
  {
    name: "Test Guard preset",
    kind: "quick",
    label: "Test Guard",
    expectedPath: "/guard/dashboard",
    expectSignOut: false,
  },
];

async function runLoginSmoke(page, check) {
  await page.goto(`${BASE_URL}/dev/login`, { waitUntil: "domcontentloaded" });

  if (check.kind === "quick") {
    let button = page.getByRole("button", { name: check.label });

    if ((await button.count()) === 0) {
      await page.getByText("More Accounts").click();
      button = page.getByRole("button", { name: check.label });
    }

    await button.click();
  } else {
    await page.getByLabel("Email").fill(check.email);
    await page.getByLabel("Password").fill(check.password);
    await page.getByRole("button", { name: "LOG IN" }).click();
  }

  await page.waitForURL(
    (url) => {
      try {
        return new URL(url).pathname === check.expectedPath;
      } catch {
        return false;
      }
    },
    { timeout: 30000 },
  );

  if (check.expectSignOut) {
    await page.getByRole("button", { name: "Sign Out" }).waitFor({ timeout: 30000 });
  }

  await page.close();
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const failures = [];

  for (const check of checks) {
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await runLoginSmoke(page, check);
      console.log(`[PASS] ${check.name}: reached ${check.expectedPath}`);
    } catch (error) {
      console.error(`[FAIL] ${check.name}: ${error.message}`);
      failures.push({
        name: check.name,
        error: error.message,
      });
    }

    await context.close();
  }

  await browser.close();

  if (failures.length > 0) {
    console.error(`\nSmoke test failed: ${failures.length} failure(s).`);
    process.exitCode = 1;
    return;
  }

  console.log("\nSmoke test passed: all admin and redirect checks completed.");
}

run().catch((error) => {
  console.error("Smoke test execution failed:", error);
  process.exit(1);
});
