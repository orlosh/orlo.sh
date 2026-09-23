import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/content/PageHeader";
import { Container } from "@/components/site/Container";
import { getNotes } from "@/lib/content";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Notas técnicas",
  description:
    "Notas técnicas: arquitectura, troubleshooting, despliegue y seguridad.",
  alternates: {
    canonical: "/notes",
    types: { "application/rss+xml": "/notes/rss.xml" },
  },
};

export default async function NotesPage() {
  const notes = await getNotes();
  return (
    <>
      <PageHeader
        label="technical notes"
        title="Notas técnicas"
        intro="Troubleshooting, decisiones y lo aprendido construyendo sistemas"
      />
      <Container className="py-14">
        {notes.length ? (
          <ul className="divide-y divide-border-dark/15 border-y border-carbon">
            {notes.map((n) => (
              <li key={n.slug}>
                <Link
                  href={`/notes/${n.slug}`}
                  className="group grid gap-2 py-7 md:grid-cols-[10rem_1fr]"
                >
                  <span className="font-mono text-xs text-slate-600 md:pt-2">
                    {formatDate(n.publishedAt)}
                  </span>
                  <span>
                    <span className="block text-2xl font-semibold tracking-[-0.03em] text-carbon group-hover:underline group-hover:decoration-primary group-hover:decoration-2 group-hover:underline-offset-4">
                      {n.title}
                    </span>
                    <span className="mt-2 block max-w-2xl text-slate-700">
                      {n.excerpt}
                    </span>
                    {n.tags.length ? (
                      <span className="mt-3 flex flex-wrap gap-1.5">
                        {n.tags.map((t) => (
                          <span key={t.slug} className="chip">
                            #{t.slug}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed border-border-dark/30 bg-white px-6 py-10 text-slate-700">
            Todavía no hay notas publicadas.
          </p>
        )}
      </Container>
    </>
  );
}
