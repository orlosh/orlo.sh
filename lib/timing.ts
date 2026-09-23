/**
 * Ejecuta una función asíncrona e informa de cuánto tardó y cuándo terminó
 * (para el recibo de la petición).
 */
export async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number; at: string }> {
  const started = performance.now();
  const value = await fn();
  return { value, ms: Math.max(1, Math.round(performance.now() - started)), at: new Date().toISOString() };
}
