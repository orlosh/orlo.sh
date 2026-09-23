"use client";

export default function SiteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="py-24">
      <p className="label">Error · 500</p>
      <h1 className="mt-4 text-3xl font-semibold text-carbon">No se ha podido cargar esta página</h1>
      <p className="mt-4 max-w-prose text-slate-700">
        El fallo ha quedado registrado en los logs del servidor
        {error.digest ? (
          <>
            {" "}
            con la referencia <code className="font-mono text-carbon">{error.digest}</code>
          </>
        ) : null}
        . El estado de la aplicación y de la base de datos se puede consultar en{" "}
        <a href="/health" className="link">
          /health
        </a>
        .
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-8 rounded-sm border border-border-dark/15 px-4 py-2 text-sm text-carbon hover:border-carbon"
      >
        Reintentar
      </button>
    </section>
  );
}
