import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Cifrado de las claves de la API de Gemini en reposo (AES-256-GCM). La clave de cifrado se
 * deriva con HKDF del secreto del servidor que ya existe (BETTER_AUTH_SECRET): no hace falta
 * ninguna variable nueva. Si ese secreto se rota, las claves guardadas dejan de poder
 * descifrarse y el panel pide volver a introducirlas.
 */

const VERSION = "v1";

function deriveKey(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "orlo:ai-keys", "gemini-api-keys:v1", 32));
}

export function encryptSecret(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(":");
}

/** null si el texto está manipulado o se cifró con otro secreto. */
export function decryptSecret(payload: string, secret: string): string | null {
  const [version, iv, tag, data] = payload.split(":");
  if (version !== VERSION || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Solo los 4 últimos caracteres llegan al navegador. */
export const last4 = (key: string) => key.slice(-4);
