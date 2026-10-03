import { BarRow, Empty, PageHeader, Section, Table, td } from "@/components/admin/job-search/ui";
import { conversions, FUNNEL_STEPS, funnel, insights, MIN_SAMPLE, pct, referralAnalytics, type Rate, timeAnalytics } from "@/lib/job-search/analytics";
import { getWorkspace } from "@/lib/job-search/server";

export const metadata = { title: "Analytics" };

/** Una tasa con su muestra; por debajo del mínimo se marca como insuficiente en vez de ocultarla. */
function RateCell({ r }: { r: Rate }) {
  return (
    <span className="font-mono text-xs">
      <span className="text-carbon">{pct(r)}</span> <span className="text-slate-500">({r.num}/{r.den})</span>
      {r.den > 0 && r.den < MIN_SAMPLE ? <span className="ml-1 text-slate-500">· muestra pequeña</span> : null}
    </span>
  );
}

const days = (d: { avg: number | null; n: number }) => (d.avg === null ? "Insufficient data" : `${d.avg} d (n=${d.n})`);

export default async function AnalyticsPage() {
  const { snapshot: s, engine } = await getWorkspace();
  const f = funnel(engine.facts);
  const conv = conversions(engine.facts);
  const ref = referralAnalytics(engine.facts);
  const time = timeAnalytics(s, engine.facts);
  const found = insights(s, engine.facts);

  return (
    <div className="space-y-12">
      <PageHeader title="Analytics" description={`Calculado sobre el historial real de estados. Las tasas con menos de ${MIN_SAMPLE} casos se marcan como muestra pequeña.`} />

      <div className="grid gap-10 lg:grid-cols-2">
        <Section title="Funnel">
          <div className="panel space-y-2 p-4">
            {FUNNEL_STEPS.map(([key, label], i) => {
              const prev = i ? f[FUNNEL_STEPS[i - 1][0]] : null;
              return <BarRow key={key} label={label} value={f[key]} max={f.opportunities} detail={prev !== null ? pct(prev ? f[key] / prev : null) : undefined} />;
            })}
          </div>
          <p className="text-xs text-slate-600">
            Response = la empresa contestó tras aplicar (screen, entrevista o rechazo). Interview = llegó a Interview o tuvo una entrevista que no era el screen.
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

      <Section title="Source performance">
        {engine.sources.length ? (
          <Table head={["Source", "Opportunities", "Applications", "Responses", "Interviews", "Offers", "Conversion (interview / application)"]} minWidth="48rem">
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
          <Empty>Insufficient data</Empty>
        )}
      </Section>

      <div className="grid gap-10 lg:grid-cols-2">
        <Section title="Referral analytics">
          <Table head={["", "Con referral", "Sin referral"]} minWidth="24rem">
            <tr>
              <td className={td}>Applications</td>
              <td className={td}>{ref.withReferral.applications}</td>
              <td className={td}>{ref.withoutReferral.applications}</td>
            </tr>
            {(["response", "interview", "final", "offer"] as const).map((k) => (
              <tr key={k}>
                <td className={td}>{{ response: "Response rate", interview: "Interview rate", final: "Final rate", offer: "Offer rate" }[k]}</td>
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
        <Section title="Time analytics">
          <Table head={["Tramo", "Media"]} minWidth="20rem">
            {[
              ["Application → Response", time.appToResponse],
              ["Application → Interview", time.appToInterview],
              ["Interview → Final", time.interviewToFinal],
              ["Final → Offer", time.finalToOffer],
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

      <div className="grid gap-10 lg:grid-cols-2">
        <Section title="Average days in stage">
          {time.daysInStage.length ? (
            <div className="panel space-y-2 p-4">
              {time.daysInStage.map((d) => (
                <BarRow key={d.status} label={d.label} value={d.avg ?? 0} max={Math.max(...time.daysInStage.map((x) => x.avg ?? 0), 1)} detail={`d · n=${d.n}`} />
              ))}
            </div>
          ) : (
            <Empty>Insufficient data</Empty>
          )}
        </Section>
        <Section title="Insights">
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
            <Empty>Insufficient data</Empty>
          )}
        </Section>
      </div>
    </div>
  );
}
