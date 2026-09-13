import "../src/config/runtime.ts";
import { chromium, expect } from "@playwright/test";
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
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
  await page.goto(import.meta.env.VITE_API_URL);
  await page.getByRole("button", { name: "Join the circle" }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Username", { exact: true }).fill(`qa_${suffix}`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByRole("heading", { name: "The basics" }).waitFor();
  await page
    .getByLabel("Short bio")
    .fill("A fictional QA student exploring AI and startups.");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const collegeSelect = page.getByLabel("College", { exact: true });
  await collegeSelect.click();
  await page.waitForFunction(
    () => document.querySelector("select")?.options.length >= 11,
  );
  const options = await collegeSelect
    .locator("option")
    .evaluateAll((options) =>
      options
        .filter((o) => o.value)
        .map((o) => ({ id: o.value, name: o.textContent })),
    );
  assert.ok(options.length >= 10);
  const first = options.find((o) => o.name.includes("LNMIIT"));
  const second = options.find((o) => o.name.includes("NIMS"));
  await collegeSelect.selectOption(first.id);
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
  async function me() {
    const response = await page.request.get(
      `${import.meta.env.VITE_API_URL}/api/profiles/me`,
    );
    assert.equal(response.status(), 200);
    return response.json();
  }
  assert.equal((await me()).collegeId, first.id);
  await page.reload();
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("College", { exact: true })).toHaveValue(
    first.id,
  );
  await page.getByLabel("College", { exact: true }).selectOption(second.id);
  for (let i = 0; i < 4; i++)
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit profile", exact: true })
    .waitFor();
  await page.reload();
  assert.equal((await me()).collegeId, second.id);
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("College", { exact: true })).toHaveValue(
    second.id,
  );
  const profile = await me();
  const invalid = await page.request.put(
    `${import.meta.env.VITE_API_URL}/api/profiles/me`,
    {
      headers: { Origin: import.meta.env.VITE_API_URL },
      data: {
        ...profile,
        collegeId: "nonexistent-college",
        interests: profile.interests.map((i) => i.id),
        skills: profile.skills.map((i) => i.id),
      },
    },
  );
  assert.equal(invalid.status(), 400);
  assert.equal((await me()).collegeId, second.id);
  const catalog = await (
    await page.request.get(`${import.meta.env.VITE_API_URL}/api/profiles/catalog`)
  ).json();
  await page.route("**/api/profiles/catalog", (route) =>
    route.fulfill({ status: 503, json: { error: "Temporary QA outage" } }),
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Unable to load colleges",
  );
  await expect(page.getByLabel("College", { exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toBeDisabled();
  await page.unroute("**/api/profiles/catalog");
  await page.route("**/api/profiles/catalog", (route) =>
    route.fulfill({ json: { ...catalog, colleges: [] } }),
  );
  await page.getByRole("button", { name: "Retry loading colleges" }).click();
  await expect(page.getByRole("status")).toContainText(
    "No colleges are available",
  );
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toBeDisabled();
  await page.unroute("**/api/profiles/catalog");
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/api/profiles/catalog", async (route) => {
    await gate;
    await route.fulfill({ json: catalog });
  });
  await page.getByRole("button", { name: "Retry loading colleges" }).click();
  await expect(page.getByLabel("College", { exact: true })).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("Loading colleges");
  release();
  await expect(page.getByLabel("College", { exact: true })).toHaveValue(
    catalog.colleges.find((c) => c.name.includes("NIMS")).id,
  );
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toBeEnabled();

  console.log(
    "PASS: signup, ten college options, select, save, reload, edit, change, reload, invalid ID rejected. QA account retained: " +
      email,
  );
} catch (error) {
  console.log((await page.locator("body").innerText()).slice(-2000));
  throw error;
} finally {
  await browser.close();
}
