import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { TextArea } from "@/components/admin/fields";
import { Empty, PageHeader, Section, Table, td } from "@/components/admin/job-search/ui";
import { CoachPanel } from "@/components/admin/job-search/ai";
import { coachAction } from "@/lib/ai/actions";
import { getAiSettings } from "@/lib/ai/store";
import { saveWeeklyReviewAction } from "@/lib/job-search/actions";
import { bottleneck, insights, pct, WEEK_METRIC_LABEL, weekMetrics, type WeekMetrics } from "@/lib/job-search/analytics";
import { addDays, formatDay, weekStart } from "@/lib/job-search/dates";
import { scoreValues } from "@/lib/job-search/engine";
import { alerts, dailyPlan } from "@/lib/job-search/plan";
import { listWeeklyReviews } from "@/lib/job-search/repository";
import { db, getWorkspace } from "@/lib/job-search/server";

export const metadata = { title: "Revisión semanal" };

export default async function WeeklyReviewPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const sp = await searchParams;
  const [{ snapshot: s, engine }, saved, ai] = await Promise.all([getWorkspace(), listWeeklyReviews(db), getAiSettings(db)]);
  const current = weekStart(s.today);
  const week = sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? weekStart(sp.week) : current;
  const prevWeek = addDays(week, -7);
  const m = weekMetrics(s, week);
  const p = weekMetrics(s, prevWeek);
  const neck = bottleneck(s, engine.facts);
  const found = insights(s, engine.facts);
  const alertCount = alerts(s).filter((a) => a.level === "critical").length;
  const existing = saved.find((r) => r.weekStart === week);
  const keys = Object.keys(WEEK_METRIC_LABEL) as (keyof WeekMetrics)[];

  // Acciones recomendadas: derivadas del bottleneck, del volumen frente al objetivo y del plan real.
  const actions: string[] = [];
  if (neck) actions.push(`${neck.stage}: ${neck.action}`);
  if (m.applications < s.goal.weeklyApplicationTarget && week === current) {
    actions.push(`Faltan ${s.goal.weeklyApplicationTarget - m.applications} candidaturas para el objetivo semanal (${s.goal.weeklyApplicationTarget}).`);
  }
  if (m.referralsRequested === 0) actions.push("No has pedido ninguna recomendación esta semana: busca 3 contactos en empresas de categoría A.");
  if (alertCount) actions.push(`Resuelve ${alertCount} alertas urgentes (seguimientos vencidos, plazos, entrevistas).`);
  for (const item of dailyPlan(s, scoreValues(engine), 3)) actions.push(`${item.title} — ${item.reason}`);

  const best = engine.sources.filter((r) => r.applications > 0).slice(0, 3);

  return (
    <div className="space-y-10">
      <PageHeader title="Revisión semanal" description={`Semana del ${formatDay(week)} al ${formatDay(addDays(week, 6))}.`} />
      <nav aria-label="Semana" className="flex items-center gap-2">
        <Link href={`/admin/job-search/review?week=${prevWeek}`} className="btn-ghost">
          ← Semana anterior
        </Link>
        {week !== current ? (
          <>
            <Link href={`/admin/job-search/review?week=${addDays(week, 7)}`} className="btn-ghost">
              Semana siguiente →
            </Link>
            <Link href="/admin/job-search/review" className="btn-ghost">
              Esta semana
            </Link>
          </>
        ) : null}
      </nav>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        <Section title="Resumen de la semana">
          <Table head={["Métrica", "Esta semana", "Anterior", "Cambio"]} minWidth="24rem">
            {keys.map((k) => {
              const d = m[k] - p[k];
              return (
                <tr key={k}>
                  <td className={td}>{WEEK_METRIC_LABEL[k]}</td>
                  <td className={`${td} font-mono text-carbon`}>{m[k]}</td>
                  <td className={`${td} font-mono`}>{p[k]}</td>
                  <td className={`${td} font-mono text-xs`}>{d === 0 ? "=" : d > 0 ? `+${d}` : d}</td>
                </tr>
              );
            })}
          </Table>
        </Section>
        <div className="space-y-10">
          <Section title="Mejores canales">
            {best.length ? (
              <ul className="panel divide-y divide-slate-200">
                {best.map((r) => (
                  <li key={r.source} className="flex justify-between px-4 py-2.5 text-sm">
                    <span className="text-carbon">{r.label}</span>
                    <span className="font-mono text-xs text-slate-600">
                      {r.interviews} entrevistas / {r.applications} candidaturas ({pct(r.conversion)})
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Datos insuficientes</Empty>
            )}
          </Section>
          <Section title="Bottleneck">
            {neck ? (
              <div className="panel p-4 text-sm">
                <p className="font-medium text-carbon">{neck.stage}</p>
                <p className="mt-1 text-slate-600">{neck.reason}</p>
              </div>
            ) : (
              <Empty>Datos insuficientes</Empty>
            )}
          </Section>
          <Section title="Conclusiones">
            {found.length ? (
              <ul className="panel divide-y divide-slate-200">
                {found.map((i) => (
                  <li key={i.text} className="px-4 py-2.5">
                    <p className="text-sm text-carbon">{i.text}</p>
                    <p className="text-xs text-slate-600">{i.evidence}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Datos insuficientes</Empty>
            )}
          </Section>
        </div>
      </div>

      {ai.enabled ? (
        <Section title="Coach (IA)">
          <CoachPanel action={coachAction} weekStart={week} />
        </Section>
      ) : null}

      <Section title="Acciones recomendadas">
        <ol className="panel list-decimal space-y-2 py-4 pl-10 pr-4 text-sm text-slate-800">
          {actions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ol>
      </Section>

      <Section title="Reflexión">
        <div className="panel p-4">
          <ActionForm action={saveWeeklyReviewAction} hidden={{ weekStart: week }} submitLabel={existing ? "Actualizar revisión" : "Guardar revisión"}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <TextArea name="wins" label="Qué funcionó" rows={4} defaultValue={existing?.wins} />
              <TextArea name="blockers" label="Qué bloqueó" rows={4} defaultValue={existing?.blockers} />
              <TextArea name="focus" label="Foco de la próxima semana" rows={4} defaultValue={existing?.focus} />
            </div>
            <p className="text-xs text-slate-600">Al guardar se archiva también una instantánea de las métricas de esta semana.</p>
          </ActionForm>
        </div>
      </Section>

      {saved.length ? (
        <Section title="Revisiones guardadas">
          <ul className="panel divide-y divide-slate-200">
            {saved.map((r) => {
              const mm = r.metrics as Partial<WeekMetrics> & { bottleneck?: string | null };
              return (
                <li key={r.id}>
                  <Link href={`/admin/job-search/review?week=${r.weekStart}`} className="flex flex-wrap justify-between gap-2 px-4 py-2.5 hover:bg-slate-50">
                    <span className="text-sm text-carbon">Semana del {formatDay(r.weekStart)}</span>
                    <span className="font-mono text-xs text-slate-600">
                      {mm.applications ?? 0} apps · {mm.interviews ?? 0} entrevistas · {mm.offers ?? 0} ofertas{mm.bottleneck ? ` · bottleneck ${mm.bottleneck}` : ""}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
