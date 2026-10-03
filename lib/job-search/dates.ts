/**
 * Aritmética de fechas de calendario ("YYYY-MM-DD"). Se opera siempre en UTC sobre la fecha
 * pura, así que ninguna zona horaria puede desplazar un día; la zona solo decide qué es "hoy".
 */

const DAY = 86_400_000;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Fecha de calendario de un instante en una zona IANA. */
export function dateIn(instant: Date, timeZone: string): string {
  const tz = isValidTimeZone(timeZone) ? timeZone : "UTC";
  // en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    instant,
  );
}

export const todayIn = (timeZone: string, now = new Date()) => dateIn(now, timeZone);

const toUtc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function addDays(iso: string, days: number): string {
  return fromUtc(toUtc(iso) + days * DAY);
}

/** Días de calendario de `from` a `to` (positivo si `to` es posterior). */
export function diffDays(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY);
}

/** 0 = domingo … 6 = sábado. */
export const weekday = (iso: string) => new Date(toUtc(iso)).getUTCDay();
export const isWeekend = (iso: string) => weekday(iso) === 0 || weekday(iso) === 6;

/** Suma días laborables (lunes a viernes). Desde un fin de semana se cuenta a partir del lunes. */
export function addBusinessDays(iso: string, days: number): string {
  let d = iso;
  let left = days;
  while (left > 0) {
    d = addDays(d, 1);
    if (!isWeekend(d)) left--;
  }
  return d;
}

/** Lunes de la semana de `iso`. */
export function weekStart(iso: string): string {
  const wd = weekday(iso);
  return addDays(iso, wd === 0 ? -6 : 1 - wd);
}

/** Días transcurridos entre dos instantes, en fracciones de día. */
export const daysBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / DAY;

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** "2026-10-05" → "lun 5 oct". */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${WEEKDAYS[weekday(iso)]} ${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
}

/** Fecha relativa a hoy: "hoy", "mañana", "ayer", "en 3 d", "hace 4 d". */
export function relativeDay(iso: string | null | undefined, today: string): string {
  if (!iso) return "—";
  const d = diffDays(today, iso);
  if (d === 0) return "hoy";
  if (d === 1) return "mañana";
  if (d === -1) return "ayer";
  return d > 0 ? `en ${d} d` : `hace ${-d} d`;
}

/** Instante → "lun 5 oct · 10:30" en la zona indicada. */
export function formatDateTime(instant: Date | null | undefined, timeZone: string): string {
  if (!instant) return "Sin fecha";
  const tz = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const time = new Intl.DateTimeFormat("es-ES", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(
    instant,
  );
  return `${formatDay(dateIn(instant, tz))} · ${time}`;
}

/**
 * "2026-10-05T10:30" interpretado como hora local de `timeZone` → instante UTC.
 * Se corrige el desfase de la zona en dos pasadas para acertar también en los cambios de hora.
 */
export function zonedToUtc(local: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const tz = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const target = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let guess = target;
  for (let i = 0; i < 2; i++) guess = target - offsetMs(new Date(guess), tz);
  return new Date(guess);
}

function offsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Instante → "2026-10-05T10:30" en la zona indicada (valor para <input type="datetime-local">). */
export function utcToZonedInput(instant: Date | null | undefined, timeZone: string): string {
  if (!instant) return "";
  const tz = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
