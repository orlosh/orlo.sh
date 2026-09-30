import { ImageResponse } from "next/og";
import { getProfile } from "@/lib/content";
import { DEFAULT_BRAND } from "@/lib/site";

export const alt = DEFAULT_BRAND;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

/** Tarjeta social por defecto, generada a partir del perfil en la base de datos. */
export default async function OgImage() {
  const profile = await getProfile();
  const brand = profile?.displayName ?? DEFAULT_BRAND;
  const dot = brand.lastIndexOf(".");
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "#0a0a0a",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 40, fontWeight: 700 }}>
          {dot > 0 ? brand.slice(0, dot) : brand}
          {dot > 0 ? <span style={{ color: "#0df259" }}>.</span> : null}
          {dot > 0 ? brand.slice(dot + 1) : null}
        </div>
        <div style={{ display: "flex", fontSize: 68, fontWeight: 700, lineHeight: 1.1, maxWidth: 950 }}>
          {profile?.headline ?? brand}
        </div>
      </div>
    ),
    size,
  );
}
