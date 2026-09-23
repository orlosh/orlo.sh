import "server-only";
import { z } from "zod";

/**
 * Entorno del servidor, validado una sola vez al arrancar.
 * Si falta una variable o está mal formada, falla en el arranque en lugar de
 * aparecer como un error confuso en mitad de una petición.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Conexión de runtime: rol con mínimo privilegio (solo DML, sin DDL).
  // En Neon, usar la cadena con pooler (host con "-pooler").
  DATABASE_URL: z.url(),
  // Conexiones máximas por instancia. En serverless cada instancia abre las
  // suyas, así que el valor debe ser bajo para no agotar el límite de Neon.
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
  // Sentencias preparadas con nombre. El pooler de Neon las admite; ponerlo a
  // "false" solo si el pooler devolviera errores de prepared statements.
  DATABASE_PREPARE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  // Origen público del sitio: URLs canónicas, sitemap y comprobación de origen de la auth.
  APP_URL: z.url().default("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET debe tener al menos 32 caracteres"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  APP_VERSION: z.string().default("dev"),
  // Cabecera de la que se toma la IP del cliente (rate limiting y auditoría).
  // Solo debe fijarse cuando la escribe una capa de confianza que sobrescribe
  // lo que envíe el cliente: "x-real-ip" en Vercel, "x-forwarded-for" detrás
  // de Caddy. Vacía = no se confía en ninguna cabecera.
  TRUSTED_IP_HEADER: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]*$/, "Nombre de cabecera no válido")
    .default("")
    .transform((v) => v || null),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/** Muestra el valor recibido para poder depurar, siempre sin la contraseña. */
function redact(value: string | undefined): string {
  if (value === undefined) return "(no definida)";
  if (value.trim() === "") return "(vacía)";
  // Oculta la contraseña haya o no esquema (postgres://user:pw@host o user:pw@host).
  return value.replace(/(^|:\/\/)([^:@/\s]+):[^@/\s]*@/, "$1$2:****@");
}

export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => {
        const name = String(i.path[0] ?? "");
        return `  - ${name}: ${i.message} → recibido ${redact(process.env[name])}`;
      })
      .join("\n");
    // Una variable definida pero vacía suele venir de VAR="$OTRA" con $OTRA sin definir.
    // Además, al existir en el entorno, tiene prioridad sobre el valor del .env.
    const vacias = parsed.error.issues
      .map((i) => String(i.path[0] ?? ""))
      .filter((name) => process.env[name]?.trim() === "");
    const pista = vacias.length
      ? `Hay variables definidas pero vacías (${vacias.join(", ")}): suele pasar al escribir ` +
        "VAR=\"$OTRA\" con $OTRA sin definir en esta terminal. Compruébalo con echo \"$OTRA\". " +
        "Una variable vacía tiene prioridad sobre el .env, así que no se usa el valor local."
      : "Recuerda: las variables definidas delante del comando solo viven en esa terminal, " +
        "y las cadenas de conexión deben ir entre comillas.";
    throw new Error(`Entorno del servidor no válido:\n${issues}\n${pista}`);
  }
  cached = parsed.data;
  return cached;
}
