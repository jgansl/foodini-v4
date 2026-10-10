import { expect, test, type Page } from "@playwright/test";
import { createRecipeViaUi, deleteUser, signInAsNewUser } from "./helpers";

test.use({ timezoneId: "America/Los_Angeles" });

const item = (page: Page, text: string | RegExp) => page.getByRole("listitem").filter({ hasText: text });

async function planToday(page: Page, url: string) {
  await page.goto(url);
  await page.getByRole("button", { name: "Add to plan" }).click();
  await expect(page).toHaveURL(/\/plan\?week=/);
}

async function addStock(page: Page, text: string) {
  await page.goto("/inventory");
  await page.getByLabel("Add to inventory").fill(text);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByLabel("Add to inventory")).toHaveValue("");
}

test.describe("inventory", () => {
  let userId: string;

  test.beforeEach(async ({ page }) => {
    ({ id: userId } = await signInAsNewUser(page));
  });

  test.afterEach(async () => {
    await deleteUser(userId);
  });

  test("stock reduces the list, and buying adds to stock", async ({ page }) => {
    const bread = await createRecipeViaUi(page, "Bread", 4, "3 cups flour");
    await planToday(page, bread);
    await addStock(page, "1 cup flour");
    await expect(item(page, "1 cup flour")).toBeVisible();

    await page.getByRole("link", { name: "List", exact: true }).click();
    await item(page, "2 cups flour").getByRole("checkbox").check();
    await expect(page.getByText(/· 1 checked/)).toBeVisible();

    await page.getByRole("link", { name: "Inventory", exact: true }).click();
    await expect(item(page, "3 cups flour")).toBeVisible();
  });

  test("cooking takes from stock and un-cooking puts it back", async ({ page }) => {
    const bread = await createRecipeViaUi(page, "Bread", 4, "2 cups flour");
    await addStock(page, "3 cups flour");
    await planToday(page, bread);
    await page.getByRole("article", { name: "Bread" }).getByRole("button", { name: "Mark cooked" }).click();
    await expect(page.getByRole("article", { name: "Bread" })).toContainText("✓ Cooked");
    await page.goto("/inventory");
    await expect(item(page, "1 cup flour")).toBeVisible();

    await page.goto("/plan");
    await page.getByRole("article", { name: "Bread" }).getByRole("button", { name: "Mark not cooked" }).click();
    await expect(page.getByRole("article", { name: "Bread" })).not.toContainText("✓ Cooked");
    await page.goto("/inventory");
    await expect(item(page, "3 cups flour")).toBeVisible();
  });

  test("edit and remove stock; amounts must match the item's kind", async ({ page }) => {
    await addStock(page, "2 cups flour");
    const row = item(page, "2 cups flour");
    await row.getByText("Edit amount").click();
    await row.getByLabel("Amount of flour").fill("500 g");
    await row.getByRole("button", { name: "Save" }).click();
    await expect(row.getByRole("alert")).toContainText("Enter a volume amount");

    await row.getByLabel("Amount of flour").fill("1 ½ cups");
    await row.getByRole("button", { name: "Save" }).click();
    await expect(item(page, "1 ½ cups flour")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /^Remove .*flour$/ }).click();
    await expect(page.getByText("Nothing on hand yet.")).toBeVisible();
  });

  test("a bought amount can be changed", async ({ page }) => {
    const bread = await createRecipeViaUi(page, "Bread", 4, "2 cups flour");
    await planToday(page, bread);
    await page.goto("/list");
    await item(page, "2 cups flour").getByRole("checkbox").check();
    await expect(page.getByText(/· 1 checked/)).toBeVisible();
    const row = item(page, "2 cups flour");
    await row.getByText("Change amount").click();
    await row.getByLabel("Bought of flour").fill("3 cups");
    await row.getByRole("button", { name: "Save" }).click();
    await expect(item(page, "3 cups flour")).toBeVisible();
    await page.goto("/inventory");
    await expect(item(page, "3 cups flour")).toBeVisible();
  });

  test("stock in another unit kind is a hint, not a subtraction", async ({ page }) => {
    const cake = await createRecipeViaUi(page, "Cake", 4, "200 g flour\nSalt to taste");
    await addStock(page, "2 cups flour");
    await addStock(page, "1 tsp salt");
    await planToday(page, cake);
    await page.goto("/list");
    await expect(item(page, "200 g flour")).toContainText("you have 2 cups");
    await expect(item(page, /^salt/)).toContainText("have some");
  });
});
