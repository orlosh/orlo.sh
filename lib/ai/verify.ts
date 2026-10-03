/**
 * Verificación de citas: cada afirmación de la IA sobre el candidato debe venir con una cita
 * literal del CV, y aquí se comprueba que esa cita existe de verdad. Lo que no se encuentra se
 * marca como no verificado y la UI lo enseña así: la IA no puede colar experiencia inventada.
 */

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim();
}

const SHINGLE = 5;

/**
 * ¿Aparece la cita en el texto? Exacta (tras normalizar) o, para citas largas, si al menos el
 * 60 % de sus fragmentos de 5 palabras están en el texto (tolera puntuación y cortes).
 */
export function quoteInSource(quote: string, source: string): boolean {
  const q = normalize(quote);
  const src = normalize(source);
  if (q.length < 12 || !src) return false;
  if (src.includes(q)) return true;
  const words = q.split(" ");
  if (words.length < SHINGLE + 2) return false;
  let hits = 0;
  let total = 0;
  for (let i = 0; i + SHINGLE <= words.length; i++) {
    total++;
    if (src.includes(words.slice(i, i + SHINGLE).join(" "))) hits++;
  }
  return hits / total >= 0.6;
}

export function verifyEvidence<T extends { evidence?: string }>(items: T[] | undefined, source: string): (T & { verified: boolean })[] {
  return (items ?? []).map((i) => ({ ...i, verified: !!i.evidence && quoteInSource(i.evidence, source) }));
}
