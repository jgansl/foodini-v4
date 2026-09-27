import { expect, test } from "@playwright/test";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { deleteUser, signInAsNewUser } from "./helpers";

const SOUP_PAGE = `<!doctype html><html><head><title>Soup | Test Kitchen</title>
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Recipe",
  name: "Tomato Soup",
  recipeYield: "4",
  recipeIngredient: ["2 tbsp olive oil", "1 (28 oz) can crushed tomatoes"],
  recipeInstructions: [{ "@type": "HowToStep", text: "Simmer 20 minutes." }],
  keywords: "soup, dinner",
})}</script></head><body><h1>Tomato Soup</h1></body></html>`;

test("signed-out visitors go to login and keep their destination", async ({ page }) => {
  await page.goto("/recipes?tag=soup");
  await expect(page).toHaveURL(/\/login\?next=%2Frecipes%3Ftag%3Dsoup$/);
  await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
});

test("an invalid sign-in link explains itself", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=bogus&type=email");
  await expect(page.getByRole("alert").filter({ hasText: "invalid or has expired" })).toBeVisible();
});

test("a session for an address outside ALLOWED_EMAILS is not let in", async ({ page }) => {
  const { id } = await signInAsNewUser(page, "outsider.test");
  try {
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/recipes");
    await expect(page).toHaveURL(/\/login/);
  } finally {
    await deleteUser(id);
  }
});

test.describe("signed in", () => {
  let userId: string;

  test.beforeEach(async ({ page }) => {
    ({ id: userId } = await signInAsNewUser(page));
  });

  test.afterEach(async () => {
    await deleteUser(userId);
  });

  test("create, scale, edit and delete a recipe", async ({ page }) => {
    await expect(page.getByText("No recipes yet")).toBeVisible();
    await page.getByRole("link", { name: "New recipe" }).click();

    await page.getByLabel("Title", { exact: true }).fill("Pancakes");
    await page.getByLabel("Servings", { exact: true }).fill("4");
    await page.getByLabel("Ingredients", { exact: true }).fill("2 cups flour\n1 ½ cups milk\n2 large eggs\nFor the batter:");
    await expect(page.getByText("Couldn’t read “For the batter:”")).toBeVisible();
    await page.getByLabel("Steps", { exact: true }).fill("Whisk.\nCook.");
    await page.getByLabel("Tags", { exact: true }).fill("Breakfast, sweet");
    await page.getByRole("button", { name: "Save recipe" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Pancakes" })).toBeVisible();
    await expect(page.getByText("2 cups flour")).toBeVisible();
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "More servings" }).click();
    await expect(page.getByText("8 servings")).toBeVisible();
    await expect(page.getByText("4 cups flour")).toBeVisible();
    await expect(page.getByText("3 cups milk")).toBeVisible();

    await page.getByRole("link", { name: "Edit" }).click();
    await page.getByLabel("Title", { exact: true }).fill("Fluffy pancakes");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Fluffy pancakes" })).toBeVisible();

    await page.getByRole("link", { name: "← Recipes" }).click();
    await page.getByRole("link", { name: "breakfast", exact: true }).click();
    await expect(page.getByRole("link", { name: /Fluffy pancakes/ })).toBeVisible();

    await page.getByRole("link", { name: /Fluffy pancakes/ }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(/\/recipes$/);
    await expect(page.getByText("No recipes yet")).toBeVisible();
  });

  test("validation errors keep what was typed", async ({ page }) => {
    await page.goto("/recipes/new");
    await page.getByLabel("Ingredients", { exact: true }).fill("3 eggs");
    await page.getByLabel("Steps", { exact: true }).fill("Scramble.");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page.getByText("Title is required")).toBeVisible();
    await expect(page.getByText("Servings is required")).toBeVisible();
    await expect(page.getByLabel("Ingredients", { exact: true })).toHaveValue("3 eggs");
    await expect(page.getByLabel("Steps", { exact: true })).toHaveValue("Scramble.");
  });

  test("a photo that is too large is refused without losing the form", async ({ page }) => {
    await page.goto("/recipes/new");
    await page.getByLabel("Title", { exact: true }).fill("Big photo stew");
    await page.getByLabel("Servings", { exact: true }).fill("2");
    await page.getByLabel("Ingredients", { exact: true }).fill("1 onion");
    await page.getByLabel("Photo", { exact: true }).setInputFiles({ name: "big.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(8 * 1024 * 1024) });
    await expect(page.getByText("Photos must be 5 MB or smaller.")).toBeVisible();
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page).toHaveURL(/\/recipes\/new$/);
    await expect(page.getByText("Photos must be 5 MB or smaller.")).toBeVisible();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Big photo stew");
    await expect(page.getByLabel("Ingredients", { exact: true })).toHaveValue("1 onion");
  });

  test("another user's recipe is a 404", async ({ page, browser }) => {
    await page.goto("/recipes/new");
    await page.getByLabel("Title", { exact: true }).fill("Private stew");
    await page.getByLabel("Servings", { exact: true }).fill("2");
    await page.getByLabel("Ingredients", { exact: true }).fill("1 onion");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Private stew" })).toBeVisible();
    const recipeUrl = page.url();

    const otherContext = await browser.newContext();
    const other = await otherContext.newPage();
    const { id: otherId } = await signInAsNewUser(other);
    try {
      await other.goto(recipeUrl);
      await expect(other.getByRole("heading", { name: "Recipe not found" })).toBeVisible();
    } finally {
      await otherContext.close();
      await deleteUser(otherId);
    }
  });

  test("import a recipe from a URL", async ({ page }) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(SOUP_PAGE);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}/soup`;

    try {
      await page.goto("/recipes/new");
      await page.getByLabel("Recipe URL").fill(url);
      await page.getByRole("button", { name: "Import", exact: true }).click();

      await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Tomato Soup");
      await expect(page.getByLabel("Servings", { exact: true })).toHaveValue("4");
      await expect(page.getByLabel("Ingredients", { exact: true })).toHaveValue("2 tbsp olive oil\n1 (28 oz) can crushed tomatoes");
      await expect(page.getByLabel("Tags", { exact: true })).toHaveValue("soup, dinner");

      await page.getByRole("button", { name: "Save recipe" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Tomato Soup" })).toBeVisible();
      await expect(page.getByRole("link", { name: /View original/ })).toHaveAttribute("href", url);
    } finally {
      server.close();
    }
  });
});
