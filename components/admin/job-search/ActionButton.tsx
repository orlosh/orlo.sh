"use client";

import { useActionState } from "react";
import { type ActionState, idle } from "@/lib/admin/form";

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>;

const VARIANT = {
  primary: "btn",
  ghost: "btn-ghost",
  link: "rounded-md px-2 py-1 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-carbon disabled:opacity-60",
};

/** Botón que ejecuta una Server Action con campos ocultos (completar tarea, mover estado…). */
export function ActionButton({
  action,
  hidden,
  label,
  pendingLabel,
  confirmText,
  variant = "ghost",
  ariaLabel,
}: {
  action: Action;
  hidden: Record<string, string>;
  label: React.ReactNode;
  pendingLabel?: string;
  confirmText?: string;
  variant?: keyof typeof VARIANT;
  ariaLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
      className="inline-flex items-center gap-2"
    >
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button type="submit" disabled={pending} aria-label={ariaLabel} className={VARIANT[variant]}>
        {pending ? (pendingLabel ?? "…") : label}
      </button>
      {state.status === "error" ? (
        <span role="alert" className="text-xs text-red-500">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
