import type { Metadata, Viewport } from "next";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { getProfile } from "@/lib/content";
import { DEFAULT_BRAND } from "@/lib/site";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "dark",
};

export async function generateMetadata(): Promise<Metadata> {
  const profile = await getProfile();
  const brand = profile?.displayName ?? DEFAULT_BRAND;
  return {
    title: {
      default: profile ? `${brand} — ${profile.headline}` : brand,
      template: `%s · ${brand}`,
    },
    description: profile?.summary,
    applicationName: brand,
    openGraph: { type: "website", locale: "es_ES", siteName: brand },
    twitter: { card: "summary_large_image" },
    alternates: { canonical: "/" },
  };
}

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  const brand = profile?.displayName ?? DEFAULT_BRAND;
  return (
    // El sitio público es oscuro; el panel de administración, no (ver globals.css).
    <div className="site flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:px-3 focus:py-2 focus:text-carbon"
      >
        Saltar al contenido
      </a>
      <SiteHeader brand={brand} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter brand={brand} links={profile?.links ?? []} />
    </div>
  );
}
