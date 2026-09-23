import type { SocialLink } from "@/lib/content/types";
import { Container } from "./Container";
import { Wordmark } from "./Wordmark";

export function SiteFooter({
  brand,
  links,
}: {
  brand: string;
  links: SocialLink[];
}) {
  return (
    <footer className="mt-32 overflow-hidden border-t border-carbon">
      <Container className="grid gap-10 py-12 md:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <p className="label">Build · Deploy · Observe · Secure</p>
        </div>
        <ul className="grid grid-cols-2 gap-x-8 gap-y-2 font-mono text-sm sm:grid-cols-3">
          {links.map((l) => (
            <li key={l.url}>
              <a
                href={l.url}
                className="link"
                rel="me noopener noreferrer"
                target="_blank"
              >
                {l.label.toLowerCase()}
              </a>
            </li>
          ))}
          {[
            ["/health", "/health"],
            ["/api/v1", "/api/v1"],
            ["/notes/rss.xml", "rss"],
            ["/sitemap.xml", "sitemap"],
          ].map(([href, label]) => (
            <li key={href}>
              <a href={href} className="link">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </Container>
      <Container>
        <p
          aria-hidden
          className="select-none border-t-4 border-primary pb-4 pt-2 text-[clamp(4rem,19vw,15.5rem)] leading-[0.9] text-carbon"
        >
          <Wordmark brand={brand} mark={false} />
        </p>
      </Container>
    </footer>
  );
}
