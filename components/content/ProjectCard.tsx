import Link from "next/link";
import type { ProjectSummary } from "@/lib/content/types";
import { ProjectStatusMark } from "./StatusPill";
import { TechList } from "./TechList";

export function ProjectCard({ project, headingLevel = 3 }: { project: ProjectSummary; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <article className="group relative flex h-full flex-col border border-primary/15 bg-carbon p-5 transition-[border-color,box-shadow] hover:border-primary hover:shadow-[0_0_24px_rgb(13_242_89/0.15)]">
      <div className="flex items-start justify-between gap-3">
        <H className="text-xl font-bold text-white">
          <Link href={`/projects/${project.slug}`} className="after:absolute after:inset-0 group-hover:text-primary">
            {project.title}
          </Link>
        </H>
        <ProjectStatusMark status={project.status} />
      </div>
      <p className="mt-2 flex-1 leading-relaxed text-slate-400">{project.summary}</p>
      <TechList items={project.technologies.slice(0, 5)} className="mt-4" />
    </article>
  );
}
