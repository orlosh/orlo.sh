"use client";

import { useActionState } from "react";
import { type ActionState, idle } from "@/lib/admin/form";

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>;

export function DeleteButton({
  action,
  hidden,
  label = "Eliminar",
  confirmText = "¿Eliminar definitivamente? No se puede deshacer.",
}: {
  action: Action;
  hidden: Record<string, string>;
  label?: string;
  confirmText?: string;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
      className="inline-flex items-center gap-3"
    >
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button
        type="submit"
        disabled={pending}
        className="rounded-sm border border-red-500/40 px-3 py-1.5 text-xs text-red-500 hover:border-red-500 disabled:opacity-60"
      >
        {label}
      </button>
      {state.status === "error" ? (
        <span role="alert" className="text-xs text-red-500">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
