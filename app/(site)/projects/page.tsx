import type { Metadata } from "next";
import { PageHeader } from "@/components/content/PageHeader";
import { ProjectCard } from "@/components/content/ProjectCard";
import { Container } from "@/components/site/Container";
import { getProjects } from "@/lib/content";

export const metadata: Metadata = {
  title: "Proyectos",
  description:
    "Sistemas y proyectos: arquitectura, infraestructura, despliegue y seguridad.",
  alternates: { canonical: "/projects" },
};

export default async function ProjectsPage() {
  const projects = await getProjects();
  return (
    <>
      <PageHeader
        label="selected systems"
        title="Proyectos"
        intro="Algunos de los proyectos que he creado"
      />
      <Container className="py-14">
        {projects.length ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((p, i) => (
              <ProjectCard key={p.slug} project={p} index={i} />
            ))}
          </div>
        ) : (
          <p className="text-slate-700">Aún no hay proyectos publicados.</p>
        )}
      </Container>
    </>
  );
}
