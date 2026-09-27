import Link from "next/link";
import { ui } from "@/components/ui";
import { getGroceryList } from "@/db/queries/grocery";
import { addDays, formatWeekRange, mondayOf, resolveWeek } from "@/lib/dates";
import { requireUser } from "@/server/auth";
import { getToday } from "@/server/today";
import { addExtraAction } from "./actions";
import { AddExtraForm } from "./add-extra-form";
import { GroceryLines } from "./grocery-lines";

export default async function ListPage(props: PageProps<"/list">) {
  const user = await requireUser("/list");
  const params = await props.searchParams;
  const today = await getToday();
  const week = resolveWeek(typeof params.week === "string" ? params.week : undefined, today);
  const showHidden = params.hidden === "1";
  const list = await getGroceryList(user.id, week, { showHidden });
  const weekQuery = (w: string, extra = "") => `/list?week=${w}${extra}`;

  return (
    <main className={ui.page}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className={ui.h1}>Grocery list</h1>
        <p className="text-neutral-600 dark:text-neutral-400" aria-live="polite">
          Week of {formatWeekRange(week)} · {list.toBuy} to buy{list.checked > 0 ? ` · ${list.checked} checked` : ""}
        </p>
      </div>
      <nav aria-label="Weeks" className="mb-4 flex gap-2">
        <Link href={weekQuery(addDays(week, -7))} className={ui.buttonSecondary}>
          ← Previous
        </Link>
        {week !== mondayOf(today) && (
          <Link href="/list" className={ui.buttonSecondary}>
            This week
          </Link>
        )}
        <Link href={weekQuery(addDays(week, 7))} className={ui.buttonSecondary}>
          Next →
        </Link>
      </nav>

      <AddExtraForm action={addExtraAction.bind(null, week)} />

      {list.sections.length === 0 ? (
        <div className={`${ui.card} text-center`}>
          <p>
            Nothing to buy this week.{" "}
            <Link href={`/plan?week=${week}`} className="text-emerald-700 underline dark:text-emerald-400">
              Plan some meals
            </Link>{" "}
            to build your list.
          </p>
        </div>
      ) : (
        <GroceryLines week={week} sections={list.sections} />
      )}

      {list.hiddenCount > 0 && (
        <p className="mt-6 text-sm">
          <Link href={showHidden ? weekQuery(week) : weekQuery(week, "&hidden=1")} className="text-neutral-600 underline dark:text-neutral-400">
            {showHidden ? "Hide hidden items" : `Show hidden (${list.hiddenCount})`}
          </Link>
        </p>
      )}
    </main>
  );
}
