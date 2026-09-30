import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Diagram } from "@/components/content/Diagram";
import { Markdown } from "@/components/content/Markdown";
import { PageHeader } from "@/components/content/PageHeader";
import { ProjectStatusMark } from "@/components/content/StatusPill";
import { Container } from "@/components/site/Container";
import { getProject } from "@/lib/content";
import { CASE_STUDY_SECTIONS, type CaseStudySection } from "@/lib/content/types";
import { slugSchema } from "@/lib/validation/content";

const SECTION_TITLES: Record<CaseStudySection, string> = {
  overview: "Resumen",
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
    openGraph: { type: "article", title: project.title, description: project.summary },
  };
}

export default async function ProjectPage({ params }: Props) {
  const project = await load(params);
  if (!project) notFound();

  const sections = CASE_STUDY_SECTIONS.filter((key) => project.sections[key]?.trim());
  const facts: [string, React.ReactNode][] = [
    ["Estado", project.status ? <ProjectStatusMark status={project.status} /> : "Sin indicar"],
    ["Tecnología", project.technologies.length ? project.technologies.map((t) => t.name).join(", ") : "Sin documentar"],
  ];

  return (
    <article>
      <PageHeader
        label={
          <Link href="/projects" className="link">
            ← Proyectos
          </Link>
        }
        title={project.title}
        intro={project.summary}
      >
        <dl className="mt-8 grid gap-6 border border-primary/15 bg-carbon p-5 text-sm sm:grid-cols-3">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-slate-400">{k}</dt>
              <dd className="mt-1 text-slate-200">{v}</dd>
            </div>
          ))}
          <div>
            <dt className="text-slate-400">Enlaces</dt>
            <dd className="mt-1 flex flex-col items-start gap-1">
              {project.repositoryUrl ? (
                <a href={project.repositoryUrl} className="link" target="_blank" rel="noopener noreferrer">
                  Repositorio ↗
                </a>
              ) : null}
              {project.liveUrl ? (
                <a href={project.liveUrl} className="link" target="_blank" rel="noopener noreferrer">
                  En producción ↗
                </a>
              ) : null}
              {!project.repositoryUrl && !project.liveUrl ? <span className="text-slate-200">No publicado</span> : null}
            </dd>
          </div>
        </dl>
      </PageHeader>

      <Container className="grid gap-10 py-6 md:grid-cols-12">
        {sections.length > 1 ? (
          <nav aria-label="Secciones del caso de estudio" className="hidden md:col-span-3 md:block">
            <ol className="sticky top-8 space-y-2 text-sm">
              {sections.map((key) => (
                <li key={key}>
                  <a href={`#${key}`} className="text-slate-400 hover:text-white">
                    {SECTION_TITLES[key]}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}

        <div className="min-w-0 md:col-span-9 md:col-start-4">
          {sections.map((key) => (
            <section
              key={key}
              id={key}
              aria-labelledby={`${key}-h`}
              className="scroll-mt-8 border-t border-white/10 py-10 first:border-t-0 first:pt-0"
            >
              <h2 id={`${key}-h`} className="text-2xl font-bold tracking-tight text-white">
                {SECTION_TITLES[key]}
              </h2>
              {key === "architecture" && project.diagram ? (
                <div className="mt-6 border border-primary/15 bg-carbon p-4">
                  <Diagram model={project.diagram} title={`Arquitectura de ${project.title}`} />
                </div>
              ) : null}
              <div className="mt-6 max-w-[68ch]">
                <Markdown>{project.sections[key] as string}</Markdown>
              </div>
            </section>
          ))}

          {project.images.length ? (
            <section aria-labelledby="images-h" className="border-t border-white/10 py-10">
              <h2 id="images-h" className="text-2xl font-bold tracking-tight text-white">
                Capturas
              </h2>
              <div className="mt-8 space-y-10">
                {project.images.map((img) => (
                  <figure key={img.url}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={img.alt} loading="lazy" className="rounded-md border border-white/10" />
                    {img.caption ? <figcaption className="mt-3 text-sm text-slate-400">{img.caption}</figcaption> : null}
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
