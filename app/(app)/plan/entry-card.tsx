import Link from "next/link";
import { ConfirmForm } from "@/components/confirm-form";
import { ui } from "@/components/ui";
import type { PlanEntryView } from "@/db/queries/plan";
import { formatDay } from "@/lib/dates";
import { formatQuantity } from "@/lib/units";
import { movePlanEntryAction, moveToDateAction, removePlanEntryAction, setCookedAction, updatePlanEntryAction } from "./actions";
import { EntryEditor } from "./entry-editor";

const iconButton =
  "inline-flex size-9 items-center justify-center rounded-lg border border-neutral-300 text-sm disabled:opacity-30 dark:border-neutral-700";

export function EntryCard({ entry, isFirst, isLast, isPast, days }: { entry: PlanEntryView; isFirst: boolean; isLast: boolean; isPast: boolean; days: string[] }) {
  const cooked = entry.cookedAt !== null;
  const servingsText = `${formatQuantity(entry.servings)} serving${entry.servings === 1 ? "" : "s"}`;
  return (
    <article aria-label={entry.recipeTitle} className={`${ui.card} ${cooked ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/recipes/${entry.recipeId}`} className={`font-medium hover:underline ${cooked ? "line-through" : ""}`}>
            {entry.recipeTitle}
          </Link>
          <p className="text-sm text-neutral-500">
            {servingsText}
            {entry.label && <span className={`${ui.chip} ml-2 py-0 text-xs`}>{entry.label}</span>}
            {cooked && <span className="ml-2 text-emerald-700 dark:text-emerald-400">✓ Cooked</span>}
          </p>
        </div>
        <div className="flex gap-1">
          <form action={movePlanEntryAction.bind(null, entry.id, "up")}>
            <button type="submit" aria-label="Move up" disabled={isFirst} className={iconButton}>
              ↑
            </button>
          </form>
          <form action={movePlanEntryAction.bind(null, entry.id, "down")}>
            <button type="submit" aria-label="Move down" disabled={isLast} className={iconButton}>
              ↓
            </button>
          </form>
        </div>
      </div>

      {isPast && (
        <p role="note" className="mt-2 text-sm text-amber-800 dark:text-amber-400">
          From an earlier day. Mark it cooked or remove it?
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <form action={setCookedAction.bind(null, entry.id, !cooked)}>
          <button type="submit" className={cooked ? ui.buttonSecondary : ui.button}>
            {cooked ? "Mark not cooked" : "Mark cooked"}
          </button>
        </form>
        <ConfirmForm action={removePlanEntryAction.bind(null, entry.id)} message={`Remove “${entry.recipeTitle}” from ${formatDay(entry.date)}?`}>
          <button type="submit" className={ui.buttonDanger}>
            Remove
          </button>
        </ConfirmForm>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-neutral-600 dark:text-neutral-400">Edit or move</summary>
        <EntryEditor entryId={entry.id} servings={entry.servings} label={entry.label} action={updatePlanEntryAction.bind(null, entry.id)} />
        <form action={moveToDateAction.bind(null, entry.id)} className="mt-2 flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor={`entry-${entry.id}-day`} className={ui.label}>
              Move to
            </label>
            <select id={`entry-${entry.id}-day`} name="date" defaultValue={entry.date} className={ui.input}>
              {days.map((d) => (
                <option key={d} value={d}>
                  {formatDay(d)}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={ui.buttonSecondary}>
            Move
          </button>
        </form>
      </details>
    </article>
  );
}
