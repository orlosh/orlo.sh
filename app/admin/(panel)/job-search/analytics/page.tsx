import { BarRow, Empty, PageHeader, Section, Table, td } from "@/components/admin/job-search/ui";
import { conversions, FUNNEL_STEPS, funnel, insights, MIN_SAMPLE, pct, referralAnalytics, type Rate, timeAnalytics } from "@/lib/job-search/analytics";
import { getWorkspace } from "@/lib/job-search/server";

export const metadata = { title: "Métricas" };

/** Una tasa con su muestra; por debajo del mínimo se marca como insuficiente en vez de ocultarla. */
function RateCell({ r }: { r: Rate }) {
  return (
    <span className="font-mono text-xs">
      <span className="text-carbon">{pct(r)}</span> <span className="text-slate-500">({r.num}/{r.den})</span>
      {r.den > 0 && r.den < MIN_SAMPLE ? <span className="ml-1 text-slate-500">· muestra pequeña</span> : null}
    </span>
  );
}

const days = (d: { avg: number | null; n: number }) => (d.avg === null ? "Datos insuficientes" : `${d.avg} d (${d.n} casos)`);

export default async function AnalyticsPage() {
  const { snapshot: s, engine } = await getWorkspace();
  const f = funnel(engine.facts);
  const conv = conversions(engine.facts);
  const ref = referralAnalytics(engine.facts);
  const time = timeAnalytics(s, engine.facts);
  const found = insights(s, engine.facts);

  return (
    <div className="space-y-12">
      <PageHeader title="Métricas" description={`Calculadas sobre el historial real de estados. Las tasas con menos de ${MIN_SAMPLE} casos se marcan como muestra pequeña.`} />

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        <Section title="Embudo">
          <div className="panel space-y-2 p-4">
            {FUNNEL_STEPS.map(([key, label], i) => {
              const prev = i ? f[FUNNEL_STEPS[i - 1][0]] : null;
              return <BarRow key={key} label={label} value={f[key]} max={f.opportunities} detail={prev !== null ? pct(prev ? f[key] / prev : null) : undefined} />;
            })}
          </div>
          <p className="text-xs text-slate-600">
            Respuesta: la empresa contestó tras aplicar (llamada, entrevista o descarte). Entrevista: pasó de la llamada inicial con el reclutador.
          </p>
        </Section>
        <Section title="Conversiones">
          <Table head={["Paso", "Tasa"]} minWidth="20rem">
            {conv.map((c) => (
              <tr key={c.key}>
                <td className={td}>{c.label}</td>
                <td className={td}>
                  <RateCell r={c} />
                </td>
              </tr>
            ))}
          </Table>
        </Section>
      </div>

      <Section title="Rendimiento por fuente">
        {engine.sources.length ? (
          <Table head={["Fuente", "Oportunidades", "Candidaturas", "Respuestas", "Entrevistas", "Ofertas", "Conversión (entrevistas / candidaturas)"]} minWidth="48rem">
            {engine.sources.map((r) => (
              <tr key={r.source}>
                <td className={td}>{r.label}</td>
                <td className={td}>{r.opportunities}</td>
                <td className={td}>{r.applications}</td>
                <td className={td}>{r.responses}</td>
                <td className={td}>{r.interviews}</td>
                <td className={td}>{r.offers}</td>
                <td className={td}>
                  <RateCell r={r.conversion} />
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>Datos insuficientes</Empty>
        )}
      </Section>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        <Section title="Con y sin recomendación">
          <Table head={["", "Con recomendación", "Sin recomendación"]} minWidth="24rem">
            <tr>
              <td className={td}>Candidaturas</td>
              <td className={td}>{ref.withReferral.applications}</td>
              <td className={td}>{ref.withoutReferral.applications}</td>
            </tr>
            {(["response", "interview", "final", "offer"] as const).map((k) => (
              <tr key={k}>
                <td className={td}>{{ response: "Tasa de respuesta", interview: "Tasa de entrevista", final: "Tasa de final", offer: "Tasa de oferta" }[k]}</td>
                <td className={td}>
                  <RateCell r={ref.withReferral[k]} />
                </td>
                <td className={td}>
                  <RateCell r={ref.withoutReferral[k]} />
                </td>
              </tr>
            ))}
          </Table>
        </Section>
        <Section title="Tiempos">
          <Table head={["Tramo", "Media"]} minWidth="20rem">
            {[
              ["Candidatura → respuesta", time.appToResponse],
              ["Candidatura → entrevista", time.appToInterview],
              ["Entrevista → final", time.interviewToFinal],
              ["Final → oferta", time.finalToOffer],
              ["Duración total del proceso (cerrados)", time.totalProcess],
            ].map(([label, d]) => (
              <tr key={label as string}>
                <td className={td}>{label as string}</td>
                <td className={td}>
                  <span className="font-mono text-xs">{days(d as { avg: number | null; n: number })}</span>
                </td>
              </tr>
            ))}
          </Table>
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        <Section title="Días medios en cada estado">
          {time.daysInStage.length ? (
            <div className="panel space-y-2 p-4">
              {time.daysInStage.map((d) => (
                <BarRow key={d.status} label={d.label} value={d.avg ?? 0} max={Math.max(...time.daysInStage.map((x) => x.avg ?? 0), 1)} detail={`d · ${d.n} casos`} />
              ))}
            </div>
          ) : (
            <Empty>Datos insuficientes</Empty>
          )}
        </Section>
        <Section title="Conclusiones">
          {found.length ? (
            <ul className="panel divide-y divide-slate-200">
              {found.map((i) => (
                <li key={i.text} className="px-4 py-3">
                  <p className="text-sm text-carbon">{i.text}</p>
                  <p className="mt-0.5 text-xs text-slate-600">{i.evidence}</p>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Datos insuficientes</Empty>
          )}
        </Section>
      </div>
    </div>
  );
}
