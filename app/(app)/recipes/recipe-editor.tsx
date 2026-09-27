"use client";

import { useActionState, useState, useTransition } from "react";
import { ui } from "@/components/ui";
import { parseIngredient } from "@/lib/ingredients";
import { draftToFormValues, type RecipeFormValues } from "@/lib/recipe-input";
import { formatQuantity, unitLabel } from "@/lib/units";
import { importRecipe, type RecipeFormState } from "./actions";

type SaveAction = (prev: RecipeFormState, formData: FormData) => Promise<RecipeFormState>;

type EditorProps = {
  action: SaveAction;
  initial: RecipeFormValues;
  hasPhoto?: boolean;
  showImport?: boolean;
  submitLabel: string;
};

export function RecipeEditor({ action, initial, hasPhoto = false, showImport = false, submitLabel }: EditorProps) {
  const [draft, setDraft] = useState(initial);
  // Bumping the key remounts the form, which also clears any previous submission state.
  const [version, setVersion] = useState(0);

  return (
    <div className="space-y-6">
      {showImport && (
        <ImportBox
          onDraft={(values) => {
            setDraft(values);
            setVersion((v) => v + 1);
          }}
        />
      )}
      <RecipeFields key={version} action={action} initial={draft} hasPhoto={hasPhoto} submitLabel={submitLabel} />
    </div>
  );
}

function ImportBox({ onDraft }: { onDraft: (values: RecipeFormValues) => void }) {
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function runImport() {
    startTransition(async () => {
      setMessage(null);
      const result = await importRecipe(url);
      if (result.ok) {
        onDraft(draftToFormValues(result.draft));
        setMessage("Imported. Review the recipe below, then save.");
      } else {
        if (result.draft) onDraft(draftToFormValues(result.draft));
        setMessage(result.message);
      }
    });
  }

  return (
    <section aria-labelledby="import-heading" className={ui.card}>
      <h2 id="import-heading" className="text-base font-semibold">
        Import from a URL
      </h2>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          runImport();
        }}
      >
        <label htmlFor="import-url" className="sr-only">
          Recipe URL
        </label>
        <input id="import-url" type="url" inputMode="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} className={`${ui.input} mt-0`} />
        <button type="submit" disabled={pending || !url.trim()} className={ui.buttonSecondary}>
          {pending ? "Importing…" : "Import"}
        </button>
      </form>
      {message && (
        <p role="status" className={ui.hint}>
          {message}
        </p>
      )}
    </section>
  );
}

function RecipeFields({ action, initial, hasPhoto, submitLabel }: Omit<EditorProps, "showImport">) {
  const [state, formAction, pending] = useActionState(action, null);
  // After a failed save the action returns what was submitted; React resets uncontrolled fields
  // to these defaults, so nothing typed is lost.
  const values = state?.values ?? initial;
  const errors = state?.fieldErrors ?? {};
  const [ingredients, setIngredients] = useState(initial.ingredients);

  const describedBy = (name: keyof typeof errors, hint?: string) =>
    [errors[name] ? `${name}-error` : null, hint ?? null].filter(Boolean).join(" ") || undefined;
  const fieldError = (name: keyof typeof errors) =>
    errors[name] ? (
      <p id={`${name}-error`} className={ui.error}>
        {errors[name]}
      </p>
    ) : null;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state?.message && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          {state.message}
        </p>
      )}
      {Object.keys(errors).length > 0 && !state?.message && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          Please fix the highlighted fields.
        </p>
      )}

      <div>
        <label htmlFor="title" className={ui.label}>
          Title
        </label>
        <input id="title" name="title" defaultValue={values.title} aria-invalid={!!errors.title} aria-describedby={describedBy("title")} className={ui.input} />
        {fieldError("title")}
      </div>

      <div className="w-32">
        <label htmlFor="servings" className={ui.label}>
          Servings
        </label>
        <input id="servings" name="servings" type="number" inputMode="numeric" min={1} max={100} defaultValue={values.servings} aria-invalid={!!errors.servings} aria-describedby={describedBy("servings")} className={ui.input} />
        {fieldError("servings")}
      </div>

      <div>
        <label htmlFor="ingredients" className={ui.label}>
          Ingredients
        </label>
        <p id="ingredients-hint" className={ui.hint}>
          One per line, e.g. “1 ½ cups flour, sifted”.
        </p>
        <textarea
          id="ingredients"
          name="ingredients"
          rows={8}
          value={ingredients}
          onChange={(e) => setIngredients(e.target.value)}
          aria-invalid={!!errors.ingredients}
          aria-describedby={describedBy("ingredients", "ingredients-hint")}
          className={`${ui.input} font-mono text-sm`}
        />
        {fieldError("ingredients")}
        <IngredientPreview text={ingredients} />
      </div>

      <div>
        <label htmlFor="steps" className={ui.label}>
          Steps
        </label>
        <p id="steps-hint" className={ui.hint}>
          One step per line.
        </p>
        <textarea id="steps" name="steps" rows={6} defaultValue={values.steps} aria-invalid={!!errors.steps} aria-describedby={describedBy("steps", "steps-hint")} className={ui.input} />
        {fieldError("steps")}
      </div>

      <div>
        <label htmlFor="tags" className={ui.label}>
          Tags
        </label>
        <p id="tags-hint" className={ui.hint}>
          Separate with commas.
        </p>
        <input id="tags" name="tags" defaultValue={values.tags} aria-invalid={!!errors.tags} aria-describedby={describedBy("tags", "tags-hint")} className={ui.input} />
        {fieldError("tags")}
      </div>

      <div>
        <label htmlFor="sourceUrl" className={ui.label}>
          Source URL
        </label>
        <input id="sourceUrl" name="sourceUrl" type="url" inputMode="url" defaultValue={values.sourceUrl} aria-invalid={!!errors.sourceUrl} aria-describedby={describedBy("sourceUrl")} className={ui.input} />
        {fieldError("sourceUrl")}
      </div>

      <div>
        <label htmlFor="notes" className={ui.label}>
          Notes
        </label>
        <textarea id="notes" name="notes" rows={3} defaultValue={values.notes} aria-invalid={!!errors.notes} aria-describedby={describedBy("notes")} className={ui.input} />
        {fieldError("notes")}
      </div>

      <div>
        <label htmlFor="photo" className={ui.label}>
          Photo
        </label>
        <input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" aria-invalid={!!errors.photo} aria-describedby={describedBy("photo", "photo-hint")} className="mt-1 block text-sm" />
        <p id="photo-hint" className={ui.hint}>
          JPEG, PNG or WebP, up to 5 MB.{errors.photo ? " Choose the photo again after fixing other fields." : ""}
        </p>
        {fieldError("photo")}
        {hasPhoto && (
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" name="removePhoto" /> Remove current photo
          </label>
        )}
      </div>

      <button type="submit" disabled={pending} className={ui.button}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

function IngredientPreview({ text }: { text: string }) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  return (
    <ul aria-label="How each ingredient was read" className="mt-2 space-y-1 text-sm">
      {lines.map((line, i) => {
        const p = parseIngredient(line);
        if (p.name === null && p.quantity === null) {
          return (
            <li key={i} className="text-amber-800 dark:text-amber-400">
              ⚠ Couldn’t read “{line}”. It will be kept as written.
            </li>
          );
        }
        const parts = [p.quantity !== null ? formatQuantity(p.quantity) : null, p.unit ? unitLabel(p.unit, p.quantity ?? 1) : null, p.name];
        return (
          <li key={i} className="text-neutral-600 dark:text-neutral-400">
            {parts.filter(Boolean).join(" · ")}
            {p.note && <span className="text-neutral-400 dark:text-neutral-500"> ({p.note})</span>}
          </li>
        );
      })}
    </ul>
  );
}
