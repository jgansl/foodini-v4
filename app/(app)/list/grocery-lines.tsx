"use client";

import { useOptimistic, useTransition } from "react";
import { ui } from "@/components/ui";
import type { GroceryLine } from "@/lib/grocery";
import { hideLineAction, removeExtraAction, toggleExtraAction, toggleLineAction } from "./actions";

type Section = { section: string; lines: GroceryLine[] };

export function GroceryLines({ week, sections }: { week: string; sections: Section[] }) {
  const [, startTransition] = useTransition();
  // Flip a line's checked state immediately; the server's re-render replaces it when the action finishes.
  const [optimistic, flip] = useOptimistic(sections, (current: Section[], id: string) =>
    current.map((s) => ({ ...s, lines: s.lines.map((l) => (l.id === id ? { ...l, checked: !l.checked } : l)) })),
  );

  function toggle(line: GroceryLine) {
    startTransition(async () => {
      flip(line.id);
      if (line.extraId) await toggleExtraAction(line.extraId, !line.checked);
      else await toggleLineAction(week, line.key, !line.checked);
    });
  }

  return (
    <div className="space-y-6">
      {optimistic.map(({ section, lines }) => (
        <section key={section} aria-labelledby={`section-${section}`}>
          <h2 id={`section-${section}`} className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            {section}
          </h2>
          <ul className={`${ui.card} divide-y divide-neutral-100 p-0 dark:divide-neutral-800`}>
            {lines.map((line) => (
              <li key={line.id} className={`flex items-center gap-3 px-4 py-3 ${line.hidden ? "opacity-50" : ""}`}>
                <input
                  id={`line-${line.id}`}
                  type="checkbox"
                  checked={line.checked}
                  onChange={() => toggle(line)}
                  className="size-5 shrink-0 accent-emerald-700"
                />
                <label htmlFor={`line-${line.id}`} className="min-w-0 flex-1">
                  <span className={line.checked ? "text-neutral-500 line-through" : ""}>{line.label}</span>
                  {line.recipes.length > 0 && <span className="block truncate text-xs text-neutral-500">for {line.recipes.join(", ")}</span>}
                </label>
                {line.extraId ? (
                  <form action={removeExtraAction.bind(null, line.extraId)}>
                    <button type="submit" aria-label={`Remove ${line.name}`} className="text-sm text-neutral-500 hover:underline">
                      Remove
                    </button>
                  </form>
                ) : (
                  <form action={hideLineAction.bind(null, week, line.key, !line.hidden)}>
                    <button type="submit" aria-label={`${line.hidden ? "Unhide" : "Hide"} ${line.name}`} className="text-sm text-neutral-500 hover:underline">
                      {line.hidden ? "Unhide" : "Hide"}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
