import { expect, test, type Page } from "@playwright/test";
import { createRecipeViaUi, deleteUser, signInAsNewUser } from "../e2e/helpers";

const line = (page: Page, text: string) => page.getByRole("listitem").filter({ hasText: text });

async function openListUnderServiceWorker(page: Page) {
  const url = await createRecipeViaUi(page, "Offline soup", 2, "2 cups stock");
  await page.goto(url);
  await page.getByRole("button", { name: "Add to plan" }).click();
  await expect(page).toHaveURL(/\/plan\?week=/);
  await page.goto("/list");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Reload once under the service worker's control so the page and its assets are cached.
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect(line(page, "2 cups stock")).toBeVisible();
}

test("the list opens with no signal after an online visit", async ({ page, context }) => {
  const { id } = await signInAsNewUser(page);
  try {
    await openListUnderServiceWorker(page);
    await context.setOffline(true);
    const response = await page.reload();
    expect(response?.fromServiceWorker()).toBe(true);
    await expect(page.getByText("You’re offline.")).toBeVisible();
    await line(page, "2 cups stock").getByRole("checkbox").check();
    await expect(page.getByText("1 change waiting to sync")).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByText(/change waiting to sync/)).toHaveCount(0);
    await page.reload();
    await expect(line(page, "2 cups stock").getByRole("checkbox")).toBeChecked();
  } finally {
    await deleteUser(id);
  }
});

test("signing out clears lists saved on the device", async ({ page }) => {
  const { id } = await signInAsNewUser(page);
  try {
    await openListUnderServiceWorker(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login\?signedOut=1/);
    await expect
      .poll(() =>
        page.evaluate(async () => ({
          caches: (await caches.keys()).filter((k) => k.startsWith("foodini-")).length,
          databases: (await indexedDB.databases()).filter((d) => d.name?.startsWith("foodini-")).length,
        })),
      )
      .toEqual({ caches: 0, databases: 0 });
  } finally {
    await deleteUser(id);
  }
});
