const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2025-12-01" → "dic 2025". Se parsea a mano: ninguna zona horaria puede desplazar el mes. */
export function formatMonth(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function formatPeriod(start: string, end: string | null): string {
  return `${formatMonth(start)} — ${end ? formatMonth(end) : "actualidad"}`;
}

/** Meses completos entre dos fechas, incluido el mes de inicio. */
export function monthsBetween(start: string, end: string | null, today = new Date()): number {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end ? end.split("-").map(Number) : [today.getUTCFullYear(), today.getUTCMonth() + 1];
  return Math.max(1, (ey - sy) * 12 + (em - sm) + 1);
}

export function formatDuration(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts = [];
  if (y) parts.push(`${y} ${y === 1 ? "año" : "años"}`);
  if (m) parts.push(`${m} ${m === 1 ? "mes" : "meses"}`);
  return parts.join(" ");
}

/** Timestamp ISO → "21 sep 2026" (UTC, estable entre servidor y cliente). */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatYears(start: number | null, end: number | null): string {
  if (start && end) return start === end ? String(end) : `${start} — ${end}`;
  return String(end ?? start ?? "");
}
