/**
 * Describe a qué servidor apunta una cadena de conexión, sin revelar la contraseña.
 * Los scripts lo imprimen antes de tocar nada: así se ve de un vistazo si se está
 * trabajando contra la base local o contra la de producción.
 */
export function describeTarget(url: string): string {
  try {
    const { hostname, port, pathname, username } = new URL(url);
    const database = pathname.replace(/^\//, "") || "(sin base)";
    const where = hostname === "localhost" || hostname === "127.0.0.1" ? "local" : hostname;
    return `${username}@${where}${port ? `:${port}` : ""}/${database}`;
  } catch {
    return "(cadena de conexión no válida)";
  }
}
