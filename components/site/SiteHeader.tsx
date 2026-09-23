import Link from "next/link";
import { healthReport } from "@/lib/health";
import { Container } from "./Container";
import { NavLinks } from "./NavLinks";
import { Wordmark } from "./Wordmark";

/**
 * Barra de comandos. El estado de la derecha es la comprobación real de /health, ejecutada
 * mientras se renderiza esta respuesta, así que nunca puede indicar "ok" con la base de datos caída.
 */
export async function SiteHeader({ brand }: { brand: string }) {
  const health = await healthReport();
  const ok = health.status === "ok";
  return (
    <header className="sticky top-0 z-40 border-b border-border-dark/15 bg-background-light/90 backdrop-blur">
      <Container className="flex h-14 items-center gap-4">
        <Link href="/" className="shrink-0 text-lg text-carbon" aria-label={`${brand}, inicio`}>
          <Wordmark brand={brand} />
        </Link>
        <nav aria-label="Principal" className="-mx-2 min-w-0 flex-1 overflow-x-auto md:flex md:justify-center">
          <NavLinks />
        </nav>
        <a
          href="/health"
          className="hidden shrink-0 items-center gap-2 rounded-full border border-border-dark/15 bg-white px-3 py-1 font-mono text-xs text-slate-700 hover:border-carbon lg:inline-flex"
        >
          <span aria-hidden className={`size-2 rounded-full ${ok ? "bg-primary" : "bg-red-500"}`} />
          {ok ? "sistemas ok" : "degradado"} · db {health.checks.database.latencyMs} ms
        </a>
      </Container>
    </header>
  );
}
