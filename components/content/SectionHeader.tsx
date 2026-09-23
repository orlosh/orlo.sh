import Link from "next/link";

/**
 * Apertura editorial de sección: un filete marcado en carbón, un índice, la etiqueta de máquina y
 * el título.
 */
export function SectionHeader({
  id,
  index,
  label,
  title,
  href,
  hrefLabel,
  dark = false,
}: {
  id: string;
  index: string;
  label: string;
  title: string;
  href?: string;
  hrefLabel?: string;
  dark?: boolean;
}) {
  return (
    <div className={`mb-10 border-t pt-4 ${dark ? "border-white/25" : "border-carbon"}`}>
      <div className="flex items-baseline justify-between gap-4">
        <p className="label">
          <span className={dark ? "text-primary" : "text-carbon"}>{index}</span> / {label}
        </p>
        {href ? (
          <Link href={href} className="link shrink-0 font-mono text-xs">
            {hrefLabel ?? "ver todo"} →
          </Link>
        ) : null}
      </div>
      <h2
        id={id}
        className={`mt-5 text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.035em] ${
          dark ? "text-white" : "text-carbon"
        }`}
      >
        {title}
      </h2>
    </div>
  );
}
