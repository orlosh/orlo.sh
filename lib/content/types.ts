/**
 * DTOs públicos. Son las únicas formas que salen de la capa de datos:
 * las páginas, la API JSON y la caché hablan en estos tipos, nunca en filas en bruto.
 * Todos los campos son seguros para JSON (las fechas son strings ISO) porque los valores
 * cacheados se serializan.
 */

export type TechRef = { name: string; slug: string };

export type SocialLink = {
  kind: "github" | "linkedin" | "email" | "website" | "other";
  label: string;
  url: string;
};

export type Profile = {
  /** Marca que se muestra en el sitio (p. ej. "orlo.sh"). */
  displayName: string;
  headline: string;
  location: string | null;
  summary: string;
  contactEmail: string | null;
  links: SocialLink[];
  updatedAt: string;
};

export type Experience = {
  id: string;
  /** Etiqueta pública del empleador; null cuando el propietario lo mantiene en privado. */
  company: string | null;
  role: string;
  location: string | null;
  employmentType: string | null;
  description: string | null;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD, null = actual */
  endDate: string | null;
  highlights: string[];
  technologies: TechRef[];
};

export type StackTechnology = TechRef & {
  description: string | null;
  yearsOfExperience: number | null;
  projects: { title: string; slug: string }[];
};

export type StackLayer = {
  name: string;
  slug: string;
  description: string | null;
  technologies: StackTechnology[];
};

export type ProjectStatus = "in_progress" | "active" | "completed" | "archived";

export type ProjectSummary = {
  slug: string;
  title: string;
  summary: string;
  status: ProjectStatus | null;
  featured: boolean;
  repositoryUrl: string | null;
  liveUrl: string | null;
  technologies: TechRef[];
  updatedAt: string;
};

export const CASE_STUDY_SECTIONS = [
  "overview",
  "architecture",
  "infrastructure",
  "deployment",
  "security",
  "challenges",
  "decisions",
  "results",
  "lessons",
] as const;
export type CaseStudySection = (typeof CASE_STUDY_SECTIONS)[number];

export type DiagramNode = { id: string; label: string; detail?: string; lane: number; column: number };
export type DiagramEdge = { from: string; to: string; label?: string };
export type Diagram = { nodes: DiagramNode[]; edges: DiagramEdge[] };

export type ProjectDetail = ProjectSummary & {
  sections: Record<CaseStudySection, string | null>;
  diagram: Diagram | null;
  images: { url: string; alt: string; caption: string | null }[];
  createdAt: string;
};

export type NoteSummary = {
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  updatedAt: string;
  tags: { name: string; slug: string }[];
};

export type NoteDetail = NoteSummary & { body: string; readingMinutes: number };

export type EducationItem = {
  kind: "formal" | "certification" | "course";
  title: string;
  institution: string;
  startYear: number | null;
  endYear: number | null;
  credentialUrl: string | null;
};

export type Language = { name: string; level: string | null };
