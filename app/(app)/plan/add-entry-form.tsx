"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ui } from "@/components/ui";
import { addPlanEntryAction, type AddEntryState } from "./actions";

type Props =
  | { mode: "day"; date: string; recipes: { id: string; title: string }[] }
  | { mode: "recipe"; recipeId: string; defaultDate: string; defaultServings: number };

export function AddEntryForm(props: Props) {
  const [state, action, pending] = useActionState<AddEntryState, FormData>(addPlanEntryAction, null);
  const errors = state?.fieldErrors ?? {};
  const idPrefix = props.mode === "day" ? `add-${props.date}` : "add-to-plan";

  if (props.mode === "day" && props.recipes.length === 0) {
    return (
      <p className={ui.hint}>
        No recipes yet.{" "}
        <Link href="/recipes/new" className="underline">
          Add one
        </Link>{" "}
        to plan it.
      </p>
    );
  }

  return (
    <form action={action} className="mt-2 space-y-3" noValidate>
      {props.mode === "day" ? (
        <>
          <input type="hidden" name="date" value={props.date} />
          <div>
            <label htmlFor={`${idPrefix}-recipe`} className={ui.label}>
              Recipe
            </label>
            <select id={`${idPrefix}-recipe`} name="recipeId" defaultValue="" aria-invalid={!!errors.recipeId} className={ui.input}>
              <option value="" disabled>
                Choose a recipe…
              </option>
              {props.recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
            {errors.recipeId && <p className={ui.error}>{errors.recipeId}</p>}
          </div>
        </>
      ) : (
        <>
          <input type="hidden" name="recipeId" value={props.recipeId} />
          <div>
            <label htmlFor={`${idPrefix}-date`} className={ui.label}>
              Day
            </label>
            <input id={`${idPrefix}-date`} name="date" type="date" defaultValue={props.defaultDate} aria-invalid={!!errors.date} className={ui.input} />
            {errors.date && <p className={ui.error}>{errors.date}</p>}
          </div>
        </>
      )}
      <div className="flex gap-2">
        <div className="w-28">
          <label htmlFor={`${idPrefix}-servings`} className={ui.label}>
            Servings
          </label>
          <input
            id={`${idPrefix}-servings`}
            name="servings"
            type="number"
            inputMode="decimal"
            min={0.5}
            max={100}
            step={0.5}
            placeholder="Recipe's"
            defaultValue={props.mode === "recipe" ? props.defaultServings : undefined}
            aria-invalid={!!errors.servings}
            className={ui.input}
          />
        </div>
        <div className="flex-1">
          <label htmlFor={`${idPrefix}-label`} className={ui.label}>
            Label (optional)
          </label>
          <input id={`${idPrefix}-label`} name="label" maxLength={40} placeholder="Dinner" aria-invalid={!!errors.label} className={ui.input} />
        </div>
      </div>
      {errors.servings && <p className={ui.error}>{errors.servings}</p>}
      {errors.label && <p className={ui.error}>{errors.label}</p>}
      <button type="submit" disabled={pending} className={ui.button}>
        {pending ? "Adding…" : props.mode === "day" ? "Add" : "Add to plan"}
      </button>
    </form>
  );
}
