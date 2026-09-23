import type { Metadata } from "next";
import { headers } from "next/headers";
import { Diagram, DiagramPanel } from "@/components/content/Diagram";
import { PageHeader } from "@/components/content/PageHeader";
import { Container } from "@/components/site/Container";
import { PipelineFlow } from "@/components/content/PipelineFlow";
import { StatusPill } from "@/components/content/StatusPill";
import { LAYERS, PIPELINE, REQUEST_PATH, SECURITY_CONTROLS, SYSTEM_DIAGRAM } from "@/lib/architecture";
import { healthReport } from "@/lib/health";

export const metadata: Metadata = {
  title: "Cómo está construido",
  description:
    "Caso de estudio de este portfolio: Next.js, Neon PostgreSQL, Vercel, autenticación, CI/CD, seguridad y observabilidad.",
  alternates: { canonical: "/engineering" },
};

const DECISIONS = [
  {
    title: "Next.js en lugar de Astro + backend separado",
    context: "El sitio necesita panel de administración, autenticación, base de datos e invalidación de caché.",
    options: "Astro estático + API aparte · Astro SSR + API aparte · Next.js full-stack",
    decision: "Next.js con App Router: páginas, Server Actions y Route Handlers en una sola aplicación.",
    cost: "Más JavaScript de framework que Astro en páginas puramente estáticas. Lo mitigo con Server Components: el público apenas hidrata componentes.",
  },
  {
    title: "SSR por petición + caché de datos por etiquetas, no SSG",
    context: "El contenido cambia desde /admin y la CSP usa un nonce distinto en cada respuesta.",
    options: "SSG + rebuild por webhook · ISR por tiempo · SSR + data cache con invalidación por etiquetas",
    decision: "SSR con lecturas cacheadas por entidad; cada mutación invalida solo las etiquetas afectadas.",
    cost: "El HTML no se sirve desde el CDN: cada visita ejecuta una función. Con los datos en caché, ese render es barato y cabe de sobra en el plan gratuito.",
  },
  {
    title: "Vercel + Neon en lugar de un VPS propio",
    context: "Un portfolio con poco tráfico, un único administrador y presupuesto cero.",
    options: "VPS + Docker Compose + Caddy · Cloud Run + Neon · Vercel + Neon",
    decision: "Vercel para la aplicación y Neon para PostgreSQL, con el build y las migraciones ejecutados desde GitHub Actions.",
    cost: "Dependo de dos proveedores y de sus límites gratuitos; los logs de Vercel duran poco en el plan Hobby; TLS y borde son configuración de la plataforma, no del repositorio. A cambio, no hay servidores que parchear.",
  },
  {
    title: "Rate limiting de la API en memoria, con la protección de volumen en el borde",
    context: "La API es pública, de solo lectura y cacheada; en serverless cada instancia tiene su propia memoria.",
    options: "Redis (Upstash) · PostgreSQL · memoria del proceso + regla en el borde",
    decision: "Límite en memoria por instancia para /api/v1 y regla del firewall de Vercel para el volumen. El login usa contadores en PostgreSQL.",
    cost: "El límite en memoria es aproximado: no se comparte entre instancias y se pierde al reciclarse. Guardarlo en PostgreSQL añadiría una escritura por petición y mantendría Neon despierto; si la API tuviera consumidores reales, pasaría a Redis.",
  },
];

export default async function EngineeringPage() {
  const [report, h] = await Promise.all([healthReport(), headers()]);
  // La política que el proxy adjuntó a esta misma petición, con el nonce ocultado.
  const csp = (h.get("content-security-policy") ?? "").replace(/'nonce-[^']+'/, "'nonce-…'");

  return (
    <article>
      <PageHeader
        label="case study · este sitio"
        title="Cómo está construido"
        intro="Una aplicación full-stack: un proyecto Next.js en Vercel y PostgreSQL en Neon. Todo lo que ves en las páginas públicas sale de la base de datos y se edita desde un panel protegido. Esta página describe el código real: si la arquitectura cambia, esta página cambia en el mismo commit."
      >
      <nav aria-label="En esta página" className="mt-10 flex flex-wrap gap-x-5 gap-y-2 font-mono text-sm">
        {[
          ["architecture", "arquitectura"],
          ["layers", "capas"],
          ["data", "datos y caché"],
          ["delivery", "ci/cd"],
          ["security", "seguridad"],
          ["observability", "observabilidad"],
          ["decisions", "decisiones"],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="link">
            #{label}
          </a>
        ))}
      </nav>
      </PageHeader>
      <Container className="pb-8">

      <section id="architecture" aria-labelledby="architecture-h" className="scroll-mt-24 pt-16">
        <div className="border-t border-carbon pt-4"><p className="label"><span className="text-carbon">01</span></p></div>
        <h2 id="architecture-h" className="mt-3 text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold tracking-[-0.035em] text-carbon">
          Arquitectura
        </h2>
        <div className="mt-6">
          <DiagramPanel caption="en verde: el camino de una visita pública">
            <Diagram model={SYSTEM_DIAGRAM} title="Arquitectura del portfolio" highlight={REQUEST_PATH} />
          </DiagramPanel>
        </div>
        <div className="mt-6 max-w-[68ch] space-y-4 text-slate-700">
          <p>
            El borde de Vercel termina TLS y enruta cada petición a una función de la aplicación. La aplicación es un
            único proyecto Next.js con tres superficies: las páginas públicas, el panel{" "}
            <code className="font-mono text-carbon">/admin</code> y los endpoints de solo lectura{" "}
            <code className="font-mono text-carbon">/api/v1</code> y <code className="font-mono text-carbon">/health</code>.
          </p>
          <p>
            PostgreSQL está en Neon, gestionado, y la aplicación entra por su pooler con un rol que solo puede leer y
            escribir datos. No hay microservicios ni servidores propios; para un sitio de este tamaño serían
            complejidad sin un problema que resolver.
          </p>
        </div>
      </section>

      <section id="layers" aria-labelledby="layers-h" className="scroll-mt-24 pt-16">
        <div className="border-t border-carbon pt-4"><p className="label"><span className="text-carbon">02</span></p></div>
        <h2 id="layers-h" className="mt-3 text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold tracking-[-0.035em] text-carbon">
          Capas
        </h2>
        <dl className="mt-6 divide-y divide-border-dark/15 border-y border-border-dark/15">
          {LAYERS.map((l) => (
            <div key={l.name} className="grid gap-2 py-5 md:grid-cols-[11rem_1fr]">
              <dt className="label pt-1">{l.name}</dt>
              <dd>
                <p className="font-mono text-sm text-carbon">{l.tech}</p>
                <p className="mt-2 max-w-[68ch] text-slate-700">{l.why}</p>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="data" aria-labelledby="data-h" className="scroll-mt-24 pt-16">
        <div className="border-t border-carbon pt-4"><p className="label"><span className="text-carbon">03</span></p></div>
        <h2 id="data-h" className="mt-3 text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold tracking-[-0.035em] text-carbon">
          Datos, render y caché
        </h2>
        <ol className="mt-6 grid gap-px overflow-hidden rounded-md border border-border-dark/15 bg-border-dark/15 md:grid-cols-4">
          {[
            ["Lectura", "Cada página pide datos a lib/content, que envuelve consultas Drizzle en una caché etiquetada por entidad."],
            ["Render", "La página se renderiza en servidor en cada petición (nonce de CSP), pero sin tocar PostgreSQL si la caché está vigente."],
            ["Escritura", "Una Server Action de /admin valida con Zod, comprueba el rol, escribe en una transacción y registra el cambio en audit_log."],
            ["Invalidación", "La acción llama a updateTag() con las etiquetas afectadas; la siguiente petición lee datos frescos."],
          ].map(([t, d], i) => (
            <li key={t} className="bg-white p-5">
              <p className="label">
                {String(i + 1).padStart(2, "0")} · {t}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="delivery" aria-labelledby="delivery-h" className="scroll-mt-24 pt-16">
        <div className="border-t border-carbon pt-4"><p className="label"><span className="text-carbon">04</span></p></div>
        <h2 id="delivery-h" className="mt-3 text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold tracking-[-0.035em] text-carbon">
          CI/CD
        </h2>
        <div className="mt-6">
          <PipelineFlow stages={PIPELINE} />
        </div>
        <div className="mt-6 max-w-[68ch] space-y-4 text-slate-700">
          <p>
            Cada pull request pasa lint, typecheck, tests de integración contra un PostgreSQL real y tests E2E sobre un
            stack efímero en Docker. Los controles de seguridad bloquean el pipeline: dependencias con vulnerabilidades
            altas o secretos en el historial de git.
          </p>
          <p>
            En <code className="font-mono text-carbon">main</code>, el despliegue aplica las migraciones en Neon con el rol
            propietario del esquema, construye la aplicación en CI y la sube ya construida a Vercel. Un smoke test espera
            a que <code className="font-mono text-carbon">/health</code> devuelva la versión del commit desplegado y
            comprueba las cabeceras de seguridad. El despliegue automático desde git está desactivado: nada llega a
            producción sin pasar por el pipeline.
          </p>
        </div>
      </section>

      <section id="security" aria-labelledby="security-h" className="scroll-mt-24 pt-16">
        <div className="border-t border-carbon pt-4"><p className="label"><span className="text-carbon">05</span></p></div>
        <h2 id="security-h" className="mt-3 text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold tracking-[-0.035em] text-carbon">
          Seguridad
        </h2>
        <div className="mt-6 overflow-x-auto" tabIndex={0} role="region" aria-label="Controles de seguridad">
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <thead>
              <tr>
                <th scope="col" className="label border-b border-border-dark/15 py-3 pr-4">
                  Área
                </th>
                <th scope="col" className="label border-b border-border-dark/15 py-3 pr-4">
                  Control
                </th>
                <th scope="col" className="label border-b border-border-dark/15 py-3">
                  Dónde
                </th>
              </tr>
            </thead>
            <tbody>
              {SECURITY_CONTROLS.map((c) => (
                <tr key={c.area} className="align-top">
                  <th scope="row" className="border-b border-border-dark/15 py-4 pr-4 font-medium text-carbon">
                    {c.area}
                  </th>
                  <td className="border-b border-border-dark/15 py-4 pr-4 leading-relaxed text-slate-700">{c.control}</td>
                  <td className="border-b border-border-dark/15 py-4 font-mono text-xs leading-relaxed text-slate-600">
                    {c.evidence}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-8">
          <p className="label">Content-Security-Policy de esta respuesta</p>
          <pre tabIndex={0} aria-label="Content-Security-Policy" className="mt-3 overflow-x-auto whitespace-pre-wrap break-all on-dark rounded-md bg-carbon p-4 font-mono text-xs leading-relaxed text-slate-100">
            {csp ? csp.split("; ").join(";\n") : "(no disponible)"}
          </pre>
        </div>
      </section>

      <section id="observability" aria-labelledby="observability-h" className="scroll-mt-24 pt-16">
        <div className="border-t border-carbon pt-4"><p className="label"><span className="text-carbon">06</span></p></div>
        <h2 id="observability-h" className="mt-3 text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold tracking-[-0.035em] text-carbon">
          Observabilidad
        </h2>
        <div className="mt-6 grid gap-6 md:grid-cols-[1fr_1fr]">
          <div className="max-w-[60ch] space-y-4 text-slate-700">
            <p>
              <strong className="text-carbon">Logs:</strong> JSON estructurado con pino en stdout, que Vercel recoge en
              los logs de runtime. Las credenciales y cookies se redactan antes de escribirse.
            </p>
            <p>
              <strong className="text-carbon">Health check:</strong> <code className="font-mono text-carbon">/health</code>{" "}
              comprueba PostgreSQL con un timeout de 2 s y devuelve 503 si falla. Lo usan el smoke test del despliegue,
              un monitor de disponibilidad externo y el propio sitio (el estado de la cabecera).
            </p>
            <p>
              <strong className="text-carbon">Auditoría:</strong> cada cambio hecho desde /admin queda en{" "}
              <code className="font-mono text-carbon">audit_log</code>, que el rol de la aplicación no puede modificar ni
              borrar.
            </p>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <p className="label">Estado real, calculado en esta petición</p>
              <StatusPill signal={report.status === "ok" ? "ok" : "crit"}>{report.status}</StatusPill>
            </div>
            <pre tabIndex={0} aria-label="Respuesta de /health" className="mt-3 overflow-x-auto on-dark rounded-md bg-carbon p-4 font-mono text-xs leading-relaxed text-slate-100">
              {JSON.stringify(report, null, 2)}
            </pre>
          </div>
        </div>
      </section>

      <section id="decisions" aria-labelledby="decisions-h" className="scroll-mt-24 pt-16">
        <div className="border-t border-carbon pt-4"><p className="label"><span className="text-carbon">07</span></p></div>
        <h2 id="decisions-h" className="mt-3 text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold tracking-[-0.035em] text-carbon">
          Decisiones y su coste
        </h2>
        <div className="mt-6 space-y-4">
          {DECISIONS.map((d, i) => (
            <section key={d.title} className="rounded-md border border-border-dark/15 bg-white p-5" aria-labelledby={`adr-${i}`}>
              <p className="label">ADR-{String(i + 1).padStart(2, "0")}</p>
              <h3 id={`adr-${i}`} className="mt-2 text-lg font-semibold text-carbon">
                {d.title}
              </h3>
              <dl className="mt-4 grid gap-3 text-sm md:grid-cols-[8rem_1fr]">
                <dt className="label pt-0.5">Contexto</dt>
                <dd className="text-slate-700">{d.context}</dd>
                <dt className="label pt-0.5">Opciones</dt>
                <dd className="font-mono text-xs text-slate-700">{d.options}</dd>
                <dt className="label pt-0.5">Decisión</dt>
                <dd className="text-carbon">{d.decision}</dd>
                <dt className="label pt-0.5">Coste</dt>
                <dd className="text-slate-700">{d.cost}</dd>
              </dl>
            </section>
          ))}
        </div>
      </section>
      </Container>
    </article>
  );
}
