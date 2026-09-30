import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/content/PageHeader";
import { Container } from "@/components/site/Container";
import { getNotes } from "@/lib/content";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Notas técnicas",
  description: "Notas técnicas: arquitectura, troubleshooting, despliegue y seguridad.",
  alternates: {
    canonical: "/notes",
    types: { "application/rss+xml": "/notes/rss.xml" },
  },
};

export default async function NotesPage() {
  const notes = await getNotes();
  return (
    <>
      <PageHeader title="Notas" intro="Troubleshooting, decisiones y lo aprendido construyendo sistemas." />
      <Container>
        {notes.length ? (
          <ul className="divide-y divide-white/10 border-y border-white/10">
            {notes.map((n) => (
              <li key={n.slug} className="py-6">
                <time dateTime={n.publishedAt} className="text-sm text-slate-400">
                  {formatDate(n.publishedAt)}
                </time>
                <h2 className="mt-1 text-xl font-bold text-white">
                  <Link href={`/notes/${n.slug}`} className="hover:text-primary">
                    {n.title}
                  </Link>
                </h2>
                <p className="mt-2 max-w-2xl leading-relaxed text-slate-400">{n.excerpt}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-slate-400">Todavía no hay notas publicadas.</p>
        )}
      </Container>
    </>
  );
}
