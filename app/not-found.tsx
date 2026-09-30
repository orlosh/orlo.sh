import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Página no encontrada" };

// Fuera del grupo (site): no hereda su layout, así que aplica el tema oscuro por sí misma.
export default function NotFound() {
  return (
    <div className="site min-h-dvh">
      <main id="main" className="mx-auto max-w-5xl px-5 py-24 sm:px-8">
        <p className="glow text-primary">Error 404</p>
        <h1 className="mt-3 text-[clamp(2rem,4.5vw,3rem)] font-bold tracking-tight text-white">Página no encontrada</h1>
        <p className="mt-4 max-w-xl text-lg text-slate-300">Puede que el contenido se haya despublicado.</p>
        <Link href="/" className="mt-8 inline-block bg-primary px-4 py-2 font-bold text-carbon hover:bg-white">
          Volver al inicio
        </Link>
      </main>
    </div>
  );
}
