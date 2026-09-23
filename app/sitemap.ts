import type { MetadataRoute } from "next";
import { getNotes, getProjects } from "@/lib/content";
import { siteUrl } from "@/lib/site";

// Se genera en cada petición a partir de la base de datos, nunca en el build (en CI no hay BD).
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const [projects, notes] = await Promise.all([getProjects(), getNotes()]);
  const pages = ["", "/projects", "/stack", "/experience", "/notes", "/engineering"].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: "monthly" as const,
    priority: p === "" ? 1 : 0.7,
  }));
  return [
    ...pages,
    ...projects.map((p) => ({ url: `${base}/projects/${p.slug}`, lastModified: p.updatedAt, priority: 0.8 })),
    ...notes.map((n) => ({ url: `${base}/notes/${n.slug}`, lastModified: n.updatedAt, priority: 0.6 })),
  ];
}
