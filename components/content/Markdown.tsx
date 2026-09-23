import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renderiza el Markdown escrito desde el panel de administración.
 * XSS: el HTML en bruto del origen se descarta (skipHtml) y el urlTransform por defecto de
 * react-markdown elimina las URL javascript:/data:. Aquí nada usa dangerouslySetInnerHTML.
 */
const components: Components = {
  h2: ({ children }) => <h2 className="mt-10 font-sans text-2xl font-semibold tracking-[-0.02em] text-carbon">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-8 font-sans text-lg font-semibold text-carbon">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-6 font-sans font-semibold text-carbon">{children}</h4>,
  p: ({ children }) => <p className="mt-4 first:mt-0">{children}</p>,
  ul: ({ children }) => <ul className="mt-4 list-disc space-y-2 pl-5 marker:text-carbon">{children}</ul>,
  ol: ({ children }) => <ol className="mt-4 list-decimal space-y-2 pl-5 marker:font-mono marker:text-sm marker:text-slate-600">{children}</ol>,
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
    <blockquote className="mt-4 border-l-4 border-primary pl-4 text-slate-700">{children}</blockquote>
  ),
  code: ({ className, children }) =>
    className ? (
      <code className={`${className} font-mono text-[0.85em]`}>{children}</code>
    ) : (
      <code className="rounded-sm border border-border-dark/15 bg-white px-1 py-0.5 font-mono text-[0.85em] text-carbon">{children}</code>
    ),
  pre: ({ children }) => (
    <pre tabIndex={0} className="on-dark mt-4 overflow-x-auto rounded-md bg-carbon p-4 font-mono text-sm leading-relaxed text-slate-100 [&_code]:border-0 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Tabla">
      <table className="w-full border-collapse text-left font-sans text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="label border-b border-carbon py-2 pr-4">{children}</th>,
  td: ({ children }) => <td className="border-b border-border-dark/15 py-2 pr-4 align-top">{children}</td>,
  hr: () => <hr className="my-8 border-border-dark/15" />,
  img: ({ src, alt }) =>
    // Imágenes aportadas por el autor: un <img> simple mantiene funcionando orígenes https arbitrarios
    // con la CSP.
    // eslint-disable-next-line @next/next/no-img-element
    typeof src === "string" ? <img src={src} alt={alt ?? ""} loading="lazy" className="mt-4 rounded-md border border-border-dark/15" /> : null,
};

export function Markdown({ children, variant = "prose" }: { children: string; variant?: "prose" | "compact" }) {
  const base =
    variant === "prose"
      ? "font-serif text-[1.1875rem] leading-[1.7] text-slate-800"
      : "font-sans text-[0.95rem] leading-relaxed text-slate-700";
  return (
    <div className={base}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
