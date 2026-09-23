import { dashboardCounts, recentAudit } from "@/lib/admin/queries";

export default async function AdminHome() {
  const [counts, audit] = await Promise.all([dashboardCounts(), recentAudit()]);
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold text-carbon">Resumen</h1>
      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border-dark/15 bg-border-dark/15 md:grid-cols-5">
        {[
          ["Proyectos", counts.projects],
          ["Notas", counts.notes],
          ["Borradores", counts.drafts],
          ["Experiencias", counts.experiences],
          ["Tecnologías", counts.technologies],
        ].map(([label, value]) => (
          <div key={label} className="bg-white p-4">
            <dt className="label">{label}</dt>
            <dd className="mt-2 font-mono text-2xl text-carbon">{value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="audit" className="mt-12">
        <h2 id="audit" className="label">
          Audit log · últimos cambios
        </h2>
        {audit.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left font-mono text-xs">
              <thead>
                <tr className="text-slate-600">
                  <th className="py-2 pr-4 font-normal">Fecha (UTC)</th>
                  <th className="py-2 pr-4 font-normal">Acción</th>
                  <th className="py-2 pr-4 font-normal">Entidad</th>
                  <th className="py-2 font-normal">Actor</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id} className="border-t border-border-dark/15 text-slate-800">
                    <td className="py-2 pr-4">{a.createdAt.toISOString().replace("T", " ").slice(0, 19)}</td>
                    <td className="py-2 pr-4">{a.action}</td>
                    <td className="py-2 pr-4">
                      {a.entity} <span className="text-slate-600">{a.entityId?.slice(0, 8)}</span>
                    </td>
                    <td className="py-2">{a.actor ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-600">Sin cambios registrados todavía.</p>
        )}
      </section>
    </div>
  );
}
