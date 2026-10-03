"use client";

import { useState, useTransition } from "react";
import { idle } from "@/lib/admin/form";
import { changeStatusAction } from "@/lib/job-search/actions";
import type { OpportunityStatus } from "@/lib/job-search/enums";
import { OPTIONS } from "@/lib/job-search/labels";

/** Selector de estado que guarda al cambiar (con sus automatizaciones), sin botón aparte. */
export function StatusSelect({ id, status }: { id: string; status: OpportunityStatus }) {
  const [value, setValue] = useState(status);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-2 text-sm text-slate-600">
        Estado
        <select
          value={value}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value as OpportunityStatus;
            const prev = value;
            setValue(next);
            setError(null);
            startTransition(async () => {
              const fd = new FormData();
              fd.append("ids", id);
              fd.set("status", next);
              const res = await changeStatusAction(idle, fd);
              if (res.status === "error") {
                setValue(prev);
                setError(res.message);
              }
            });
          }}
          className="field w-auto py-1.5 font-medium text-carbon"
        >
          {OPTIONS.status().map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <span role="status" aria-live="polite" className="text-xs">
        {pending ? <span className="text-slate-500">Guardando…</span> : null}
        {error ? <span className="text-red-500">{error}</span> : null}
      </span>
    </div>
  );
}
