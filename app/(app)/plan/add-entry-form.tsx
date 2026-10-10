"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ui } from "@/components/ui";
import type { PlanFieldErrors } from "@/lib/plan-input";
import { addPlanEntryAction, type AddEntryState } from "./actions";

type Props =
  | { mode: "day"; date: string; recipes: { id: string; title: string }[] }
  | { mode: "recipe"; recipeId: string; defaultDate: string; defaultServings: number };

export function AddEntryForm(props: Props) {
  const [state, action, pending] = useActionState<AddEntryState, FormData>(addPlanEntryAction, null);
  const errors: PlanFieldErrors = state?.fieldErrors ?? {};
  const values = state?.values;
  const idPrefix = props.mode === "day" ? `add-${props.date}` : "add-to-plan";
  const errorId = (field: keyof PlanFieldErrors) => `${idPrefix}-${field}-error`;
  const describedBy = (field: keyof PlanFieldErrors) => (errors[field] ? errorId(field) : undefined);
  const fieldError = (field: keyof PlanFieldErrors) =>
    errors[field] ? (
      <p id={errorId(field)} role="alert" className={ui.error}>
        {errors[field]}
      </p>
    ) : null;

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
            <select
              id={`${idPrefix}-recipe`}
              name="recipeId"
              defaultValue={values?.recipeId ?? ""}
              aria-invalid={!!errors.recipeId}
              aria-describedby={describedBy("recipeId")}
              className={ui.input}
            >
              <option value="" disabled>
                Choose a recipe…
              </option>
              {props.recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
            {fieldError("recipeId")}
          </div>
        </>
      ) : (
        <>
          <input type="hidden" name="recipeId" value={props.recipeId} />
          <div>
            <label htmlFor={`${idPrefix}-date`} className={ui.label}>
              Day
            </label>
            <input
              id={`${idPrefix}-date`}
              name="date"
              type="date"
              defaultValue={values?.date ?? props.defaultDate}
              aria-invalid={!!errors.date}
              aria-describedby={describedBy("date")}
              className={ui.input}
            />
            {fieldError("date")}
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
            defaultValue={values?.servings ?? (props.mode === "recipe" ? props.defaultServings : undefined)}
            aria-invalid={!!errors.servings}
            aria-describedby={describedBy("servings")}
            className={ui.input}
          />
        </div>
        <div className="flex-1">
          <label htmlFor={`${idPrefix}-label`} className={ui.label}>
            Label (optional)
          </label>
          <input
            id={`${idPrefix}-label`}
            name="label"
            maxLength={40}
            placeholder="Dinner"
            defaultValue={values?.label ?? ""}
            aria-invalid={!!errors.label}
            aria-describedby={describedBy("label")}
            className={ui.input}
          />
        </div>
      </div>
      {fieldError("servings")}
      {fieldError("label")}
      <button type="submit" disabled={pending} className={ui.button}>
        {pending ? "Adding…" : props.mode === "day" ? "Add" : "Add to plan"}
      </button>
    </form>
  );
}
