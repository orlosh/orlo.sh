import Link from "next/link";
import { Block } from "@/components/content/Block";
import { Diagram } from "@/components/content/Diagram";
import { ProjectCard } from "@/components/content/ProjectCard";
import { StackLayers } from "@/components/content/StackLayers";
import { Container } from "@/components/site/Container";
import { REQUEST_PATH, SYSTEM_DIAGRAM } from "@/lib/architecture";
import { getExperience, getNotes, getProfile, getProjects, getStack } from "@/lib/content";
import { formatDate, formatPeriod } from "@/lib/format";

export default async function HomePage() {
  const [profile, projects, experience, stack, notes] = await Promise.all([
    getProfile(),
    getProjects(),
    getExperience(),
    getStack(),
    getNotes(),
  ]);

  const featured = projects.filter((p) => p.featured).slice(0, 4);
  const shown = featured.length ? featured : projects.slice(0, 4);

  return (
    <>
      <section aria-labelledby="hero-title">
        <Container className="pb-4 pt-16 md:pt-24">
          <p className="text-slate-400">
            <span className="glow text-primary">$</span> whoami
          </p>
          <h1 id="hero-title" className="cursor mt-4 max-w-3xl text-[clamp(2.25rem,5.5vw,3.75rem)] font-bold leading-[1.05] text-white">
            {profile?.headline ?? "Perfil pendiente de configurar"}
          </h1>
          {profile ? <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">{profile.summary}</p> : null}
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/projects" className="bg-primary px-4 py-2 font-bold text-carbon shadow-[0_0_18px_rgb(13_242_89/0.35)] hover:bg-white">
              Ver proyectos
            </Link>
            <Link
              href="/experience"
              className="border border-primary/40 px-4 py-2 font-bold text-primary hover:border-primary hover:bg-primary/10"
            >
              Experiencia
            </Link>
          </div>
        </Container>
      </section>

      <Block id="projects" title="Proyectos" href="/projects" hrefLabel="Todos los proyectos">
        {shown.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {shown.map((p) => (
              <ProjectCard key={p.slug} project={p} />
            ))}
          </div>
        ) : (
          <p className="text-slate-400">Aún no hay proyectos publicados.</p>
        )}
      </Block>

      <Block id="experience" title="Experiencia" href="/experience" hrefLabel="Ver detalle">
        <ul className="divide-y divide-white/10 border-y border-white/10">
          {experience.map((e) => (
            <li key={e.id} className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
              <p className="text-white">
                <span className="font-semibold">{e.role}</span>
                {e.company ? <span className="text-slate-400"> · {e.company}</span> : null}
              </p>
              <p className="shrink-0 text-sm text-slate-400">{formatPeriod(e.startDate, e.endDate)}</p>
            </li>
          ))}
        </ul>
      </Block>

      <Block id="stack" title="Stack" href="/stack" hrefLabel="Ver detalle">
        <StackLayers layers={stack} />
      </Block>

      {notes.length ? (
        <Block id="notes" title="Notas" href="/notes" hrefLabel="Todas las notas">
          <ul className="divide-y divide-white/10 border-y border-white/10">
            {notes.slice(0, 4).map((n) => (
              <li key={n.slug} className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                <Link href={`/notes/${n.slug}`} className="font-bold text-white hover:text-primary">
                  {n.title}
                </Link>
                <time dateTime={n.publishedAt} className="shrink-0 text-sm text-slate-400">
                  {formatDate(n.publishedAt)}
                </time>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      <Block id="site" title="Sobre este sitio" href="/engineering" hrefLabel="Cómo está construido">
        <p className="max-w-2xl leading-relaxed text-slate-300">
          Next.js en Vercel y PostgreSQL en Neon. Todo el contenido sale de la base de datos y se edita desde un panel
          propio. En verde, el camino de una visita.
        </p>
        <div className="mt-6 border border-primary/15 bg-carbon p-4">
          <Diagram model={SYSTEM_DIAGRAM} title="Arquitectura de este sitio" highlight={REQUEST_PATH} />
        </div>
      </Block>
    </>
  );
}
