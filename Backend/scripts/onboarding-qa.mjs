import "../src/config/runtime.ts";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { readdir, readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
if (process.env.NODE_ENV === "production")
  throw new Error("Browser QA requires a development environment.");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 950 },
});
const page = await context.newPage();
const suffix = Date.now();
const email = `qa_${suffix}@example.test`;
const name = `QA Student ${suffix}`;
const password = `QA-Account-${suffix}-safe`;
try {
  await mkdir("work/qa", { recursive: true });
  await sharp({
    create: { width: 400, height: 400, channels: 3, background: "#b66e43" },
  })
    .png()
    .toFile("work/qa/profile.png");
  await page.goto("http://localhost:5173");
  await page.getByRole("button", { name: "Join the circle" }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Username", { exact: true }).fill(`qa_${suffix}`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByRole("heading", { name: "The basics" }).waitFor();
  await page
    .getByLabel("Short bio")
    .fill("A fictional QA student exploring AI and startups.");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator("select").first().selectOption("demo-lnmiit");
  await page.getByLabel("Degree / course").fill("B.Tech");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  for (const interest of ["Artificial Intelligence", "Startups", "Hackathons"])
    await page.getByRole("button", { name: interest, exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Python", exact: true }).click();
  await page
    .getByRole("button", { name: "Project partners", exact: true })
    .click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles("work/qa/profile.png");
  await page.getByRole("button", { name: "Save photo", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await page.getByRole("heading", { name: "Settings.", exact: true }).waitFor();
  const collegeEmail = `qa_${suffix}@lnmiit.ac.in`;
  await page.getByLabel("College email").fill(collegeEmail);
  await page.getByRole("button", { name: "Send verification link" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Verification email sent." })
    .waitFor();
  let link = "";
  for (const file of await readdir("work/mail")) {
    const item = JSON.parse(await readFile(`work/mail/${file}`, "utf8"));
    if (item.email === collegeEmail) link = item.link;
  }
  assert(link);
  await page.goto(link);
  await page
    .getByRole("status")
    .filter({ hasText: "Student email verified." })
    .waitFor();
  await page
    .getByRole("button", { name: "Discover", exact: true })
    .first()
    .click();
  await page.getByRole("textbox", { name: "Search students" }).fill("Sam Test");
  await page.locator(".student-card").filter({ hasText: "Sam Test" }).waitFor();
  await page
    .locator(".student-card")
    .filter({ hasText: "Sam Test" })
    .getByRole("button", { name: "Connect", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Connection request sent." })
    .waitFor();
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await other.goto("http://localhost:5173");
  await other
    .getByLabel("Email", { exact: true })
    .fill("student2@example.test");
  await other
    .getByLabel("Password", { exact: true })
    .fill(process.env.SEED_PASSWORD);
  await other.getByRole("button", { name: "Log in", exact: true }).click();
  await other
    .getByRole("heading", { name: "Hey Sam, meet your people." })
    .waitFor();
  await other
    .getByRole("button", { name: "Connections", exact: true })
    .first()
    .click();
  await other.getByRole("tab", { name: "Received", exact: true }).click();
  await other
    .locator(".connection-row")
    .filter({ hasText: name })
    .getByRole("button", { name: "Accept", exact: true })
    .click();
  await other.getByRole("tab", { name: "Your circle", exact: true }).click();
  await other
    .locator(".connection-row")
    .filter({ hasText: name })
    .getByRole("button", { name: "Message", exact: true })
    .click();
  await other.getByPlaceholder("Start something with a hello…").waitFor();
  await page
    .getByRole("button", { name: "Connections", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Message", exact: true }).click();
  await page.getByPlaceholder("Start something with a hello…").waitFor();
  await page.getByText("Connected", { exact: true }).waitFor();
  const message = `Live message from new QA account ${suffix}`;
  await page.getByPlaceholder("Start something with a hello…").fill(message);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await other.getByText(message, { exact: true }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: "QA Student", exact: false }).count();
  await page.locator(".conversation").filter({ hasText: "Sam Test" }).click();
  await page.getByText(message, { exact: true }).waitFor();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete account", exact: true })
    .click();
  await page.getByLabel("Current password").fill(password);
  await page
    .getByRole("button", { name: "Permanently delete account" })
    .click();
  await page
    .getByRole("heading", { name: "Welcome to your circle." })
    .waitFor();
  console.log(
    "New-user flow passed: signup, six-step onboarding, upload/crop, college-email verification, discovery, request, second-user acceptance, live message receipt without refresh, history after reload, and account deletion.",
  );
} catch (error) {
  await page.screenshot({
    path: "work/qa/onboarding-failure.png",
    fullPage: true,
  });
  console.log((await page.locator("body").innerText()).slice(-2500));
  throw error;
} finally {
  await browser.close();
}
