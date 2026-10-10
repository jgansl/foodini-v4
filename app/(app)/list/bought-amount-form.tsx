"use client";

import { useActionState } from "react";
import { ui } from "@/components/ui";
import type { BoughtAmountState } from "./actions";

export function BoughtAmountForm({
  id,
  name,
  current,
  disabled,
  action,
}: {
  id: string;
  name: string;
  current: string;
  disabled: boolean;
  action: (prev: BoughtAmountState, formData: FormData) => Promise<BoughtAmountState>;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-neutral-500">
        Change amount<span className="sr-only"> of {name}</span>
      </summary>
      <form action={formAction} className="mt-2 flex flex-wrap items-end gap-2" noValidate>
        <div className="min-w-28 flex-1">
          <label htmlFor={`bought-${id}`} className={ui.label}>
            Bought of {name}
          </label>
          <input
            id={`bought-${id}`}
            name="amount"
            defaultValue={state?.text ?? current}
            aria-invalid={!!state?.error}
            aria-describedby={state?.error ? `bought-${id}-error` : undefined}
            className={ui.input}
          />
        </div>
        <button type="submit" disabled={pending || disabled} className={ui.buttonSecondary}>
          {pending ? "Saving…" : "Save"}
        </button>
        {state?.saved && (
          <p role="status" className="w-full text-sm text-emerald-700 dark:text-emerald-400">
            Saved
          </p>
        )}
        {state?.error && (
          <p id={`bought-${id}-error`} role="alert" className={`${ui.error} w-full`}>
            {state.error}
          </p>
        )}
      </form>
    </details>
  );
}
