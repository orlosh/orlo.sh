import Link from "next/link";
import type { StackLayer } from "@/lib/content/types";

/**
 * El stack dibujado como una pila: un bloque por capa, la más cercana al usuario arriba.
 * Sin logos ni porcentajes. Una tecnología usada en un proyecto publicado enlaza a él.
 */
export function StackLayers({ layers, detailed = false }: { layers: StackLayer[]; detailed?: boolean }) {
  return (
    <ol className="overflow-hidden rounded-md border border-carbon">
      {layers.map((layer, i) => (
        <li
          key={layer.slug}
          className="grid gap-4 border-b border-border-dark/15 bg-white p-5 last:border-b-0 md:grid-cols-[13rem_1fr] md:gap-8"
        >
          <div className="flex items-baseline gap-3 md:block">
            <span className="font-mono text-xs text-slate-600">L{String(layers.length - i).padStart(2, "0")}</span>
            <h3 className="text-xl font-semibold tracking-[-0.02em] text-carbon md:mt-1">{layer.name}</h3>
            <span className="font-mono text-xs text-slate-600 md:mt-1 md:block">{layer.technologies.length} tecnologías</span>
          </div>
          {detailed ? (
            <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {layer.technologies.map((t) => (
                <li key={t.slug} className="border-l-2 border-border-dark/15 pl-3">
                  <p className="font-medium text-carbon">
                    {t.name}
                    {t.yearsOfExperience ? (
                      <span className="ml-2 font-mono text-xs font-normal text-slate-600">{t.yearsOfExperience} a</span>
                    ) : null}
                  </p>
                  {t.description ? <p className="text-sm text-slate-700">{t.description}</p> : null}
                  {t.projects.length ? (
                    <p className="font-mono text-xs text-slate-600">
                      usado en{" "}
                      {t.projects.map((p, j) => (
                        <span key={p.slug}>
                          {j > 0 ? ", " : ""}
                          <Link href={`/projects/${p.slug}`} className="link">
                            {p.title}
                          </Link>
                        </span>
                      ))}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <ul className="flex flex-wrap content-start gap-1.5">
              {layer.technologies.map((t) => (
                <li key={t.slug} className="chip">
                  {t.name}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
