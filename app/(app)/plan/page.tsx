import Link from "next/link";
import { ui } from "@/components/ui";
import { listWeek } from "@/db/queries/plan";
import { listRecipes } from "@/db/queries/recipes";
import { addDays, formatDay, formatWeekRange, mondayOf, resolveWeek, weekDays } from "@/lib/dates";
import { requireUser } from "@/server/auth";
import { getToday } from "@/server/today";
import { AddEntryForm } from "./add-entry-form";
import { EntryCard } from "./entry-card";

export default async function PlanPage(props: PageProps<"/plan">) {
  const user = await requireUser("/plan");
  const params = await props.searchParams;
  const today = await getToday();
  const weekStart = resolveWeek(typeof params.week === "string" ? params.week : undefined, today);
  const [entries, recipes] = await Promise.all([listWeek(user.id, weekStart), listRecipes(user.id)]);
  const days = weekDays(weekStart);
  const recipeOptions = recipes.map((r) => ({ id: r.id, title: r.title })).sort((a, b) => a.title.localeCompare(b.title));
  const isThisWeek = weekStart === mondayOf(today);

  return (
    <main className={ui.page}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className={ui.h1}>Plan</h1>
        <p className="text-neutral-600 dark:text-neutral-400" aria-live="polite">
          Week of {formatWeekRange(weekStart)}
        </p>
      </div>
      <nav aria-label="Weeks" className="mb-6 flex gap-2">
        <Link href={`/plan?week=${addDays(weekStart, -7)}`} className={ui.buttonSecondary}>
          ← Previous
        </Link>
        {!isThisWeek && (
          <Link href="/plan" className={ui.buttonSecondary}>
            This week
          </Link>
        )}
        <Link href={`/plan?week=${addDays(weekStart, 7)}`} className={ui.buttonSecondary}>
          Next →
        </Link>
      </nav>

      <div className="space-y-6">
        {days.map((day) => {
          const dayEntries = entries.filter((e) => e.date === day);
          const headingId = `day-${day}`;
          return (
            <section key={day} aria-labelledby={headingId}>
              <h2 id={headingId} className="mb-2 flex items-center gap-2 text-lg font-semibold">
                {formatDay(day)}
                {day === today && <span className={`${ui.chipActive} py-0 text-xs`}>Today</span>}
              </h2>
              {dayEntries.length === 0 ? (
                <p className={ui.hint}>Nothing planned.</p>
              ) : (
                <ul className="space-y-2">
                  {dayEntries.map((entry, i) => (
                    <li key={entry.id}>
                      <EntryCard entry={entry} isFirst={i === 0} isLast={i === dayEntries.length - 1} isPast={day < today && entry.cookedAt === null} days={days} />
                    </li>
                  ))}
                </ul>
              )}
              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-medium text-emerald-700 dark:text-emerald-400">Add a recipe</summary>
                <AddEntryForm mode="day" date={day} recipes={recipeOptions} />
              </details>
            </section>
          );
        })}
      </div>
    </main>
  );
}
