import { expect, test, type Page } from "@playwright/test";
import { createRecipeViaUi, deleteUser, signInAsNewUser } from "./helpers";

test.use({ timezoneId: "America/Los_Angeles" });

async function planForToday(page: Page, recipeUrl: string, servings?: string) {
  await page.goto(recipeUrl);
  if (servings) await page.getByLabel("Servings", { exact: true }).fill(servings);
  await page.getByRole("button", { name: "Add to plan" }).click();
  await expect(page).toHaveURL(/\/plan\?week=/);
}

const line = (page: Page, text: string | RegExp) => page.getByRole("listitem").filter({ hasText: text });

test.describe("grocery list", () => {
  let userId: string;

  test.beforeEach(async ({ page }) => {
    ({ id: userId } = await signInAsNewUser(page));
  });

  test.afterEach(async () => {
    await deleteUser(userId);
  });

  test("merges planned recipes, checks off, and shows only the extra amount after the plan grows", async ({ page }) => {
    const pancakes = await createRecipeViaUi(page, "Pancakes", 4, "2 cups flour\n1 cup milk");
    const bread = await createRecipeViaUi(page, "Bread", 2, "1 cup flour\nFor the dough:");
    await planForToday(page, pancakes);
    await planForToday(page, bread);

    await page.getByRole("link", { name: "List", exact: true }).click();
    await expect(line(page, "3 cups flour")).toContainText("for Bread, Pancakes");
    await expect(line(page, "1 cup milk")).toBeVisible();
    await expect(line(page, "For the dough:")).toBeVisible();

    await line(page, "3 cups flour").getByRole("checkbox").check();
    await expect(line(page, "3 cups flour").getByRole("checkbox")).toBeChecked();
    // The tick is optimistic; wait for the server's re-render before reloading.
    await expect(page.getByText(/· 1 checked/)).toBeVisible();
    await page.reload();
    await expect(line(page, "3 cups flour").getByRole("checkbox")).toBeChecked();

    await planForToday(page, pancakes, "2");
    await page.goto("/list");
    await expect(line(page, /^1 cup flour/).getByRole("checkbox")).not.toBeChecked();
    await expect(line(page, "3 cups flour").getByRole("checkbox")).toBeChecked();
  });

  test("hides items for the week and adds extras", async ({ page }) => {
    const soup = await createRecipeViaUi(page, "Soup", 2, "1 onion\nSalt to taste");
    await planForToday(page, soup);
    await page.goto("/list");

    await page.getByRole("button", { name: "Hide salt" }).click();
    await expect(line(page, "salt")).toHaveCount(0);
    await page.getByRole("link", { name: "Show hidden (1)" }).click();
    await page.getByRole("button", { name: "Unhide salt" }).click();
    await page.goto("/list");
    await expect(line(page, "salt")).toBeVisible();

    await page.getByLabel("Add an item").fill("paper towels");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(line(page, "paper towels")).toBeVisible();
    await line(page, "paper towels").getByRole("checkbox").check();
    await expect(line(page, "paper towels").getByRole("checkbox")).toBeChecked();
    await page.getByRole("button", { name: "Remove paper towels" }).click();
    await expect(line(page, "paper towels")).toHaveCount(0);

    await page.getByRole("button", { name: "Add", exact: true }).click();
    // Next's route announcer also has role="alert", so pick ours by its text.
    await expect(page.getByRole("alert").filter({ hasText: "Type an item to add." })).toBeVisible();
  });

  test("an empty week points to the plan", async ({ page }) => {
    await page.goto("/list?week=2026-10-05");
    await expect(page.getByText("Nothing to buy this week.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Plan some meals" })).toHaveAttribute("href", "/plan?week=2026-10-05");
  });
});
