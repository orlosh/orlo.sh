/**
 * Smoke test posterior al despliegue, solo lectura (no escribe nada en producción).
 *
 *   pnpm smoke https://orlo.sh <sha-esperado>
 *
 * 1. Espera (hasta ~2 min) a que /health responda "ok" con la versión esperada:
 *    así se confirma que el dominio sirve ya el commit recién desplegado.
 * 2. Comprueba las cabeceras de seguridad de la home y el contrato de la API.
 * Sale con código 1 ante el primer fallo, lo que hace fallar el job de CI.
 */
const [baseArg, expectedVersion] = process.argv.slice(2);
if (!baseArg) {
  console.error("Uso: pnpm smoke <url-base> [versión-esperada]");
  process.exit(1);
}
const base = baseArg.replace(/\/+$/, "");

function check(ok: boolean, message: string) {
  if (!ok) {
    console.error(`✗ ${message}`);
    process.exit(1);
  }
  console.log(`✓ ${message}`);
}

async function waitForVersion() {
  const deadline = Date.now() + 120_000;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/health`, { cache: "no-store" });
      const body = (await res.json()) as { status?: string; version?: string };
      last = `${res.status} ${JSON.stringify(body)}`;
      if (res.status === 200 && body.status === "ok" && (!expectedVersion || body.version === expectedVersion)) {
        return body;
      }
    } catch (err) {
      last = String(err);
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }
  check(false, `/health no llegó a "ok" con la versión ${expectedVersion ?? "(cualquiera)"}. Última respuesta: ${last}`);
}

const health = await waitForVersion();
check(true, `/health ok · versión ${health?.version}`);

const home = await fetch(`${base}/`, { cache: "no-store" });
const csp = home.headers.get("content-security-policy") ?? "";
check(home.status === 200, "la home responde 200");
check(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/.test(csp), "CSP con nonce y strict-dynamic");
check((home.headers.get("strict-transport-security") ?? "").includes("max-age="), "HSTS presente");
check(home.headers.get("x-content-type-options") === "nosniff", "X-Content-Type-Options: nosniff");
check(!home.headers.has("x-powered-by"), "sin X-Powered-By");

const api = await fetch(`${base}/api/v1/projects`, { cache: "no-store" });
const apiBody = (await api.json()) as { data?: unknown };
check(api.status === 200 && Array.isArray(apiBody.data), "/api/v1/projects devuelve { data: [] }");

const bad = await fetch(`${base}/api/v1/projects/NO_VALIDO`, { cache: "no-store" });
check(bad.status === 400, "/api/v1 valida los parámetros (400)");

const admin = await fetch(`${base}/admin`, { redirect: "manual" });
check([302, 303, 307, 308].includes(admin.status), "/admin sin sesión redirige al login");

console.log("Smoke test superado.");

export {};
