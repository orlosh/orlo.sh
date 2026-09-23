import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Diagram, DiagramPanel } from "@/components/content/Diagram";
import { Markdown } from "@/components/content/Markdown";
import { ProjectStatusPill } from "@/components/content/StatusPill";
import { TechList } from "@/components/content/TechList";
import { Container } from "@/components/site/Container";
import { getProject } from "@/lib/content";
import {
  CASE_STUDY_SECTIONS,
  type CaseStudySection,
} from "@/lib/content/types";
import { slugSchema } from "@/lib/validation/content";

const SECTION_TITLES: Record<CaseStudySection, string> = {
  overview: "Overview",
  architecture: "Arquitectura",
  infrastructure: "Infraestructura",
  deployment: "Despliegue",
  security: "Seguridad",
  challenges: "Retos",
  decisions: "Decisiones",
  results: "Resultado",
  lessons: "Lecciones aprendidas",
};

type Props = { params: Promise<{ slug: string }> };

async function load(params: Props["params"]) {
  const { slug } = await params;
  // Rechaza slugs malformados antes de que lleguen a la caché o a la base de datos.
  if (!slugSchema.safeParse(slug).success) return null;
  return getProject(slug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const project = await load(params);
  if (!project) return {};
  return {
    title: project.title,
    description: project.summary,
    alternates: { canonical: `/projects/${project.slug}` },
    openGraph: {
      type: "article",
      title: project.title,
      description: project.summary,
    },
  };
}

export default async function ProjectPage({ params }: Props) {
  const project = await load(params);
  if (!project) notFound();

  const sections = CASE_STUDY_SECTIONS.filter((key) =>
    project.sections[key]?.trim(),
  );

  return (
    <article>
      <div className="relative border-b border-border-dark/15">
        <div aria-hidden className="dot-grid dot-grid-fade absolute inset-0" />
        <Container className="relative pb-12 pt-12 md:pt-16">
          <nav aria-label="Migas" className="font-mono text-xs text-slate-600">
            <Link href="/projects" className="link">
              proyectos
            </Link>{" "}
            / {project.slug}
          </nav>
          <h1 className="mt-8 max-w-4xl text-[clamp(2.75rem,7vw,5.5rem)] font-semibold leading-[0.98] tracking-[-0.045em] text-carbon">
            {project.title}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-700">
            {project.summary}
          </p>

          {/* Tarjeta de señales: los datos que un lector necesita antes de decidir seguir leyendo. */}
          <dl className="mt-10 grid overflow-hidden rounded-md border border-carbon bg-white sm:grid-cols-2 lg:grid-cols-[auto_1fr_auto]">
            <div className="border-b border-border-dark/15 p-5 sm:border-r lg:border-b-0">
              <dt className="label">Estado</dt>
              <dd className="mt-2">
                {project.status ? (
                  <ProjectStatusPill status={project.status} />
                ) : (
                  <span className="text-slate-600">sin indicar</span>
                )}
              </dd>
            </div>
            <div className="border-b border-border-dark/15 p-5 lg:border-b-0 lg:border-r">
              <dt className="label">Tecnología</dt>
              <dd className="mt-2">
                {project.technologies.length ? (
                  <TechList items={project.technologies} />
                ) : (
                  <span className="text-slate-600">sin documentar</span>
                )}
              </dd>
            </div>
            <div className="p-5 sm:col-span-2 lg:col-span-1">
              <dt className="label">Enlaces</dt>
              <dd className="mt-2 flex flex-col gap-1 font-mono text-sm">
                {project.repositoryUrl ? (
                  <a
                    href={project.repositoryUrl}
                    className="link w-fit"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    repositorio ↗
                  </a>
                ) : null}
                {project.liveUrl ? (
                  <a
                    href={project.liveUrl}
                    className="link w-fit"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    en producción ↗
                  </a>
                ) : null}
                {!project.repositoryUrl && !project.liveUrl ? (
                  <span className="text-slate-600">no publicado</span>
                ) : null}
              </dd>
            </div>
          </dl>
        </Container>
      </div>

      <Container className="grid gap-12 py-14 lg:grid-cols-[13rem_1fr]">
        {sections.length > 1 ? (
          <nav
            aria-label="Secciones del caso de estudio"
            className="hidden lg:block"
          >
            <ol className="sticky top-24 space-y-1 border-l border-border-dark/20 font-mono text-xs">
              {sections.map((key, i) => (
                <li key={key}>
                  <a
                    href={`#${key}`}
                    className="-ml-px block border-l-2 border-transparent py-1 pl-3 text-slate-600 hover:border-primary hover:text-carbon"
                  >
                    {String(i + 1).padStart(2, "0")} {SECTION_TITLES[key]}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        ) : (
          <div className="hidden lg:block" />
        )}

        <div className="min-w-0 space-y-16">
          {sections.map((key, i) => (
            <section
              key={key}
              id={key}
              aria-labelledby={`${key}-h`}
              className="scroll-mt-24"
            >
              <div className="border-t border-carbon pt-4">
                <p className="label">
                  <span className="text-carbon">
                    {String(i + 1).padStart(2, "0")}
                  </span>{" "}
                  / {key}
                </p>
                <h2
                  id={`${key}-h`}
                  className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-carbon"
                >
                  {SECTION_TITLES[key]}
                </h2>
              </div>
              {key === "architecture" && project.diagram ? (
                <div className="mt-6">
                  <DiagramPanel>
                    <Diagram
                      model={project.diagram}
                      title={`Arquitectura de ${project.title}`}
                    />
                  </DiagramPanel>
                </div>
              ) : null}
              <div className="mt-6 max-w-[68ch]">
                <Markdown>{project.sections[key] as string}</Markdown>
              </div>
            </section>
          ))}

          {project.images.length ? (
            <section aria-labelledby="images-h">
              <h2
                id="images-h"
                className="border-t border-carbon pt-4 text-3xl font-semibold tracking-[-0.03em] text-carbon"
              >
                Capturas
              </h2>
              <div className="mt-6 space-y-8">
                {project.images.map((img) => (
                  <figure key={img.url}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={img.alt}
                      loading="lazy"
                      className="rounded-md border border-border-dark/15"
                    />
                    {img.caption ? (
                      <figcaption className="mt-2 text-sm text-slate-600">
                        {img.caption}
                      </figcaption>
                    ) : null}
                  </figure>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </Container>
    </article>
  );
}
