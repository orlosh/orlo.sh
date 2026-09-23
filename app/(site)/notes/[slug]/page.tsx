import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/content/Markdown";
import { Container } from "@/components/site/Container";
import { getNote } from "@/lib/content";
import { formatDate } from "@/lib/format";
import { slugSchema } from "@/lib/validation/content";

type Props = { params: Promise<{ slug: string }> };

async function load(params: Props["params"]) {
  const { slug } = await params;
  if (!slugSchema.safeParse(slug).success) return null;
  return getNote(slug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const note = await load(params);
  if (!note) return {};
  return {
    title: note.title,
    description: note.excerpt,
    alternates: { canonical: `/notes/${note.slug}` },
    openGraph: {
      type: "article",
      title: note.title,
      description: note.excerpt,
      publishedTime: note.publishedAt,
      modifiedTime: note.updatedAt,
      tags: note.tags.map((t) => t.name),
    },
  };
}

export default async function NotePage({ params }: Props) {
  const note = await load(params);
  if (!note) notFound();

  return (
    <article>
      <div className="relative border-b border-border-dark/15">
        <div aria-hidden className="dot-grid dot-grid-fade absolute inset-0" />
        <Container className="relative max-w-4xl pb-12 pt-12 md:pt-16">
          <nav aria-label="Migas" className="font-mono text-xs text-slate-600">
            <Link href="/notes" className="link">
              notas
            </Link>{" "}
            / {note.slug}
          </nav>
          <h1 className="mt-8 text-[clamp(2.25rem,5.5vw,4rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-carbon">
            {note.title}
          </h1>
          <p className="mt-6 font-serif text-2xl leading-relaxed text-slate-700">{note.excerpt}</p>
          <p className="mt-8 flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-slate-600">
            <time dateTime={note.publishedAt}>{formatDate(note.publishedAt)}</time>
            <span>{note.readingMinutes} min</span>
            {note.tags.map((t) => (
              <span key={t.slug}>#{t.slug}</span>
            ))}
          </p>
        </Container>
      </div>
      <Container className="max-w-4xl py-12">
        <div className="max-w-[68ch]">
          <Markdown>{note.body}</Markdown>
        </div>
      </Container>
    </article>
  );
}
