"use client";

import { createContext, useActionState, useContext } from "react";
import { useFormStatus } from "react-dom";
import { type ActionState, idle } from "@/lib/admin/form";

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>;

const StateContext = createContext<ActionState>(idle);
export const useFieldError = (name: string) => {
  const s = useContext(StateContext);
  return s.status === "error" ? s.fieldErrors?.[name] : undefined;
};

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-background-dark disabled:opacity-60"
    >
      {pending ? "Guardando…" : label}
    </button>
  );
}

export function ActionForm({
  action,
  children,
  submitLabel = "Guardar",
  hidden = {},
  className = "space-y-5",
}: {
  action: Action;
  children: React.ReactNode;
  submitLabel?: string;
  hidden?: Record<string, string>;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, idle);
  return (
    <StateContext.Provider value={state}>
      <form action={formAction} className={className} noValidate>
        {Object.entries(hidden).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        {children}
        <div className="flex items-center gap-4 pt-2">
          <Submit label={submitLabel} />
          <p role="status" aria-live="polite" className="text-sm">
            {state.status === "success" ? <span className="text-carbon">✓ {state.message}</span> : null}
            {state.status === "error" ? <span className="text-red-500">{state.message}</span> : null}
          </p>
        </div>
      </form>
    </StateContext.Provider>
  );
}
