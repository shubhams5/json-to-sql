import { test, expect } from "@playwright/test";

test("loads app and generates SQL", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /JSON to SQL home/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Workspace" })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "SQL" }).click();
  await page.getByRole("button", { name: "Generate SQL" }).click();
  await expect(page.getByText("INSERT SQL generated.")).toBeVisible();
  await expect(page.locator(".cm-content")).toContainText("INSERT INTO");
});
