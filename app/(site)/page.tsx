import Link from "next/link";
import { Diagram, DiagramPanel } from "@/components/content/Diagram";
import { PipelineFlow } from "@/components/content/PipelineFlow";
import { ProjectCard } from "@/components/content/ProjectCard";
import { RequestReceipt } from "@/components/content/RequestReceipt";
import { SectionHeader } from "@/components/content/SectionHeader";
import { StackLayers } from "@/components/content/StackLayers";
import { Timeline } from "@/components/content/Timeline";
import { Container } from "@/components/site/Container";
import {
  PILLARS,
  PIPELINE,
  REQUEST_PATH,
  SECURITY_CONTROLS,
  SYSTEM_DIAGRAM,
  SYSTEM_FACTS,
} from "@/lib/architecture";
import {
  getExperience,
  getNotes,
  getProfile,
  getProjects,
  getStack,
} from "@/lib/content";
import { formatDate } from "@/lib/format";
import { timed } from "@/lib/timing";

/** Anchos de las tarjetas de sistemas destacados: la primera ancha y después tamaños alternos. */
const SPANS = ["lg:col-span-2", "lg:col-span-1", "lg:col-span-3"];

export default async function HomePage() {
  const {
    value: [profile, projects, experience, stack, notes],
    ms: dataMs,
    at: renderedAt,
  } = await timed(() =>
    Promise.all([
      getProfile(),
      getProjects(),
      getExperience(),
      getStack(),
      getNotes(),
    ]),
  );

  const featured = projects.filter((p) => p.featured).slice(0, 3);
  const current = experience.filter((e) => !e.endDate);
  const firstYear = experience.length
    ? Math.min(...experience.map((e) => Number(e.startDate.slice(0, 4))))
    : null;
  const techCount = stack.reduce((n, l) => n + l.technologies.length, 0);

  return (
    <>
      {/* QUIÉN */}
      <section
        aria-labelledby="hero-title"
        className="relative border-b border-border-dark/15"
      >
        <div aria-hidden className="dot-grid dot-grid-fade absolute inset-0" />
        <Container className="relative grid gap-12 pb-16 pt-14 md:pt-20 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-8">
            <p className="label">
              {profile?.headline ?? "Perfil pendiente de configurar"}
            </p>
            <div className="mt-8 flex gap-8">
              <h1
                id="hero-title"
                className="hero-type font-semibold tracking-[-0.055em] text-carbon"
              >
                {PILLARS.map((p, i) => (
                  <span key={p.word} className="hero-row block">
                    {i === PILLARS.length - 1 ? (
                      <span className="mark">{p.word}</span>
                    ) : (
                      p.word
                    )}
                  </span>
                ))}
              </h1>
              <ul
                aria-label="Cómo se aplica en este sitio"
                className="hero-type hidden flex-col xl:flex"
              >
                {PILLARS.map((p) => (
                  <li
                    key={p.word}
                    className="hero-row flex items-end pb-[0.14em] font-mono text-xs text-slate-600"
                  >
                    <span className="whitespace-nowrap border-l-2 border-primary pl-3">
                      {p.how}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            {profile ? (
              <p className="mt-10 max-w-2xl text-lg leading-relaxed text-slate-700">
                {profile.summary}
              </p>
            ) : null}
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/projects"
                className="rounded-sm bg-primary px-5 py-2.5 text-sm font-semibold text-carbon ring-1 ring-carbon/10 transition-transform duration-150 hover:-translate-y-0.5"
              >
                Ver proyectos
              </Link>
              <Link
                href="/engineering"
                className="rounded-sm border border-carbon bg-white px-5 py-2.5 text-sm font-medium text-carbon transition-colors duration-150 hover:bg-carbon hover:text-white"
              >
                Cómo está construido
              </Link>
            </div>
          </div>
          <div className="lg:col-span-4 lg:pt-12">
            <RequestReceipt dataMs={dataMs} renderedAt={renderedAt} />
          </div>
        </Container>

        <Container className="relative">
          <div className="live-edge" />
          <dl className="grid grid-cols-2 md:grid-cols-4">
            {[
              [firstYear ? String(firstYear) : "—", "inicio de trayectoria"],
              [String(projects.length), "proyectos publicados"],
              [String(techCount), `tecnologías en ${stack.length} capas`],
            ].map(([v, l]) => (
              <div
                key={l}
                className="flex flex-col-reverse justify-end border-r border-border-dark/15 py-6 pr-4 md:px-6 md:first:pl-0"
              >
                <dt className="label mt-2">{l}</dt>
                <dd className="font-mono text-3xl tracking-[-0.04em] text-carbon md:text-4xl">
                  {v}
                </dd>
              </div>
            ))}
            <div className="flex flex-col-reverse justify-end py-6 pl-4 md:pl-6">
              <dt className="label mt-2">ahora</dt>
              <dd className="space-y-0.5 text-sm font-medium text-carbon">
                {current.length
                  ? current.map((e) => (
                      <span key={e.id} className="block">
                        {e.role}
                      </span>
                    ))
                  : "—"}
              </dd>
            </div>
          </dl>
        </Container>
      </section>

      {/* QUÉ CONSTRUYO */}
      <section aria-labelledby="systems" className="py-20">
        <Container>
          <SectionHeader
            id="systems"
            index="01"
            label="selected systems"
            title="Lo que construyo"
            href="/projects"
            hrefLabel="todos los proyectos"
          />
          {featured.length ? (
            <div className="grid gap-4 lg:grid-cols-3">
              {featured.map((p, i) => (
                <div key={p.slug} className={SPANS[i % 3]}>
                  <ProjectCard
                    project={p}
                    index={i}
                    size={i % 3 === 1 ? "md" : "lg"}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-700">Aún no hay proyectos publicados</p>
          )}
        </Container>
      </section>

      <section
        aria-labelledby="architecture"
        className="on-dark bg-carbon py-20 text-slate-300"
      >
        <Container>
          <SectionHeader
            id="architecture"
            index="02"
            label="architecture lab"
            title="Cómo lo construyo"
            href="/engineering"
            hrefLabel="arquitectura completa"
            dark
          />
          <div className="grid gap-8 lg:grid-cols-[1fr_16rem]">
            <DiagramPanel caption="en verde: el camino de esta visita · borde de vercel → render en servidor → caché → neon">
              <Diagram
                model={SYSTEM_DIAGRAM}
                title="Arquitectura de este sitio"
                highlight={REQUEST_PATH}
              />
            </DiagramPanel>
            <dl className="grid grid-cols-2 gap-px self-start overflow-hidden rounded-md bg-white/10 lg:grid-cols-1">
              {SYSTEM_FACTS.map((f) => (
                <div key={f.label} className="bg-carbon p-4">
                  <dd className="font-mono text-3xl text-primary">{f.value}</dd>
                  <dt className="mt-1 text-sm text-slate-300">{f.label}</dt>
                </div>
              ))}
            </dl>
          </div>
        </Container>
      </section>

      <section aria-labelledby="deploy" className="py-20">
        <Container>
          <SectionHeader
            id="deploy"
            index="03"
            label="delivery"
            title="Cómo lo despliego"
            href="/engineering#delivery"
            hrefLabel="pipeline"
          />
          <PipelineFlow stages={PIPELINE} />
          <p className="mt-5 font-mono text-xs text-slate-600">
            trigger: push a main y pull requests · runner: github actions ·
            destino: vercel + neon · el build se hace en ci y nada llega a
            producción sin pasar el pipeline
          </p>
        </Container>
      </section>

      {/* CÓMO LO PROTEJO */}
      <section aria-labelledby="security" className="pb-20">
        <Container>
          <SectionHeader
            id="security"
            index="04"
            label="security"
            title="Cómo lo protejo"
            href="/engineering#security"
            hrefLabel={`los ${SECURITY_CONTROLS.length} controles`}
          />
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {SECURITY_CONTROLS.slice(0, 6).map((c, i) => (
              <li
                key={c.area}
                className="flex flex-col rounded-md border border-border-dark/15 bg-white p-5"
              >
                <div className="flex items-baseline justify-between">
                  <p className="text-lg font-semibold tracking-[-0.02em] text-carbon">
                    {c.area}
                  </p>
                  <span className="font-mono text-xs text-slate-600">
                    c/{String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <p className="mt-2 flex-1 text-[0.95rem] leading-relaxed text-slate-700">
                  {c.control}
                </p>
                <p className="mt-4 border-t border-dashed border-border-dark/25 pt-3 font-mono text-xs text-slate-600">
                  {c.evidence}
                </p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* CÓMO PIENSO */}
      <section aria-labelledby="notes" className="pb-20">
        <Container>
          <SectionHeader
            id="notes"
            index="05"
            label="technical notes"
            title="Cómo pienso"
            href="/notes"
            hrefLabel="todas las notas"
          />
          {notes.length ? (
            <ul className="divide-y divide-border-dark/15 border-b border-border-dark/15">
              {notes.slice(0, 4).map((n) => (
                <li key={n.slug}>
                  <Link
                    href={`/notes/${n.slug}`}
                    className="group grid gap-1 py-5 sm:grid-cols-[9rem_1fr_auto] sm:items-baseline sm:gap-6"
                  >
                    <span className="font-mono text-xs text-slate-600">
                      {formatDate(n.publishedAt)}
                    </span>
                    <span className="text-xl font-medium tracking-[-0.02em] text-carbon group-hover:underline group-hover:decoration-primary group-hover:decoration-2 group-hover:underline-offset-4">
                      {n.title}
                    </span>
                    <span
                      aria-hidden
                      className="hidden font-mono text-xs text-slate-600 sm:block"
                    >
                      leer →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="relative overflow-hidden rounded-md border border-dashed border-border-dark/30 bg-white px-6 py-10">
              <div
                aria-hidden
                className="dot-grid absolute inset-0 opacity-60"
              />
              <p className="relative max-w-lg text-slate-700">
                Todavía no hay notas publicadas. Troubleshooting, decisiones y
                lo aprendido construyendo sistemas: se escriben en Markdown
                desde el panel y aparecen aquí al publicarlas.
              </p>
            </div>
          )}
        </Container>
      </section>

      {/* STACK */}
      <section aria-labelledby="stack" className="pb-20">
        <Container>
          <SectionHeader
            id="stack"
            index="06"
            label="stack"
            title="Tecnologías por capa"
            href="/stack"
            hrefLabel="stack completo"
          />
          <StackLayers layers={stack} />
        </Container>
      </section>

      {/* EXPERIENCIA */}
      <section aria-labelledby="experience">
        <Container>
          <SectionHeader
            id="experience"
            index="07"
            label="experience"
            title="Trayectoria"
            href="/experience"
            hrefLabel="experiencia y formación"
          />
          <Timeline items={experience} />
        </Container>
      </section>
    </>
  );
}
