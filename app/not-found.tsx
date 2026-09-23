import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:px-8">
      <p className="label">404</p>
      <h1 className="mt-4 text-3xl font-semibold text-carbon">Esta ruta no existe</h1>
      <p className="mt-4 text-slate-700">
        Puede que el contenido se haya despublicado desde el panel de administración.
      </p>
      <Link href="/" className="link mt-8 inline-block">
        Volver al inicio
      </Link>
    </main>
  );
}
