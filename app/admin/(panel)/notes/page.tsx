import { AdminList } from "@/components/admin/AdminList";
import { listNoteRows } from "@/lib/admin/queries";

export const metadata = { title: "Notas" };

export default async function NotesAdmin() {
  const rows = await listNoteRows();
  return (
    <AdminList
      title="Notas técnicas"
      newHref="/admin/notes/new"
      items={rows.map((n) => ({
        href: `/admin/notes/${n.id}`,
        title: n.title,
        meta: `editada ${n.updatedAt.toISOString().slice(0, 10)}`,
        badge: n.published ? undefined : "borrador",
      }))}
    />
  );
}
