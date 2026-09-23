import type { PipelineStage } from "@/lib/architecture";

/**
 * Etapas de CI/CD exactamente como están definidas en el fichero del workflow, dibujadas como una
 * cadena. Las puertas de calidad (pasos que pueden bloquear un despliegue) van en colores
 * invertidos. Sin duraciones inventadas.
 */
export function PipelineFlow({ stages }: { stages: PipelineStage[] }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:gap-0">
      {stages.map((s, i) => (
        <li key={s.name} className="relative flex lg:pr-5">
          <div
            className={`flex w-full flex-col gap-2 rounded-md border p-4 ${
              s.gate ? "on-dark border-carbon bg-carbon text-slate-300" : "border-border-dark/15 bg-white"
            }`}
          >
            <span className="flex items-center justify-between font-mono text-[0.6875rem] uppercase tracking-[0.14em]">
              <span className={s.gate ? "text-primary" : "text-slate-600"}>{String(i + 1).padStart(2, "0")}</span>
              <span className={s.gate ? "text-slate-400" : "text-slate-600"}>{s.gate ? "gate" : "stage"}</span>
            </span>
            <span className={`text-lg font-semibold tracking-[-0.02em] ${s.gate ? "text-white" : "text-carbon"}`}>
              {s.name}
            </span>
            <span className={`font-mono text-xs leading-relaxed ${s.gate ? "text-slate-300" : "text-slate-600"}`}>
              {s.runs}
            </span>
          </div>
          {i < stages.length - 1 ? (
            <span aria-hidden className="absolute right-0 top-1/2 hidden h-px w-5 bg-carbon lg:block">
              <span className="absolute -right-px -top-[3px] size-[7px] rotate-45 border-r border-t border-carbon" />
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
