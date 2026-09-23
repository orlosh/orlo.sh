import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { buildCsp, createNonce } from "@/lib/security/csp";

/**
 * Se ejecuta antes de cada petición de página:
 *  1. Emite un nonce de CSP nuevo (Next.js lo aplica a sus propios scripts).
 *  2. Filtro optimista para /admin: sin cookie de sesión → página de login.
 *     Es solo una vía rápida. La comprobación real de autorización ocurre en el
 *     servidor para cada página de admin y cada mutación (lib/auth/guard.ts),
 *     porque la presencia de una cookie no demuestra nada.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    if (!getSessionCookie(request)) {
      const login = new URL("/admin/login", request.url);
      return NextResponse.redirect(login);
    }
  }

  const nonce = createNonce();
  const csp = buildCsp(nonce, { dev: process.env.NODE_ENV === "development" });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Solo páginas: se excluyen las rutas de API, health, assets estáticos y prefetches.
      source: "/((?!api|health|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
