import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./lib/security/csp";

const nextConfig: NextConfig = {
  // Servidor autocontenido para la imagen Docker (desarrollo local y E2E en CI).
  // En Vercel no se usa: la plataforma empaqueta la app a su manera.
  output: process.env.BUILD_STANDALONE === "true" ? "standalone" : undefined,
  poweredByHeader: false,
  reactStrictMode: true,
  // La versión (SHA del commit) se fija en el build y queda incrustada en el
  // código del servidor: logs, /health y claves de caché la usan.
  env: { APP_VERSION: process.env.APP_VERSION ?? "dev" },
  async headers() {
    return [{ source: "/:path*", headers: [...SECURITY_HEADERS] }];
  },
};

export default nextConfig;
