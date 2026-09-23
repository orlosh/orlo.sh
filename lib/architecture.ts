import type { Diagram } from "@/lib/content/types";

/**
 * La arquitectura de ESTA aplicación, como código.
 *
 * A diferencia del contenido del portfolio (que vive en PostgreSQL y se edita
 * desde /admin), esto describe el propio código fuente, así que se versiona
 * con él: si la arquitectura cambia, este fichero cambia en el mismo commit.
 * Lo renderizan /engineering y la home.
 */
export const SYSTEM_DIAGRAM: Diagram = {
  nodes: [
    { id: "visitor", label: "Visitante", detail: "navegador", lane: 0, column: 0 },
    { id: "admin-user", label: "Administrador", detail: "sesión autenticada", lane: 1, column: 0 },
    { id: "monitor", label: "Monitor externo", detail: "GET /health", lane: 2, column: 0 },
    { id: "edge", label: "Vercel Edge", detail: "TLS · firewall · CDN", lane: 1, column: 1 },
    { id: "pages", label: "Páginas SSR", detail: "Vercel Functions", lane: 0, column: 2 },
    { id: "admin", label: "/admin", detail: "Server Actions", lane: 1, column: 2 },
    { id: "api", label: "/api/v1 · /health", detail: "Route Handlers", lane: 2, column: 2 },
    { id: "cache", label: "Data cache", detail: "etiquetas · por versión", lane: 0, column: 3 },
    { id: "db", label: "Neon PostgreSQL", detail: "pooler · portfolio_app", lane: 1, column: 3 },
  ],
  edges: [
    { from: "visitor", to: "edge" },
    { from: "admin-user", to: "edge" },
    { from: "monitor", to: "edge" },
    { from: "edge", to: "pages" },
    { from: "edge", to: "admin" },
    { from: "edge", to: "api" },
    { from: "pages", to: "cache" },
    { from: "api", to: "cache" },
    { from: "admin", to: "cache", label: "updateTag" },
    { from: "cache", to: "db" },
    { from: "admin", to: "db" },
  ],
};

/** Camino de una visita pública, resaltado en el diagrama. */
export const REQUEST_PATH = ["visitor", "edge", "pages", "cache", "db"];

export type Layer = { name: string; tech: string; why: string };

export const LAYERS: Layer[] = [
  {
    name: "Frontend",
    tech: "Next.js 16 (App Router) · React 19 Server Components · Tailwind CSS 4",
    why: "Las páginas públicas se renderizan en servidor y apenas envían JavaScript: el único componente cliente público es el indicador de sección activa del menú.",
  },
  {
    name: "Backend",
    tech: "Route Handlers · Server Actions · Zod",
    why: "La API de solo lectura y las mutaciones del panel viven en la misma aplicación que las páginas. Cada frontera (formularios, API, entorno) valida con Zod.",
  },
  {
    name: "Base de datos",
    tech: "Neon PostgreSQL · Drizzle ORM · migraciones SQL versionadas",
    why: "Modelo relacional normalizado con claves foráneas, CHECK constraints e índices. La app se conecta por el pooler de Neon con pocas conexiones por instancia, como pide un entorno serverless.",
  },
  {
    name: "Autenticación",
    tech: "Better Auth · email + contraseña (scrypt) · sesiones en PostgreSQL",
    why: "Registro público deshabilitado; el único administrador se crea por CLI. Autorización por rol comprobada en servidor en cada página y cada mutación.",
  },
  {
    name: "Infraestructura",
    tech: "Vercel (Functions + Edge, región fra1) · Neon (PostgreSQL gestionado)",
    why: "Sin servidores propios que parchear: TLS, CDN y escalado los da la plataforma. Docker y Compose siguen existiendo para desarrollo local y para los E2E de CI.",
  },
  {
    name: "CI/CD",
    tech: "GitHub Actions · Vercel CLI (build en CI, deploy --prebuilt)",
    why: "Lint, typecheck, tests, auditoría de dependencias y E2E antes de desplegar. El build se hace en CI y se sube ya construido; después, un smoke test confirma que producción sirve ese commit.",
  },
  {
    name: "Observabilidad",
    tech: "Logs JSON (pino) en Vercel · /health · monitor externo · audit log",
    why: "Logs estructurados, health check con latencia real de la base de datos y un registro inmutable de cada cambio hecho desde /admin.",
  },
];

export type PipelineStage = { name: string; runs: string; gate?: boolean };

/** Refleja .github/workflows/ci.yml job a job. */
export const PIPELINE: PipelineStage[] = [
  { name: "Lint", runs: "eslint, 0 warnings" },
  { name: "Typecheck", runs: "tsc --noEmit" },
  { name: "Tests", runs: "vitest: unit + integración contra PostgreSQL" },
  { name: "Seguridad", runs: "pnpm audit · gitleaks (historial completo)", gate: true },
  { name: "E2E", runs: "stack efímero en Docker · Playwright + axe", gate: true },
  { name: "Deploy", runs: "migraciones Neon → vercel deploy → smoke test" },
];

export type SecurityControl = { area: string; control: string; evidence: string };

/** Cada control nombra el fichero que lo implementa, para que se pueda verificar. */
export const SECURITY_CONTROLS: SecurityControl[] = [
  {
    area: "XSS",
    control: "CSP con nonce por petición y 'strict-dynamic'; sin 'unsafe-inline' en scripts. Markdown renderizado sin HTML crudo.",
    evidence: "proxy.ts · lib/security/csp.ts · components/content/Markdown.tsx",
  },
  {
    area: "Cabeceras",
    control: "HSTS, nosniff, X-Frame-Options DENY, frame-ancestors 'none', Referrer-Policy, Permissions-Policy y COOP/CORP en todas las respuestas.",
    evidence: "next.config.ts · lib/security/csp.ts",
  },
  {
    area: "Autenticación",
    control: "Better Auth: contraseñas con scrypt, registro público deshabilitado, cookies HttpOnly + Secure + SameSite=Lax, sesiones revocables en base de datos.",
    evidence: "lib/auth/index.ts · scripts/create-admin.ts",
  },
  {
    area: "Autorización",
    control: "Rol 'admin' comprobado en servidor en cada página de /admin y en cada Server Action; el proxy solo hace una redirección optimista.",
    evidence: "lib/auth/guard.ts",
  },
  {
    area: "CSRF",
    control: "Server Actions solo aceptan POST con Origin igual al host; Better Auth valida el origen; cookies SameSite=Lax.",
    evidence: "lib/auth/index.ts (trustedOrigins)",
  },
  {
    area: "Fuerza bruta",
    control: "Rate limiting del login persistido en PostgreSQL (sobrevive a reinicios y es común a todas las instancias). La API pública tiene además un límite por instancia.",
    evidence: "lib/auth/index.ts · lib/security/rate-limit.ts",
  },
  {
    area: "Validación",
    control: "Zod en formularios, API y variables de entorno; CHECK constraints, claves foráneas y unicidad en la base de datos.",
    evidence: "lib/validation/content.ts · db/schema.ts",
  },
  {
    area: "SQL injection",
    control: "Consultas parametrizadas vía Drizzle / postgres.js; ningún SQL construido concatenando entrada de usuario.",
    evidence: "lib/content/repository.ts · lib/admin/",
  },
  {
    area: "Mínimo privilegio",
    control: "Dos roles de PostgreSQL: el propietario ejecuta las migraciones (DDL) y la app usa uno con solo DML, que no puede modificar ni borrar el audit log.",
    evidence: "db/neon/roles.sql · db/migrations/0001_audit_log_append_only.sql",
  },
  {
    area: "Despliegue",
    control: "El build se hace en CI y se sube ya construido: producción solo ejecuta código que ha pasado tests, auditoría y E2E. El despliegue automático desde git está desactivado.",
    evidence: ".github/workflows/ci.yml · vercel.json",
  },
  {
    area: "Supply chain",
    control: "Lockfile congelado, pnpm audit, escaneo de secretos (gitleaks) y Dependabot.",
    evidence: ".github/workflows/ci.yml · .github/dependabot.yml",
  },
  {
    area: "Secretos",
    control: "Variables de entorno de Vercel y secretos de GitHub, validadas al arrancar. Nada en el repositorio; .vercelignore impide subir contenido privado.",
    evidence: "lib/env.ts · .env.example · .vercelignore",
  },
];

/** Los cuatro verbos del concepto, cada uno con lo que lo implementa en este repositorio. */
export const PILLARS = [
  { word: "Build.", how: "next.js · react · postgresql" },
  { word: "Deploy.", how: "vercel · neon · github actions" },
  { word: "Observe.", how: "logs json · /health · audit log" },
  { word: "Secure.", how: "csp · roles mínimos · gitleaks" },
] as const;

/** Hechos contables del despliegue (vercel.json, db/neon/roles.sql, .github/workflows/ci.yml). */
export const SYSTEM_FACTS = [
  { value: "1", label: "aplicación Next.js" },
  { value: "2", label: "roles de PostgreSQL" },
  { value: String(SECURITY_CONTROLS.length), label: "controles de seguridad, cada uno con su fichero" },
  { value: String(PIPELINE.length - 1), label: "etapas antes de producción" },
] as const;
