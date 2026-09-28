import { expect, test } from "@playwright/test";
import { formatWeekRange, mondayOf, todayIn } from "../../lib/dates";
import { deleteUser, signInAsNewUser } from "./helpers";

// A time zone whose calendar date differs from UTC's right now: UTC−11 before 11:00 UTC, UTC+14 after.
// That makes the "first request used UTC" case reproducible at any hour.
const ZONE = new Date().getUTCHours() < 11 ? "Pacific/Pago_Pago" : "Pacific/Kiritimati";
test.use({ timezoneId: ZONE });

test("a fresh device's first page shows the week for its own time zone", async ({ page }) => {
  const { id } = await signInAsNewUser(page);
  try {
    // Straight to /list, racing the time-zone cookie the sign-in page is still writing.
    await page.goto("/list");
    const expected = `Week of ${formatWeekRange(mondayOf(todayIn(ZONE)))}`;
    await expect(page.getByText(expected)).toBeVisible();
  } finally {
    await deleteUser(id);
  }
});
