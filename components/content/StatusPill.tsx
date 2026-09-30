import type { ProjectStatus } from "@/lib/content/types";

type Signal = "ok" | "crit" | "neutral" | "idle";

const DOT: Record<Signal, string> = {
  ok: "bg-primary",
  crit: "bg-red-500",
  neutral: "bg-white",
  idle: "bg-slate-500",
};

/** El punto siempre va con su palabra: el color nunca transmite significado por sí solo. */
export function StatusMark({ signal, children }: { signal: Signal; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-400">
      <span aria-hidden className={`size-1.5 rounded-full ${DOT[signal]}`} />
      {children}
    </span>
  );
}

const PROJECT_STATUS: Record<ProjectStatus, { signal: Signal; label: string }> = {
  in_progress: { signal: "neutral", label: "En desarrollo" },
  active: { signal: "ok", label: "Activo" },
  completed: { signal: "idle", label: "Completado" },
  archived: { signal: "idle", label: "Archivado" },
};

export function ProjectStatusMark({ status }: { status: ProjectStatus | null }) {
  if (!status) return null;
  const s = PROJECT_STATUS[status];
  return <StatusMark signal={s.signal}>{s.label}</StatusMark>;
}
