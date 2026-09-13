import "../src/config/runtime.ts";
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
if (process.env.NODE_ENV === "production")
  throw new Error("Browser QA requires a development environment.");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await mkdir("work/qa", { recursive: true });
try {
  await page.goto(import.meta.env.VITE_API_URL);
  await page.getByLabel("Email", { exact: true }).fill("student@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SEED_PASSWORD);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page
    .getByRole("heading", { name: "Hey Alex, meet your people." })
    .waitFor();
  await page
    .getByRole("button", { name: "Discover", exact: true })
    .first()
    .click();
  await page.locator(".student-card").first().waitFor();
  await page.screenshot({
    path: "work/qa/discover-desktop.png",
    fullPage: true,
  });
  const results = [];
  for (const width of [360, 390, 414, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(100);
    const dimensions = await page.evaluate(() => ({
      viewport: innerWidth,
      width: document.documentElement.scrollWidth,
    }));
    assert(
      dimensions.width <= width,
      `Horizontal overflow at ${width}: ${dimensions.width}`,
    );
    results.push({ width, overflow: false });
    await page.screenshot({
      path: `work/qa/discover-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("textbox", { name: "Search students" })
    .fill("Artificial Intelligence");
  await page.locator(".student-card").first().waitFor();
  assert((await page.locator(".student-card").count()) > 0);
  await page.locator(".name-button").first().click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Connections", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Message", exact: true })
    .first()
    .click();
  await page.getByPlaceholder("Start something with a hello…").waitFor();
  await page.getByText("Connected", { exact: true }).waitFor();
  const message = "Browser QA: hello " + Date.now();
  await page.getByPlaceholder("Start something with a hello…").fill(message);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.getByText(message, { exact: true }).waitFor();
  await page.screenshot({ path: "work/qa/chat-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.locator(".conversation-list").isHidden());
  await page
    .getByRole("button", { name: "Conversation safety controls" })
    .click();
  await page.getByRole("button", { name: "Report user", exact: true }).click();
  await page.getByRole("dialog").getByRole("combobox").selectOption("Other");
  await page
    .getByLabel("Additional details")
    .fill("Browser QA report — fictional test accounts only.");
  await page.getByRole("button", { name: "Submit report" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Conversation safety controls" })
    .click();
  await page.getByRole("button", { name: "Block user", exact: true }).click();
  await page.getByRole("button", { name: "Block user", exact: true }).click();
  await page.getByRole("heading", { name: "You blocked this user." }).waitFor();
  await page.getByRole("button", { name: "Unblock user", exact: true }).click();
  await page.getByPlaceholder("Start something with a hello…").waitFor();
  await page.screenshot({ path: "work/qa/chat-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("heading", { name: "Settings.", exact: true }).waitFor();
  const discovery = page.getByRole("switch", {
    name: "Appear in discovery Let other students discover your profile.",
  });
  await discovery.uncheck();
  await page.waitForTimeout(200);
  await discovery.check();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await page
    .getByRole("heading", { name: "Welcome to your circle." })
    .waitFor();
  assert.deepEqual(errors, []);
  await writeFile(
    "work/qa/results.json",
    JSON.stringify(
      {
        responsive: results,
        flows: [
          "login",
          "discovery",
          "search",
          "profile dialog and Escape",
          "connections to chat",
          "persisted message",
          "report",
          "block",
          "unblock",
          "privacy",
          "logout",
        ],
        browserErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "Browser checks passed: six viewport widths; login, discovery, search, profile, messaging, report, block, unblock, privacy, logout.",
  );
} catch (error) {
  await page.screenshot({ path: "work/qa/failure.png", fullPage: true });
  console.log((await page.locator("main").innerText()).slice(-3000));
  throw error;
} finally {
  await browser.close();
}
