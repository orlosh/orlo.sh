import type { TechRef } from "@/lib/content/types";

export function TechList({ items, label = "Tecnologías" }: { items: TechRef[]; label?: string }) {
  if (!items.length) return null;
  return (
    <ul aria-label={label} className="flex flex-wrap gap-1.5">
      {items.map((t) => (
        <li key={t.slug} className="chip">
          {t.name}
        </li>
      ))}
    </ul>
  );
}
