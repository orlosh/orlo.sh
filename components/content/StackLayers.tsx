import Link from "next/link";
import type { StackLayer } from "@/lib/content/types";

/** Tecnologías por capa. Una tecnología usada en un proyecto publicado enlaza a él. */
export function StackLayers({ layers, detailed = false }: { layers: StackLayer[]; detailed?: boolean }) {
  if (!detailed) {
    return (
      <dl className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
        {layers.map((layer) => (
          <div key={layer.slug}>
            <dt className="font-semibold text-white">{layer.name}</dt>
            <dd className="mt-1 text-[0.9375rem] leading-relaxed text-slate-400">
              {layer.technologies.map((t) => t.name).join(", ")}
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <div className="space-y-12">
      {layers.map((layer) => (
        <section key={layer.slug} aria-labelledby={`layer-${layer.slug}`}>
          <h2 id={`layer-${layer.slug}`} className="text-xl font-bold text-white">
            {layer.name}
          </h2>
          <ul className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {layer.technologies.map((t) => (
              <li key={t.slug}>
                <p className="font-semibold text-white">
                  {t.name}
                  {t.yearsOfExperience ? (
                    <span className="ml-2 text-sm font-normal text-slate-400">
                      {t.yearsOfExperience} {t.yearsOfExperience === 1 ? "año" : "años"}
                    </span>
                  ) : null}
                </p>
                {t.description ? <p className="mt-1 text-sm leading-relaxed text-slate-400">{t.description}</p> : null}
                {t.projects.length ? (
                  <p className="mt-1 text-sm text-slate-400">
                    Usado en{" "}
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
        </section>
      ))}
    </div>
  );
}
