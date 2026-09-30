import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/content/Markdown";
import { PageHeader } from "@/components/content/PageHeader";
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
      <PageHeader
        label={
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <Link href="/notes" className="link">
              ← Notas
            </Link>
            <p>
              <time dateTime={note.publishedAt}>{formatDate(note.publishedAt)}</time> · {note.readingMinutes} min
            </p>
            {note.tags.length ? <p>{note.tags.map((t) => t.name).join(", ")}</p> : null}
          </div>
        }
        title={note.title}
        intro={note.excerpt}
      />
      <Container className="pb-8">
        <div className="min-w-0 max-w-[68ch]">
          <Markdown>{note.body}</Markdown>
        </div>
      </Container>
    </article>
  );
}
