import { AdminList } from "@/components/admin/AdminList";
import { listProjectRows } from "@/lib/admin/queries";

export const metadata = { title: "Proyectos" };

export default async function ProjectsAdmin() {
  const rows = await listProjectRows();
  return (
    <AdminList
      title="Proyectos"
      newHref="/admin/projects/new"
      items={rows.map((p) => ({
        href: `/admin/projects/${p.id}`,
        title: p.title,
        meta: `/${p.slug}${p.featured ? " · destacado" : ""}`,
        badge: p.published ? undefined : "borrador",
      }))}
    />
  );
}
