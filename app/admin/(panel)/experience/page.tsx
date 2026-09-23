import { AdminList } from "@/components/admin/AdminList";
import { listExperiences } from "@/lib/admin/queries";
import { formatPeriod } from "@/lib/format";

export const metadata = { title: "Experiencia" };

export default async function ExperienceAdmin() {
  const rows = await listExperiences();
  return (
    <AdminList
      title="Experiencia"
      newHref="/admin/experience/new"
      items={rows.map((e) => ({
        href: `/admin/experience/${e.id}`,
        title: `${e.role} · ${e.company}`,
        meta: formatPeriod(e.startDate, e.endDate),
        badge: e.visible ? undefined : "oculta",
      }))}
    />
  );
}
