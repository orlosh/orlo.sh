import { dashboardCounts, recentAudit } from "@/lib/admin/queries";

export default async function AdminHome() {
  const [counts, audit] = await Promise.all([dashboardCounts(), recentAudit()]);
  return (
    <div className="max-w-4xl">
      <h1 className="page-title">Resumen</h1>
      <dl className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Proyectos", counts.projects],
          ["Notas", counts.notes],
          ["Borradores", counts.drafts],
          ["Experiencias", counts.experiences],
          ["Tecnologías", counts.technologies],
        ].map(([label, value]) => (
          <div key={label} className="panel p-4">
            <dt className="label">{label}</dt>
            <dd className="mt-3 font-mono text-3xl text-carbon">{value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="audit" className="mt-12">
        <h2 id="audit" className="label">
          Audit log · últimos cambios
        </h2>
        {audit.length ? (
          <div className="panel mt-3 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left font-mono text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500">
                  <th className="px-4 py-2.5 font-normal">Fecha (UTC)</th>
                  <th className="px-4 py-2.5 font-normal">Acción</th>
                  <th className="px-4 py-2.5 font-normal">Entidad</th>
                  <th className="px-4 py-2.5 font-normal">Actor</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id} className="border-t border-slate-200 text-slate-700">
                    <td className="px-4 py-2.5">{a.createdAt.toISOString().replace("T", " ").slice(0, 19)}</td>
                    <td className="px-4 py-2.5">{a.action}</td>
                    <td className="px-4 py-2.5">
                      {a.entity} <span className="text-slate-500">{a.entityId?.slice(0, 8)}</span>
                    </td>
                    <td className="px-4 py-2.5">{a.actor ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="panel mt-3 px-4 py-6 text-sm text-slate-500">Sin cambios registrados todavía.</p>
        )}
      </section>
    </div>
  );
}
