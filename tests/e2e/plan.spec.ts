import { expect, test, type Page } from "@playwright/test";
import { createRecipeViaUi, deleteUser, signInAsNewUser } from "./helpers";

// Late on a Sunday in Los Angeles, UTC is already Monday; the plan must follow the user's zone.
const TIME_ZONE = "America/Los_Angeles";
test.use({ timezoneId: TIME_ZONE });

const localDate = (offsetDays = 0) => {
  const now = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
};

const todaySection = (page: Page) => page.getByRole("region", { name: /Today/ });

test.describe("meal plan", () => {
  let userId: string;

  test.beforeEach(async ({ page }) => {
    ({ id: userId } = await signInAsNewUser(page));
  });

  test.afterEach(async () => {
    await deleteUser(userId);
  });

  test("plan, reorder, edit, cook and remove meals", async ({ page }) => {
    const soupUrl = await createRecipeViaUi(page, "Tomato soup", 4, "1 can tomatoes");
    await createRecipeViaUi(page, "Grilled cheese", 2, "2 slices bread");

    await page.goto(soupUrl);
    await expect(page.getByLabel("Day", { exact: true })).toHaveValue(localDate());
    await page.getByLabel("Servings", { exact: true }).fill("2");
    await page.getByLabel("Label (optional)").fill("Dinner");
    await page.getByRole("button", { name: "Add to plan" }).click();
    await expect(page).toHaveURL(/\/plan\?week=/);

    const today = todaySection(page);
    const soup = today.getByRole("article", { name: "Tomato soup" });
    await expect(soup).toContainText("2 servings");
    await expect(soup).toContainText("Dinner");

    await today.getByText("Add a recipe").click();
    await today.getByLabel("Recipe", { exact: true }).selectOption({ label: "Grilled cheese" });
    await today.getByRole("button", { name: "Add", exact: true }).click();
    await expect(todaySection(page).getByRole("article")).toHaveText([/Tomato soup/, /Grilled cheese/]);

    await todaySection(page).getByRole("article", { name: "Grilled cheese" }).getByRole("button", { name: "Move up" }).click();
    await expect(todaySection(page).getByRole("article")).toHaveText([/Grilled cheese/, /Tomato soup/]);
    await expect(todaySection(page).getByRole("article", { name: "Grilled cheese" }).getByRole("button", { name: "Move up" })).toBeDisabled();

    const soupCard = todaySection(page).getByRole("article", { name: "Tomato soup" });
    await soupCard.getByText("Edit or move").click();
    await soupCard.getByLabel("Servings", { exact: true }).fill("3");
    await soupCard.getByRole("button", { name: "Save" }).click();
    await expect(soupCard).toContainText("3 servings");

    await soupCard.getByRole("button", { name: "Mark cooked" }).click();
    await expect(soupCard).toContainText("✓ Cooked");
    await soupCard.getByRole("button", { name: "Mark not cooked" }).click();
    await expect(soupCard).not.toContainText("✓ Cooked");

    page.once("dialog", (dialog) => dialog.accept());
    await todaySection(page).getByRole("article", { name: "Grilled cheese" }).getByRole("button", { name: "Remove" }).click();
    await expect(todaySection(page).getByRole("article")).toHaveText([/Tomato soup/]);
  });

  test("plan forms keep what was typed when they can't save", async ({ page }) => {
    const url = await createRecipeViaUi(page, "Soup for errors", 4, "1 onion");
    await page.goto("/plan");
    const today = todaySection(page);
    await today.getByText("Add a recipe").click();
    await today.getByLabel("Servings", { exact: true }).fill("3");
    await today.getByLabel("Label (optional)").fill("Lunch");
    await today.getByRole("button", { name: "Add", exact: true }).click();
    await expect(today.getByRole("alert")).toHaveText("Pick a recipe");
    await expect(today.getByLabel("Servings", { exact: true })).toHaveValue("3");
    await expect(today.getByLabel("Label (optional)")).toHaveValue("Lunch");

    await page.goto(url);
    await page.getByRole("button", { name: "Add to plan" }).click();
    await expect(page).toHaveURL(/\/plan/);
    const card = todaySection(page).getByRole("article", { name: "Soup for errors" });
    await card.getByText("Edit or move").click();
    await card.getByLabel("Servings", { exact: true }).fill("1.3");
    await card.getByLabel("Label", { exact: true }).fill("Brunch");
    await card.getByRole("button", { name: "Save" }).click();
    await expect(card.getByRole("alert")).toHaveText("Use whole or half servings");
    await expect(card.getByLabel("Servings", { exact: true })).toHaveValue("1.3");
    await expect(card.getByLabel("Label", { exact: true })).toHaveValue("Brunch");
  });

  test("uncooked meals from an earlier day get a nudge", async ({ page }) => {
    const url = await createRecipeViaUi(page, "Leftover stew", 2, "1 onion");
    await page.goto(url);
    await page.getByLabel("Day", { exact: true }).fill(localDate(-1));
    await page.getByRole("button", { name: "Add to plan" }).click();
    // The action redirects to the entry's week, which is where the nudge should appear.
    await expect(page).toHaveURL(/\/plan\?week=/);
    const stew = page.getByRole("article", { name: "Leftover stew" });
    await expect(stew.getByRole("note")).toHaveText("From an earlier day. Mark it cooked or remove it?");
    await stew.getByRole("button", { name: "Mark cooked" }).click();
    await expect(page.getByRole("article", { name: "Leftover stew" }).getByRole("note")).toHaveCount(0);
  });

  test("week navigation and a bad week in the URL", async ({ page }) => {
    await page.goto("/plan?week=2026-10-01");
    await expect(page.getByText("Week of Sep 28 – Oct 4")).toBeVisible();
    await page.getByRole("link", { name: "Next →" }).click();
    await expect(page).toHaveURL(/week=2026-10-05$/);
    await expect(page.getByText("Week of Oct 5 – Oct 11")).toBeVisible();

    await page.goto("/plan?week=2026-02-30");
    await expect(page.getByRole("region", { name: /Today/ })).toBeVisible();
  });

  test("deleting a planned recipe says how many meals it removes", async ({ page }) => {
    const url = await createRecipeViaUi(page, "Planned pie", 8, "2 cups flour");
    await page.goto(url);
    await page.getByRole("button", { name: "Add to plan" }).click();
    await expect(page).toHaveURL(/\/plan/);

    await page.goto(url);
    let message = "";
    page.once("dialog", (dialog) => {
      message = dialog.message();
      void dialog.accept();
    });
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(/\/recipes$/);
    expect(message).toContain("1 planned meal, which will be removed too");

    await page.goto("/plan");
    await expect(page.getByRole("article", { name: "Planned pie" })).toHaveCount(0);
  });
});
