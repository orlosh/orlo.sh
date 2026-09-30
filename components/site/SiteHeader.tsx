import Link from "next/link";
import { Container } from "./Container";
import { NavLinks } from "./NavLinks";
import { Wordmark } from "./Wordmark";

export function SiteHeader({ brand }: { brand: string }) {
  return (
    <header className="border-b border-primary/15">
      <Container className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 py-5">
        <Link href="/" className="text-xl font-bold text-white" aria-label={`${brand}, inicio`}>
          <Wordmark brand={brand} />
        </Link>
        <nav aria-label="Principal">
          <NavLinks />
        </nav>
      </Container>
    </header>
  );
}
