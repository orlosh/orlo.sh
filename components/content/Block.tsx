import Link from "next/link";
import { Container } from "@/components/site/Container";

/** Sección de contenido con su título y, opcionalmente, un enlace «ver todo». */
export function Block({
  id,
  title,
  href,
  hrefLabel,
  children,
}: {
  id: string;
  title: string;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-8 pt-16">
      <Container>
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id={`${id}-h`} className="text-2xl font-bold text-white">
            <span aria-hidden className="glow mr-2 text-primary">
              &gt;
            </span>
            {title}
          </h2>
          {href ? (
            <Link href={href} className="shrink-0 text-primary hover:underline">
              {hrefLabel ?? "Ver todo"} →
            </Link>
          ) : null}
        </div>
        {children}
      </Container>
    </section>
  );
}
