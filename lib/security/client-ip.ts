/**
 * IP del cliente para rate limiting y auditoría.
 *
 * Solo se lee de una cabecera que haya escrito una capa de confianza
 * (Vercel escribe "x-real-ip" y sobrescribe cualquier valor enviado por el
 * cliente). Sin esa capa, cualquiera podría falsificar la cabecera para
 * esquivar los límites, así que se devuelve null.
 * Si la cabecera trae una cadena de proxies, se toma el primer valor.
 */
export function clientIp(headers: Headers, trustedHeader: string | null): string | null {
  if (!trustedHeader) return null;
  return headers.get(trustedHeader)?.split(",")[0]?.trim() || null;
}
