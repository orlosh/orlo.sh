import { healthReport } from "@/lib/health";

/**
 * Un «recibo» de la respuesta que el visitante está leyendo: cada valor se mide o se lee
 * mientras se renderiza esta petición. Nada aquí es decorativo.
 */
export async function RequestReceipt({ dataMs, renderedAt }: { dataMs: number; renderedAt: string }) {
  const health = await healthReport();
  const rows: [string, string][] = [
    ["render", "SSR · Server Components"],
    ["datos", `${dataMs} ms · caché por etiquetas`],
    ["postgresql", `${health.checks.database.status} · ${health.checks.database.latencyMs} ms`],
    ["csp", "nonce nuevo en esta respuesta"],
    ["versión", health.version.slice(0, 12)],
    ["uptime", `${health.uptimeSeconds} s`],
  ];
  return (
    <aside aria-label="Datos de esta respuesta" className="relative rounded-md border border-carbon bg-white font-mono text-xs">
      <div className="flex items-center justify-between border-b border-dashed border-carbon/40 px-4 py-3">
        <span className="uppercase tracking-[0.14em] text-carbon">esta respuesta</span>
        <span className="flex items-center gap-1.5 text-slate-700">
          <span aria-hidden className={`size-2 rounded-full ${health.status === "ok" ? "bg-primary" : "bg-red-500"}`} />
          {health.status}
        </span>
      </div>
      <dl className="space-y-2 px-4 py-4">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="text-slate-600">{k}</dt>
            <dd className="text-right text-carbon">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="border-t border-dashed border-carbon/40 px-4 py-3 text-slate-600">
        <time dateTime={renderedAt}>{renderedAt.replace("T", " ").slice(0, 19)} UTC</time>
      </div>
    </aside>
  );
}
