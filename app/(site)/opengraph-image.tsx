import { ImageResponse } from "next/og";
import { getProfile } from "@/lib/content";
import { DEFAULT_BRAND } from "@/lib/site";

export const alt = DEFAULT_BRAND;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

/**
 * Tarjeta social por defecto, generada a partir del perfil en la base de datos. Paleta: solo tokens
 * del proyecto.
 */
export default async function OgImage() {
  const profile = await getProfile();
  const brand = profile?.displayName ?? DEFAULT_BRAND;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#f5f8f6",
          color: "#121212",
          fontFamily: "sans-serif",
          backgroundImage: "radial-gradient(rgba(40,57,46,0.28) 1.5px, transparent 1.5px)",
          backgroundSize: "28px 28px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 44, fontWeight: 700, letterSpacing: -2 }}>
          <div style={{ width: 22, height: 22, background: "#0df259", borderRadius: 3 }} />
          {brand}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", fontSize: 84, fontWeight: 700, letterSpacing: -4, lineHeight: 1 }}>
            Build. Deploy. Observe.&nbsp;
            <span style={{ background: "linear-gradient(transparent 55%, #0df259 55%)" }}>Secure.</span>
          </div>
          <div style={{ fontSize: 30, color: "#475569" }}>{profile?.headline ?? ""}</div>
        </div>
        <div style={{ display: "flex", height: 3, background: "#121212" }} />
      </div>
    ),
    size,
  );
}
