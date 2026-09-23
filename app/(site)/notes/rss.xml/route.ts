import { getNotes, getProfile } from "@/lib/content";
import { DEFAULT_BRAND, siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function GET() {
  const base = siteUrl();
  const [notes, profile] = await Promise.all([getNotes(), getProfile()]);
  const items = notes
    .map(
      (n) => `    <item>
      <title>${escape(n.title)}</title>
      <link>${base}/notes/${n.slug}</link>
      <guid isPermaLink="true">${base}/notes/${n.slug}</guid>
      <pubDate>${new Date(n.publishedAt).toUTCString()}</pubDate>
      <description>${escape(n.excerpt)}</description>
    </item>`,
    )
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escape(`Notas técnicas · ${profile?.displayName ?? DEFAULT_BRAND}`)}</title>
    <link>${base}/notes</link>
    <description>Notas técnicas</description>
    <language>es</language>
${items}
  </channel>
</rss>`;
  return new Response(xml, {
    headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}
