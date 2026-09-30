import type { TechRef } from "@/lib/content/types";

export function TechList({ items, className = "" }: { items: TechRef[]; className?: string }) {
  if (!items.length) return null;
  return (
    <ul aria-label="Tecnologías" className={`flex flex-wrap gap-1.5 ${className}`}>
      {items.map((t) => (
        <li key={t.slug} className="bg-primary/10 px-2 py-0.5 text-sm text-primary">
          {t.name}
        </li>
      ))}
    </ul>
  );
}
