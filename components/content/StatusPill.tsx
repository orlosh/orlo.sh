import type { ProjectStatus } from "@/lib/content/types";

type Signal = "ok" | "crit" | "neutral" | "idle";

const DOT: Record<Signal, string> = {
  ok: "bg-primary",
  crit: "bg-red-500",
  neutral: "bg-carbon",
  idle: "bg-slate-400",
};

/** Un punto siempre va acompañado de su palabra: el color nunca transmite significado por sí solo. */
export function StatusPill({ signal, children }: { signal: Signal; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border-dark/15 bg-white px-2.5 py-0.5 font-mono text-xs text-slate-700">
      <span aria-hidden className={`size-2 rounded-full ${DOT[signal]}`} />
      {children}
    </span>
  );
}

const PROJECT_STATUS: Record<ProjectStatus, { signal: Signal; label: string }> = {
  in_progress: { signal: "neutral", label: "en desarrollo" },
  active: { signal: "ok", label: "activo" },
  completed: { signal: "idle", label: "completado" },
  archived: { signal: "idle", label: "archivado" },
};

export function ProjectStatusPill({ status }: { status: ProjectStatus | null }) {
  if (!status) return null;
  const s = PROJECT_STATUS[status];
  return <StatusPill signal={s.signal}>{s.label}</StatusPill>;
}
