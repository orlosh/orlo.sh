/**
 * Etapas en orden, tal como están en el fichero del workflow. Las que pueden bloquear un
 * despliegue lo indican en texto. Sin duraciones inventadas.
 */
export function PipelineFlow({ stages }: { stages: { name: string; runs: string; gate?: boolean }[] }) {
  return (
    <ol className="space-y-3">
      {stages.map((s, i) => (
        <li key={s.name} className="flex gap-4 border border-primary/15 bg-carbon px-4 py-3">
          <span className="w-6 shrink-0 text-sm text-slate-400" aria-hidden>
            {i + 1}.
          </span>
          <div>
            <p className="font-semibold text-white">
              {s.name}
              {s.gate ? <span className="ml-2 text-xs font-normal text-primary">bloquea el despliegue si falla</span> : null}
            </p>
            <p className="mt-0.5 text-sm text-slate-400">{s.runs}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
