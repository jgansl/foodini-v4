"use client";

import { useActionState } from "react";
import { ui } from "@/components/ui";
import { sendMagicLink, type LoginState } from "./actions";

const initial: LoginState = { status: "idle" };

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(sendMagicLink, initial);

  if (state.status === "sent") {
    return (
      <p role="status" className="text-base">
        Check <strong>{state.email}</strong> for a sign-in link. You can close this tab.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="email" className={ui.label}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={state.status === "error" ? state.email : ""}
          aria-invalid={state.status === "error"}
          aria-describedby={state.status === "error" ? "email-error" : undefined}
          className={ui.input}
        />
        {state.status === "error" && (
          <p id="email-error" role="alert" className={ui.error}>
            {state.message}
          </p>
        )}
      </div>
      <button type="submit" disabled={pending} className={`${ui.button} w-full`}>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
