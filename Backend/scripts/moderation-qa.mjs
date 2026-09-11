import "../dist/src/config/runtime.js";
import { chromium } from "@playwright/test";
if (process.env.NODE_ENV === "production") throw new Error("Development only.");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
try {
  await page.goto("http://localhost:5173");
  await page.getByLabel("Email", { exact: true }).fill("admin@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SEED_PASSWORD);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.getByRole("button", { name: "Moderation", exact: true }).click();
  await page
    .getByRole("heading", { name: "Moderation.", exact: true })
    .waitFor();
  const report = page
    .locator(".moderation-grid .settings-panel")
    .filter({ hasText: /Sam Test|Jordan Test/ })
    .first();
  await report.waitFor();
  await report.locator("select").selectOption("REVIEWED");
  await page
    .getByRole("status")
    .filter({ hasText: "Moderation action saved." })
    .waitFor();
  for (const action of ["Suspend", "Ban", "Restore"]) {
    await report.getByRole("button", { name: action, exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("textbox")
      .fill("Development browser QA moderation check.");
    await page.getByRole("button", { name: "Confirm action" }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await report
      .getByText(
        action === "Suspend"
          ? "SUSPENDED"
          : action === "Ban"
            ? "BANNED"
            : "ACTIVE",
        { exact: true },
      )
      .waitFor();
  }
  await report.locator("select").selectOption("RESOLVED");
  await page.screenshot({ path: "work/qa/moderation.png", fullPage: true });
  console.log(
    "Admin browser flow passed: login, report review, status change, suspend, ban and restore fictional student.",
  );
} finally {
  await browser.close();
}

