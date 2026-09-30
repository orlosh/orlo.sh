import type { Metadata } from "next";
import { PageHeader } from "@/components/content/PageHeader";
import { ProjectCard } from "@/components/content/ProjectCard";
import { Container } from "@/components/site/Container";
import { getProjects } from "@/lib/content";

export const metadata: Metadata = {
  title: "Proyectos",
  description: "Sistemas y proyectos: arquitectura, infraestructura, despliegue y seguridad.",
  alternates: { canonical: "/projects" },
};

export default async function ProjectsPage() {
  const projects = await getProjects();
  return (
    <>
      <PageHeader title="Proyectos" intro="Lo que he construido. Cada proyecto tiene su caso de estudio." />
      <Container>
        {projects.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {projects.map((p) => (
              <ProjectCard key={p.slug} project={p} headingLevel={2} />
            ))}
          </div>
        ) : (
          <p className="text-slate-400">Aún no hay proyectos publicados.</p>
        )}
      </Container>
    </>
  );
}
