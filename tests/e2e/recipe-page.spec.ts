import { expect, test, type Page } from "@playwright/test";
import { createRecipeViaUi, deleteUser, signInAsNewUser } from "./helpers";

async function createPancakes(page: Page) {
  await createRecipeViaUi(page, "Tab pancakes", 4, "2 cups flour\n1 cup milk");
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Steps", { exact: true }).fill("Whisk.\nCook.");
  await page.getByLabel("Tags", { exact: true }).fill("Breakfast, sweet");
  await page.getByLabel("Notes", { exact: true }).fill("Rest the batter.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Tab pancakes" })).toBeVisible();
}

test.describe("recipe page", () => {
  let userId: string;

  test.beforeEach(async ({ page }) => {
    ({ id: userId } = await signInAsNewUser(page));
    await createPancakes(page);
  });

  test.afterEach(async () => {
    await deleteUser(userId);
  });

  test("on a phone, ingredients and instructions are tabs", async ({ page }) => {
    const ingredientsTab = page.getByRole("tab", { name: "Ingredients" });
    const instructionsTab = page.getByRole("tab", { name: "Instructions" });
    await expect(ingredientsTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("2 cups flour")).toBeVisible();
    await expect(page.getByText("Whisk.")).toBeHidden();

    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "More servings" }).click();
    await expect(page.getByText("4 cups flour")).toBeVisible();

    await instructionsTab.click();
    await expect(instructionsTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Whisk.")).toBeVisible();
    await expect(page.getByText("4 cups flour")).toBeHidden();

    // The scaled servings survive switching back.
    await ingredientsTab.click();
    await expect(page.getByText("4 cups flour")).toBeVisible();

    // Arrow keys move between tabs.
    await ingredientsTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(instructionsTab).toBeFocused();
    await expect(instructionsTab).toHaveAttribute("aria-selected", "true");
  });

  test("tags come last on the page", async ({ page }) => {
    const tags = page.getByRole("list", { name: "Tags" });
    await expect(tags.getByRole("link", { name: "breakfast" })).toBeVisible();
    const tagsTop = (await tags.boundingBox())!.y;
    for (const region of ["Add to plan", "Notes"]) {
      const box = (await page.getByRole("region", { name: region }).boundingBox())!;
      expect(tagsTop).toBeGreaterThan(box.y + box.height - 1);
    }
  });
});

test.describe("recipe page on a wide screen", () => {
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });
  let userId: string;

  test.beforeEach(async ({ page }) => {
    ({ id: userId } = await signInAsNewUser(page));
    await createPancakes(page);
  });

  test.afterEach(async () => {
    await deleteUser(userId);
  });

  test("shows ingredients and instructions side by side, without tabs", async ({ page }) => {
    await expect(page.getByRole("tablist")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Ingredients" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Instructions" })).toBeVisible();
    await expect(page.getByText("2 cups flour")).toBeVisible();
    await expect(page.getByText("Whisk.")).toBeVisible();
  });
});
