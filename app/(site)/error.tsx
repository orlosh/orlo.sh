"use client";

import { Container } from "@/components/site/Container";

export default function SiteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Container className="py-24">
      <p className="glow text-primary">Error 500</p>
      <h1 className="mt-3 text-[clamp(2rem,4.5vw,3rem)] font-bold tracking-tight text-white">No se ha podido cargar esta página</h1>
      <p className="mt-4 max-w-2xl text-lg text-slate-300">
        El fallo ha quedado registrado
        {error.digest ? (
          <>
            {" "}
            con la referencia <code className="font-mono text-white">{error.digest}</code>
          </>
        ) : null}
        . El estado del servicio está en{" "}
        <a href="/health" className="link">
          /health
        </a>
        .
      </p>
      <button type="button" onClick={reset} className="mt-8 bg-primary px-4 py-2 font-bold text-carbon hover:bg-white">
        Reintentar
      </button>
    </Container>
  );
}
