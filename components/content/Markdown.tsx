import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renderiza el Markdown escrito desde el panel de administración.
 * XSS: el HTML en bruto del origen se descarta (skipHtml) y el urlTransform por defecto de
 * react-markdown elimina las URL javascript:/data:. Aquí nada usa dangerouslySetInnerHTML.
 */
const components: Components = {
  h2: ({ children }) => <h2 className="mt-12 text-2xl tracking-tight text-carbon site:text-white">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-8 text-lg text-carbon site:text-white">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-6 font-medium text-carbon site:text-white">{children}</h4>,
  p: ({ children }) => <p className="mt-4 first:mt-0">{children}</p>,
  ul: ({ children }) => <ul className="mt-4 list-disc space-y-2 pl-5 marker:text-carbon site:marker:text-slate-500">{children}</ul>,
  ol: ({ children }) => <ol className="mt-4 list-decimal space-y-2 pl-5 marker:text-sm marker:text-slate-600 site:marker:text-slate-400">{children}</ol>,
  a: ({ href, children }) => {
    const external = href?.startsWith("http");
    return (
      <a
        href={href}
        className="link"
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {children}
      </a>
    );
  },
  blockquote: ({ children }) => (
    <blockquote className="mt-6 border-l-2 border-primary pl-5 text-slate-700 site:text-slate-300">{children}</blockquote>
  ),
  code: ({ className, children }) =>
    className ? (
      <code className={`${className} font-mono text-[0.85em]`}>{children}</code>
    ) : (
      <code className="rounded-sm bg-white px-1 py-0.5 font-mono text-[0.85em] text-carbon ring-1 ring-border-dark/20 site:bg-carbon site:text-white site:ring-white/10">{children}</code>
    ),
  pre: ({ children }) => (
    <pre tabIndex={0} className="mt-6 overflow-x-auto rounded-md bg-carbon p-5 site:ring-1 site:ring-white/10 font-mono text-sm leading-relaxed text-slate-100 [&_code]:border-0 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Tabla">
      <table className="w-full border-collapse text-left font-sans text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-carbon py-2 pr-4 font-medium text-carbon site:border-white/30 site:text-white">{children}</th>,
  td: ({ children }) => <td className="border-b border-border-dark/15 py-2 pr-4 align-top site:border-white/10">{children}</td>,
  hr: () => <hr className="my-8 border-border-dark/15 site:border-white/10" />,
  img: ({ src, alt }) =>
    // Imágenes aportadas por el autor: un <img> simple mantiene funcionando orígenes https arbitrarios
    // con la CSP.
    // eslint-disable-next-line @next/next/no-img-element
    typeof src === "string" ? <img src={src} alt={alt ?? ""} loading="lazy" className="mt-6 rounded-md border border-border-dark/15 site:border-white/10" /> : null,
};

export function Markdown({ children, variant = "prose" }: { children: string; variant?: "prose" | "compact" }) {
  const base =
    variant === "prose"
      ? "text-[1.0625rem] leading-[1.75] text-slate-800 site:text-slate-300"
      : "text-[0.95rem] leading-relaxed text-slate-700 site:text-slate-400";
  return (
    <div className={base}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
