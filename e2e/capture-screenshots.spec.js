import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const outDir = join(process.cwd(), "docs", "screenshots");
const enabled = process.env.CAPTURE_SCREENSHOTS === "1";

test.describe("capture README screenshots", () => {
  test.skip(!enabled, "Set CAPTURE_SCREENSHOTS=1 to refresh docs/screenshots");

  test("capture workspace tabs", async ({ page }) => {
    mkdirSync(outDir, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.getByRole("heading", { name: "Workspace" }).waitFor();

    const shot = async (name) => {
      await page.screenshot({
        path: join(outDir, name),
        fullPage: false,
      });
    };

    await shot("json-tab.png");

    await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Schema" }).click();
    await page.getByRole("button", { name: "Re-infer from JSON" }).waitFor({ timeout: 15000 });
    await page.waitForTimeout(400);
    await shot("schema-tab.png");

    await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "ER Diagram" }).click();
    await page.waitForTimeout(800);
    await shot("er-tab.png");

    await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "SQL" }).click();
    await page.getByRole("button", { name: "Generate SQL" }).click();
    await page.getByText(/SQL generated|INSERT SQL generated|Full SQL bundle generated/i).waitFor({ timeout: 15000 });
    await page.waitForTimeout(400);
    await shot("sql-tab.png");

    await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "CRUD" }).click();
    await page.waitForTimeout(400);
    await shot("crud-tab.png");
  });
});
