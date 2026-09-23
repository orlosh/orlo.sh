import Link from "next/link";
import type { ProjectSummary } from "@/lib/content/types";
import { ProjectStatusPill } from "./StatusPill";
import { TechList } from "./TechList";

export function ProjectCard({
  project,
  index,
  size = "md",
}: {
  project: ProjectSummary;
  index: number;
  size?: "md" | "lg";
}) {
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-md border border-border-dark/15 bg-white p-6 transition-[border-color,transform] duration-200 ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:border-carbon">
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-primary transition-transform duration-300 ease-[var(--ease-standard)] group-hover:scale-x-100"
      />
      <div className="flex items-center justify-between gap-4">
        <span className="font-mono text-xs text-slate-600">p/{String(index + 1).padStart(2, "0")}</span>
        <ProjectStatusPill status={project.status} />
      </div>
      <h3
        className={`mt-8 font-semibold tracking-[-0.03em] text-carbon ${
          size === "lg" ? "text-[clamp(1.75rem,3.2vw,2.5rem)] leading-[1.05]" : "text-2xl leading-tight"
        }`}
      >
        <Link href={`/projects/${project.slug}`} className="after:absolute after:inset-0">
          {project.title}
        </Link>
      </h3>
      <p className={`mt-3 flex-1 leading-relaxed text-slate-700 ${size === "lg" ? "max-w-xl text-lg" : ""}`}>
        {project.summary}
      </p>
      <div className="mt-6 flex items-end justify-between gap-4">
        <TechList items={project.technologies.slice(0, size === "lg" ? 6 : 4)} />
        <span aria-hidden className="shrink-0 font-mono text-xs text-carbon transition-transform duration-200 group-hover:translate-x-1">
          caso →
        </span>
      </div>
    </article>
  );
}
