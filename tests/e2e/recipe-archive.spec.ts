import { expect, test, type Page } from "@playwright/test";
import { deleteUser, signInAsNewUser } from "./helpers";

async function addRecipe(page: Page, title: string, tags: string) {
  await page.goto("/recipes/new");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Servings", { exact: true }).fill("4");
  await page.getByLabel("Ingredients", { exact: true }).fill("1 cup flour");
  await page.getByLabel("Tags").fill(tags);
  await page.getByRole("button", { name: "Save recipe" }).click();
  await page.getByRole("heading", { level: 1, name: title }).waitFor();
}

test.describe("recipe archive", () => {
  let userId: string;

  test.beforeEach(async ({ page }) => {
    ({ id: userId } = await signInAsNewUser(page));
  });

  test.afterEach(async () => {
    await deleteUser(userId);
  });

  test("long titles and tags stay inside their tiles", async ({ page }) => {
    await addRecipe(page, `Supercalifragilisticexpialidocious${"x".repeat(25)} soup`, "dinner, a-very-long-tag-name-goes-on, another-quite-long-tag, soup");
    await page.goto("/recipes");
    await expect(page.getByRole("link", { name: /Supercalifragilistic/ })).toBeVisible();
    const overflow = await page.evaluate(() => {
      const viewport = document.documentElement.clientWidth;
      const tile = document.querySelector("main ul li a")!.getBoundingClientRect();
      return { pageScrolls: document.documentElement.scrollWidth > viewport, tileRight: tile.right, viewport };
    });
    expect(overflow.pageScrolls).toBe(false);
    expect(overflow.tileRight).toBeLessThanOrEqual(overflow.viewport);
  });

  test("filters by several tags from a dropdown", async ({ page }) => {
    await addRecipe(page, "Tomato soup", "dinner, soup");
    await addRecipe(page, "Pancakes", "breakfast");
    await addRecipe(page, "Stew", "dinner");
    await page.goto("/recipes");
    await expect(page.getByRole("link", { name: /Pancakes/ })).toBeVisible();

    await page.getByText("Tags", { exact: false }).first().click();
    await page.getByRole("checkbox", { name: "dinner" }).check();
    await expect(page).toHaveURL(/tag=dinner$/);
    await expect(page.getByRole("link", { name: /Pancakes/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Stew/ })).toBeVisible();

    await page.getByText("Tags (1)").click();
    await page.getByRole("checkbox", { name: "soup" }).check();
    await expect(page).toHaveURL(/tag=dinner&tag=soup$/);
    await expect(page.getByRole("link", { name: /Stew/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Tomato soup/ })).toBeVisible();
    await expect(page.getByText("Tags (2)")).toBeVisible();
  });
});
