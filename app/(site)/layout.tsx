import type { Metadata } from "next";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { getProfile } from "@/lib/content";
import { DEFAULT_BRAND } from "@/lib/site";

export const dynamic = "force-dynamic";

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

export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfile();
  const brand = profile?.displayName ?? DEFAULT_BRAND;
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-primary focus:px-3 focus:py-2 focus:text-carbon"
      >
        Saltar al contenido
      </a>
      <SiteHeader brand={brand} />
      <main id="main">{children}</main>
      <SiteFooter brand={brand} links={profile?.links ?? []} />
    </>
  );
}
