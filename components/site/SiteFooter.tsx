import type { SocialLink } from "@/lib/content/types";
import { Container } from "./Container";

export function SiteFooter({ brand, links }: { brand: string; links: SocialLink[] }) {
  const items: [string, string, boolean][] = [
    ...links.map((l) => [l.url, l.label, true] as [string, string, boolean]),
    ["/notes/rss.xml", "RSS", false],
    ["/api/v1", "API", false],
    ["/health", "Estado", false],
  ];
  return (
    <footer className="mt-24 border-t border-primary/15">
      <Container className="flex flex-col gap-4 py-8 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {new Date().getUTCFullYear()} {brand}
        </p>
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {items.map(([href, label, external]) => (
            <li key={href}>
              <a href={href} className="hover:text-white" {...(external ? { target: "_blank", rel: "me noopener noreferrer" } : {})}>
                {label}
              </a>
            </li>
          ))}
        </ul>
      </Container>
    </footer>
  );
}
