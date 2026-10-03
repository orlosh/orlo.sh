import Link from "next/link";
import { ActionButton } from "@/components/admin/job-search/ActionButton";
import { BarRow, Empty, PriorityTag, Section, StatusBadge } from "@/components/admin/job-search/ui";
import { setTaskDoneAction } from "@/lib/job-search/actions";
import { bottleneck, FUNNEL_STEPS, funnel, pct } from "@/lib/job-search/analytics";
import { dateIn, formatDateTime, relativeDay } from "@/lib/job-search/dates";
import { scoreValues } from "@/lib/job-search/engine";
import { INTERVIEW_KIND_LABEL } from "@/lib/job-search/labels";
import { oppLabel } from "@/lib/job-search/model";
import { type Alert, alerts, dailyPlan, dashboardKpis, oppHref, PLAN_CATEGORIES, type PlanItem } from "@/lib/job-search/plan";
import { getGoal } from "@/lib/job-search/repository";
import { db, getWorkspace } from "@/lib/job-search/server";
import { isClosed } from "@/lib/job-search/stages";

export const metadata = { title: "Hoy" };

const B = "/admin/job-search";
const more = "font-mono text-xs text-slate-600 hover:text-carbon";

/** Agrupa el plan por bloque manteniendo el orden de prioridad. */
function groupPlan(plan: PlanItem[]) {
  const groups: { category: number; items: PlanItem[] }[] = [];
  for (const item of plan) {
    const last = groups.at(-1);
    if (last?.category === item.category) last.items.push(item);
    else groups.push({ category: item.category, items: [item] });
  }
  return groups;
}

const LEVEL_DOT: Record<Alert["level"], string> = { critical: "bg-carbon", warning: "bg-slate-400", info: "bg-slate-200" };

function AlertRow({ a }: { a: Alert }) {
  return (
    <li>
      <Link href={a.href} className="flex gap-3 px-4 py-2.5 hover:bg-slate-50">
        <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${LEVEL_DOT[a.level]}`} />
        <span className="min-w-0">
          <span className="block truncate text-sm text-carbon">{a.title}</span>
          <span className="block text-xs text-slate-600">
            {a.kind}
            {a.level === "critical" ? <span className="font-medium text-carbon"> · urgente</span> : null} · {a.detail}
          </span>
        </span>
      </Link>
    </li>
  );
}

export default async function JobSearchToday() {
  const [{ snapshot: s, engine }, { row: goalRow }] = await Promise.all([getWorkspace(), getGoal(db)]);
  const kpi = dashboardKpis(s);
  const scores = scoreValues(engine);
  const plan = dailyPlan(s, scores);
  const [next, ...rest] = plan;
  const alertList = alerts(s);
  const neck = bottleneck(s, engine.facts);
  const f = funnel(engine.facts);
  const bestSource = engine.sources.find((r) => r.applications >= 5 && r.interviews > 0) ?? null;
  const tz = s.goal.timezone;
  const progress = Math.min(100, (kpi.day / kpi.duration) * 100);

  const priorities = s.opportunities
    .filter((o) => !isClosed(o.status) && o.status !== "discovered")
    .sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))
    .slice(0, 5);
  const upcoming = s.interviews
    .filter((i) => i.outcome === "pending" && i.scheduledAt && i.scheduledAt >= new Date(s.now.getTime() - 3_600_000))
    .sort((a, b) => a.scheduledAt!.getTime() - b.scheduledAt!.getTime())
    .slice(0, 3);
  const opps = new Map(s.opportunities.map((o) => [o.id, o]));
  const toContact = s.contacts
    .filter((c) => c.status === "to_contact" || (c.nextFollowUpAt && c.nextFollowUpAt <= s.today && c.status !== "closed"))
    .slice(0, 4);

  const kpis: [string, number, string, string?][] = [
    ["Candidaturas activas", kpi.activeApplications, `${B}/pipeline`],
    ["Entrevistando", kpi.activeInterviews, `${B}/interviews`, kpi.upcomingInterviews ? `${kpi.upcomingInterviews} programadas` : undefined],
    ["En fase final", kpi.finals, `${B}/opportunities?status=final_interview`],
    ["Ofertas", kpi.offers, `${B}/opportunities?status=offer`],
    ["Seguimientos pendientes", kpi.followUpsDue, `${B}/tasks?view=overdue`],
    ["Tareas para hoy", kpi.tasksToday, `${B}/tasks`],
  ];

  return (
    <div className="space-y-8">
      {/* Cabecera: en qué día del objetivo estás y qué toca ahora. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="panel p-5">
          <p className="label">Objetivo de {kpi.duration} días</p>
          <p className="mt-2 text-4xl font-semibold tracking-tight text-carbon">
            Día {kpi.day}
            <span className="text-xl font-normal text-slate-500"> de {kpi.duration}</span>
          </p>
          <div className="mt-3 h-1.5 rounded-full bg-slate-100" role="meter" aria-valuemin={0} aria-valuemax={kpi.duration} aria-valuenow={kpi.day} aria-label="Progreso del objetivo">
            <div className="h-1.5 rounded-full bg-carbon" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate-600">
            {kpi.overrun ? `Objetivo superado en ${kpi.overrun} días` : `Quedan ${kpi.remaining} días`}
            {!goalRow ? (
              <>
                {" · "}
                <Link href={`${B}/settings`} className="link">
                  fijar inicio
                </Link>
              </>
            ) : null}
          </p>
        </div>

        <div className="panel flex flex-col justify-between gap-4 border-carbon p-5 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <p className="label">Lo siguiente</p>
            {next ? (
              <>
                <Link href={next.href} className="mt-2 block text-lg font-medium text-carbon hover:underline">
                  {next.title}
                </Link>
                <p className="mt-1 text-sm text-slate-600">{next.reason}</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-600">Nada pendiente. Añade oportunidades a la bandeja para alimentar la búsqueda.</p>
            )}
          </div>
          {next ? (
            <div className="flex shrink-0 gap-2">
              {next.taskId ? <ActionButton action={setTaskDoneAction} hidden={{ id: next.taskId }} label="Hecho" variant="primary" /> : null}
              <Link href={next.href} className={next.taskId ? "btn-ghost" : "btn"}>
                Abrir
              </Link>
            </div>
          ) : (
            <Link href={`${B}/inbox`} className="btn shrink-0">
              Ir a la bandeja
            </Link>
          )}
        </div>
      </div>

      {/* Franja de KPIs: el hueco de 1px sobre fondo slate dibuja los separadores en cualquier rejilla. */}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map(([label, value, href, hint]) => (
          <Link key={label} href={href} className="block bg-white px-4 py-3 transition-colors hover:bg-slate-50">
            <dt className="text-xs text-slate-600">{label}</dt>
            <dd className="mt-1 font-mono text-2xl text-carbon">{value}</dd>
            {hint ? <dd className="text-[0.7rem] text-slate-500">{hint}</dd> : null}
          </Link>
        ))}
      </dl>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Section title="Plan de hoy" action={<Link href={`${B}/tasks`} className={more}>todas las tareas →</Link>}>
          {rest.length ? (
            <div className="panel divide-y divide-slate-200">
              {groupPlan(rest).map((g) => (
                <div key={g.category} className="px-4 py-3">
                  <h3 className="font-mono text-[0.7rem] uppercase tracking-wide text-slate-500">{PLAN_CATEGORIES[g.category]}</h3>
                  <ul className="mt-1.5 space-y-2">
                    {g.items.map((item) => (
                      <li key={item.key} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link href={item.href} className="text-sm text-carbon hover:underline">
                            {item.title}
                          </Link>
                          <p className="text-xs text-slate-600">{item.reason}</p>
                        </div>
                        {item.taskId ? <ActionButton action={setTaskDoneAction} hidden={{ id: item.taskId }} label="Hecho" variant="link" /> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <Empty>{next ? "Solo queda lo de arriba." : "Sin prioridades para hoy."}</Empty>
          )}
        </Section>

        <div className="space-y-8">
          <Section title="Cuello de botella">
            <div className="panel p-4">
              {neck ? (
                <>
                  <p className="flex items-center gap-2 font-medium text-carbon">
                    <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
                    {neck.stage}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{neck.reason}</p>
                  <p className="mt-2 text-sm text-slate-800">{neck.action}</p>
                </>
              ) : (
                <p className="text-sm text-slate-600">Datos insuficientes, o ninguna fase por debajo de lo esperable.</p>
              )}
            </div>
          </Section>

          <Section title={`Alertas · ${alertList.length}`}>
            {alertList.length ? (
              <div className="panel">
                <ul className="divide-y divide-slate-200">
                  {alertList.slice(0, 5).map((a) => (
                    <AlertRow key={a.key} a={a} />
                  ))}
                </ul>
                {alertList.length > 5 ? (
                  <details className="border-t border-slate-200">
                    <summary className="cursor-pointer px-4 py-2 text-xs text-slate-600 hover:text-carbon">Ver {alertList.length - 5} más</summary>
                    <ul className="divide-y divide-slate-200 border-t border-slate-200">
                      {alertList.slice(5).map((a) => (
                        <AlertRow key={a.key} a={a} />
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            ) : (
              <Empty>Todo al día.</Empty>
            )}
          </Section>

          <Section title="Próximas entrevistas" action={<Link href={`${B}/interviews`} className={more}>agenda →</Link>}>
            {upcoming.length ? (
              <ul className="panel divide-y divide-slate-200">
                {upcoming.map((i) => {
                  const o = opps.get(i.opportunityId);
                  return (
                    <li key={i.id}>
                      <Link href={`${B}/interviews/${i.id}`} className="block px-4 py-2.5 hover:bg-slate-50">
                        <span className="block truncate text-sm text-carbon">{o ? oppLabel(o) : "—"}</span>
                        <span className="block text-xs text-slate-600">
                          {INTERVIEW_KIND_LABEL[i.kind]} · {formatDateTime(i.scheduledAt, tz)} ({relativeDay(dateIn(i.scheduledAt!, tz), s.today)}) · preparación {i.prepDone}/{i.prepTotal}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty>Sin entrevistas programadas.</Empty>
            )}
          </Section>

          <Section title="A quién escribir" action={<Link href={`${B}/networking`} className={more}>contactos →</Link>}>
            {toContact.length ? (
              <ul className="panel divide-y divide-slate-200">
                {toContact.map((c) => (
                  <li key={c.id}>
                    <Link href={`${B}/contacts/${c.id}`} className="block px-4 py-2.5 hover:bg-slate-50">
                      <span className="block text-sm text-carbon">
                        {c.name}
                        {c.companyName ? <span className="text-slate-500"> · {c.companyName}</span> : null}
                      </span>
                      <span className="block text-xs text-slate-600">
                        {c.status === "to_contact" ? "Primer mensaje pendiente" : `Seguimiento ${relativeDay(c.nextFollowUpAt, s.today)}`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nadie pendiente.</Empty>
            )}
          </Section>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Section title="Oportunidades a priorizar" action={<Link href={`${B}/opportunities`} className={more}>lista →</Link>}>
          {priorities.length ? (
            <ul className="panel divide-y divide-slate-200">
              {priorities.map((o) => (
                <li key={o.id}>
                  <Link href={oppHref(o.id)} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-carbon">{oppLabel(o)}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-2">
                        <StatusBadge status={o.status} />
                        <PriorityTag priority={o.priority} />
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-mono text-lg text-carbon">{scores.get(o.id)}</span>
                      <span className="block text-[0.7rem] text-slate-500">puntuación</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Aún no hay oportunidades cualificadas.</Empty>
          )}
        </Section>

        <Section title="Embudo" action={<Link href={`${B}/analytics`} className={more}>análisis →</Link>}>
          <div className="panel space-y-2 p-4">
            {FUNNEL_STEPS.map(([key, label], i) => {
              const prev = i ? f[FUNNEL_STEPS[i - 1][0]] : null;
              return <BarRow key={key} label={label} value={f[key]} max={f.opportunities} detail={prev !== null ? pct(prev ? f[key] / prev : null) : undefined} />;
            })}
            <p className="pt-2 text-xs text-slate-600">
              Mejor canal:{" "}
              {bestSource ? (
                <span className="text-carbon">
                  {bestSource.label} · {bestSource.interviews} de {bestSource.applications} candidaturas con entrevista ({pct(bestSource.conversion)})
                </span>
              ) : (
                "datos insuficientes (mínimo 5 candidaturas por fuente)"
              )}
            </p>
          </div>
        </Section>
      </div>
    </div>
  );
}
