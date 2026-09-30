import type { Metadata } from "next";
import { headers } from "next/headers";
import { Diagram } from "@/components/content/Diagram";
import { PageHeader } from "@/components/content/PageHeader";
import { PipelineFlow } from "@/components/content/PipelineFlow";
import { StatusMark } from "@/components/content/StatusPill";
import { Block } from "@/components/content/Block";
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

const PARTS = [
  ["architecture", "Arquitectura"],
  ["layers", "Capas"],
  ["data", "Datos y caché"],
  ["delivery", "CI/CD"],
  ["security", "Seguridad"],
  ["observability", "Observabilidad"],
  ["decisions", "Decisiones"],
] as const;

const DATA_FLOW = [
  { name: "Lectura", runs: "Cada página pide datos a lib/content, que envuelve consultas Drizzle en una caché etiquetada por entidad." },
  { name: "Render", runs: "La página se renderiza en servidor en cada petición (nonce de CSP), sin tocar PostgreSQL si la caché está vigente." },
  { name: "Escritura", runs: "Una Server Action de /admin valida con Zod, comprueba el rol, escribe en una transacción y lo registra en audit_log." },
  { name: "Invalidación", runs: "La acción llama a updateTag() con las etiquetas afectadas; la siguiente petición lee datos frescos." },
];

const code = "font-mono text-[0.9em] text-white";
const prose = "max-w-[68ch] space-y-4 leading-relaxed text-slate-300";
const rows = "divide-y divide-white/10 border-y border-white/10";

export default async function EngineeringPage() {
  const [report, h] = await Promise.all([healthReport(), headers()]);
  // La política que el proxy adjuntó a esta misma petición, con el nonce ocultado.
  const csp = (h.get("content-security-policy") ?? "").replace(/'nonce-[^']+'/, "'nonce-…'");

  return (
    <article>
      <PageHeader
        label={
          <nav aria-label="En esta página">
            <ol className="flex flex-wrap gap-x-4 gap-y-1">
              {PARTS.map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`} className="link">
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        }
        title="Cómo está construido este sitio"
        intro="Un proyecto Next.js en Vercel y PostgreSQL en Neon. Lo que ves en las páginas públicas sale de la base de datos y se edita desde un panel protegido. Esta página describe el código real y cambia en el mismo commit que él."
      />

      <Block id="architecture" title="Arquitectura">
        <div className="border border-primary/15 bg-carbon p-4">
          <Diagram model={SYSTEM_DIAGRAM} title="Arquitectura del portfolio" highlight={REQUEST_PATH} />
        </div>
        <p className="mt-3 text-sm text-slate-400">En verde, el camino de una visita pública.</p>
        <div className={`mt-8 ${prose}`}>
          <p>
            El borde de Vercel termina TLS y enruta cada petición a una función de la aplicación. La aplicación es un único
            proyecto Next.js con tres superficies: las páginas públicas, el panel <code className={code}>/admin</code> y los
            endpoints de solo lectura <code className={code}>/api/v1</code> y <code className={code}>/health</code>.
          </p>
          <p>
            PostgreSQL está en Neon, gestionado, y la aplicación entra por su pooler con un rol que solo puede leer y
            escribir datos. No hay microservicios ni servidores propios; para un sitio de este tamaño serían complejidad
            sin un problema que resolver.
          </p>
        </div>
      </Block>

      <Block id="layers" title="Capas">
        <ul className={rows}>
          {LAYERS.map((l) => (
            <li key={l.name} className="grid gap-2 py-6 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-10">
              <h3 className="font-semibold text-white">{l.name}</h3>
              <div className="min-w-0">
                <p className="text-slate-200">{l.tech}</p>
                <p className="mt-2 leading-relaxed text-slate-400">{l.why}</p>
              </div>
            </li>
          ))}
        </ul>
      </Block>

      <Block id="data" title="Datos y caché">
        <PipelineFlow stages={DATA_FLOW} />
      </Block>

      <Block id="delivery" title="CI/CD">
        <PipelineFlow stages={PIPELINE} />
        <div className={`mt-8 ${prose}`}>
          <p>
            Cada pull request pasa lint, typecheck, tests de integración contra un PostgreSQL real y tests E2E sobre un
            stack efímero en Docker. Los controles de seguridad bloquean el pipeline: dependencias con vulnerabilidades
            altas o secretos en el historial de git.
          </p>
          <p>
            En <code className={code}>main</code>, el despliegue aplica las migraciones en Neon con el rol propietario del
            esquema, construye la aplicación en CI y la sube ya construida a Vercel. Un smoke test espera a que{" "}
            <code className={code}>/health</code> devuelva la versión del commit desplegado y comprueba las cabeceras de
            seguridad. El despliegue automático desde git está desactivado.
          </p>
        </div>
      </Block>

      <Block id="security" title="Seguridad">
        <ul className={rows}>
          {SECURITY_CONTROLS.map((c) => (
            <li key={c.area} className="grid gap-2 py-6 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-10">
              <h3 className="font-semibold text-white">{c.area}</h3>
              <div className="min-w-0">
                <p className="leading-relaxed text-slate-300">{c.control}</p>
                <p className="mt-2 break-all font-mono text-xs text-slate-400">{c.evidence}</p>
              </div>
            </li>
          ))}
        </ul>
        <h3 className="mt-10 font-semibold text-white">Content-Security-Policy de esta respuesta</h3>
        <pre
          tabIndex={0}
          aria-label="Content-Security-Policy"
          className="mt-4 overflow-x-auto whitespace-pre-wrap break-all bg-carbon p-5 font-mono text-xs leading-relaxed text-slate-200 ring-1 ring-primary/15"
        >
          {csp ? csp.split("; ").join(";\n") : "(no disponible)"}
        </pre>
      </Block>

      <Block id="observability" title="Observabilidad">
        <div className={prose}>
          <p>
            <span className="font-semibold text-white">Logs.</span> JSON estructurado con pino en stdout, que Vercel recoge en los logs
            de runtime. Las credenciales y cookies se redactan antes de escribirse.
          </p>
          <p>
            <span className="font-semibold text-white">Health check.</span> <code className={code}>/health</code> comprueba PostgreSQL con
            un timeout de 2 s y devuelve 503 si falla. Lo usan el smoke test del despliegue y un monitor de disponibilidad
            externo.
          </p>
          <p>
            <span className="font-semibold text-white">Auditoría.</span> Cada cambio hecho desde /admin queda en{" "}
            <code className={code}>audit_log</code>, que el rol de la aplicación no puede modificar ni borrar.
          </p>
        </div>
        <div className="mt-10 flex items-center justify-between gap-4">
          <h3 className="font-semibold text-white">Respuesta de /health ahora mismo</h3>
          <StatusMark signal={report.status === "ok" ? "ok" : "crit"}>{report.status}</StatusMark>
        </div>
        <pre
          tabIndex={0}
          aria-label="Respuesta de /health"
          className="mt-4 overflow-x-auto bg-carbon p-5 font-mono text-xs leading-relaxed text-slate-200 ring-1 ring-primary/15"
        >
          {JSON.stringify(report, null, 2)}
        </pre>
      </Block>

      <Block id="decisions" title="Decisiones y su coste">
        <ol className={rows}>
          {DECISIONS.map((d, i) => (
            <li key={d.title} className="py-8">
              <h3 id={`adr-${i}`} className="text-lg font-bold text-white">
                {d.title}
              </h3>
              <dl className="mt-5 grid gap-x-10 gap-y-3 leading-relaxed sm:grid-cols-[8rem_minmax(0,1fr)]">
                <dt className="text-sm text-slate-400 sm:pt-0.5">contexto</dt>
                <dd className="text-slate-300">{d.context}</dd>
                <dt className="text-sm text-slate-400 sm:pt-0.5">opciones</dt>
                <dd className="text-slate-300">{d.options}</dd>
                <dt className="text-sm text-slate-400 sm:pt-0.5">decisión</dt>
                <dd className="text-white">{d.decision}</dd>
                <dt className="text-sm text-slate-400 sm:pt-0.5">coste</dt>
                <dd className="text-slate-300">{d.cost}</dd>
              </dl>
            </li>
          ))}
        </ol>
      </Block>
    </article>
  );
}
