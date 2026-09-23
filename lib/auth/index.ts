import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { env } from "@/lib/env";

const { APP_URL, BETTER_AUTH_SECRET, TRUSTED_IP_HEADER } = env();

/**
 * Autenticación para el único administrador.
 *
 * - Email + contraseña, hasheada con scrypt por Better Auth. Sin registro público:
 *   la cuenta de admin se crea desde la CLI (scripts/create-admin.ts).
 * - Las sesiones viven en PostgreSQL (revocables), referenciadas por una cookie
 *   HttpOnly y SameSite=Lax que además es Secure siempre que APP_URL sea https.
 * - Se rechazan las peticiones cuyo Origin no es APP_URL (CSRF).
 * - El inicio de sesión tiene rate limit por IP, con contadores guardados en PostgreSQL
 *   para que un reinicio no resetee una ventana de fuerza bruta en curso.
 */
export const auth = betterAuth({
  baseURL: APP_URL,
  secret: BETTER_AUTH_SECRET,
  trustedOrigins: [APP_URL],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      rateLimit: schema.rateLimit,
    },
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  user: {
    additionalFields: {
      // Nunca se acepta desde la entrada del cliente; solo lo fija la CLI.
      role: { type: "string", required: false, defaultValue: "viewer", input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 8, // sesión de trabajo de 8 h
    updateAge: 60 * 60, // renovación deslizante como mucho cada hora
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/email": { window: 60 * 5, max: 5 },
    },
  },
  advanced: {
    useSecureCookies: APP_URL.startsWith("https://"),
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    ipAddress: {
      // Misma regla que lib/security/client-ip.ts: solo la cabecera que escribe
      // una capa de confianza. Sin ella, Better Auth usa un único contador
      // compartido: más estricto, nunca más permisivo.
      ipAddressHeaders: TRUSTED_IP_HEADER ? [TRUSTED_IP_HEADER] : [],
    },
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
