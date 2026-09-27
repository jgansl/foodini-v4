"use client";

import { useState } from "react";
import { formatIngredient, parseIngredient } from "@/lib/ingredients";

export function ServingsScaler({ baseServings, ingredients }: { baseServings: number; ingredients: string[] }) {
  const [servings, setServings] = useState(baseServings);
  const factor = servings / baseServings;
  const stepper = "size-9 rounded-full border border-neutral-300 text-lg leading-none disabled:opacity-40 dark:border-neutral-700";

  return (
    <section aria-labelledby="ingredients-heading">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 id="ingredients-heading" className="text-lg font-semibold">
          Ingredients
        </h2>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Fewer servings" className={stepper} disabled={servings <= 1} onClick={() => setServings((s) => Math.max(1, s - 1))}>
            −
          </button>
          <span aria-live="polite" className="min-w-24 text-center text-sm">
            {servings} serving{servings === 1 ? "" : "s"}
          </span>
          <button type="button" aria-label="More servings" className={stepper} disabled={servings >= 100} onClick={() => setServings((s) => Math.min(100, s + 1))}>
            +
          </button>
        </div>
      </div>
      <ul className="space-y-2">
        {ingredients.map((raw, i) => (
          <li key={i} className="border-b border-neutral-100 pb-2 dark:border-neutral-800">
            {formatIngredient(parseIngredient(raw), factor)}
          </li>
        ))}
      </ul>
    </section>
  );
}
