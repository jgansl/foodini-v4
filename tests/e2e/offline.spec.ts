import { expect, test, type Page } from "@playwright/test";
import { createRecipeViaUi, deleteUser, signInAs, signInAsNewUser } from "./helpers";

test.use({ timezoneId: "America/Los_Angeles" });

const line = (page: Page, text: string) => page.getByRole("listitem").filter({ hasText: text });

async function planSoup(page: Page) {
  const url = await createRecipeViaUi(page, "Soup", 2, "2 cups stock\n1 onion");
  await page.goto(url);
  await page.getByRole("button", { name: "Add to plan" }).click();
  await expect(page).toHaveURL(/\/plan\?week=/);
}

test.describe("offline grocery list", () => {
  let userId: string;
  let email: string;

  test.beforeEach(async ({ page }) => {
    ({ id: userId, email } = await signInAsNewUser(page));
  });

  test.afterEach(async () => {
    await deleteUser(userId);
  });

  test("check-offs made offline sync when the connection returns", async ({ page, context }) => {
    await planSoup(page);
    await page.goto("/list");
    await context.setOffline(true);
    await expect(page.getByText("You’re offline.")).toBeVisible();
    await line(page, "2 cups stock").getByRole("checkbox").check();
    await line(page, "1 onion").getByRole("checkbox").check();
    await expect(page.getByText("2 changes waiting to sync")).toBeVisible();
    await expect(page.getByRole("button", { name: "Hide stock" })).toBeDisabled();

    await context.setOffline(false);
    await expect(page.getByText(/changes? waiting to sync/)).toHaveCount(0);
    await expect(page.getByText(/· 2 checked/)).toBeVisible();
    await page.reload();
    await expect(line(page, "2 cups stock").getByRole("checkbox")).toBeChecked();
    await expect(line(page, "1 onion").getByRole("checkbox")).toBeChecked();
  });

  test("a check-off survives an immediate reload", async ({ page }) => {
    await planSoup(page);
    await page.goto("/list");
    await line(page, "2 cups stock").getByRole("checkbox").check();
    await page.reload();
    await expect(line(page, "2 cups stock").getByRole("checkbox")).toBeChecked();
    await expect(page.getByText(/· 1 checked/)).toBeVisible();
  });

  test("a newer change from another device wins", async ({ page, context, browser }) => {
    await planSoup(page);
    await page.goto("/list");
    await context.setOffline(true);
    await line(page, "2 cups stock").getByRole("checkbox").check();
    await expect(page.getByText("1 change waiting to sync")).toBeVisible();

    const otherContext = await browser.newContext({ timezoneId: "America/Los_Angeles" });
    const other = await otherContext.newPage();
    try {
      await signInAs(other, email);
      await other.goto("/list");
      await line(other, "2 cups stock").getByRole("checkbox").check();
      await expect(other.getByText(/· 1 checked/)).toBeVisible();
      await line(other, "2 cups stock").getByRole("checkbox").uncheck();
      await expect(other.getByText(/· 1 checked/)).toHaveCount(0);
    } finally {
      await otherContext.close();
    }

    await context.setOffline(false);
    await expect(page.getByText(/change waiting to sync/)).toHaveCount(0);
    await page.reload();
    await expect(line(page, "2 cups stock").getByRole("checkbox")).not.toBeChecked();
    await expect(page.getByRole("alert").filter({ hasText: "couldn't be saved" })).toHaveCount(0);
  });

  test("the sync endpoint rejects unauthenticated and malformed requests", async ({ page, request }) => {
    expect((await request.post("/api/grocery/sync", { data: { changes: [] } })).status()).toBe(401);
    expect((await page.request.post("/api/grocery/sync", { data: { nope: 1 } })).status()).toBe(400);
    const ok = await page.request.post("/api/grocery/sync", { data: { changes: [] } });
    expect(ok.status()).toBe(200);
    expect(await ok.json()).toEqual({ results: [] });
  });
});
