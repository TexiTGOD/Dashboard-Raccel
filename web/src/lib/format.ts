// FECHAS Y HORAS: todo el negocio opera en hora Argentina. Vercel corre en UTC y el
// browser en la zona de quien mira, así que NUNCA se formatea una fecha sin zona:
// toLocaleString/toLocaleDateString/getHours/getDate sin timeZone explícito
// muestran la hora UTC en el servidor (una llamada de las 15:00 salía "06:00 p. m.").
// Todo lo que muestra o calcula un día/hora pasa por acá.
export const TZ_AR = "America/Argentina/Buenos_Aires";

// Argentina no tiene horario de verano desde 2009: siempre UTC-3.
const OFFSET_AR = "-03:00";

// "2026-09-21" (columna `date`, sin hora). No es un instante: NO se convierte de zona
// (new Date("2026-09-21") es medianoche UTC y en Argentina caería el día anterior).
const SOLO_DIA = /^\d{4}-\d{2}-\d{2}$/;

const fmtDiaHoraAR = new Intl.DateTimeFormat("es-AR", {
  timeZone: TZ_AR,
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const fmtDiaAR = new Intl.DateTimeFormat("es-AR", { timeZone: TZ_AR, day: "2-digit", month: "short" });
// Un día calendario sin hora se arma en UTC y se formatea en UTC: cero corrimiento.
const fmtDiaPuro = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", day: "2-digit", month: "short" });
// en-CA da YYYY-MM-DD.
const fmtYmdAR = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ_AR,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function aDate(iso: string): Date | null {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function diaPuro(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Día y hora en Argentina: "21 sept, 03:00 p. m.". Un `date` sin hora sale solo como día. */
export function fmtFecha(iso: string | null): string {
  if (!iso) return "Sin fecha";
  if (SOLO_DIA.test(iso)) return fmtDiaPuro.format(diaPuro(iso));
  const d = aDate(iso);
  return d ? fmtDiaHoraAR.format(d) : "—";
}

/** Solo día/mes en Argentina (para tablas): "21 sept". */
export function fmtDia(iso: string | null): string {
  if (!iso) return "—";
  if (SOLO_DIA.test(iso)) return fmtDiaPuro.format(diaPuro(iso));
  const d = aDate(iso);
  return d ? fmtDiaAR.format(d) : "—";
}

/** Día calendario ARGENTINO (YYYY-MM-DD) de un instante. Un `date` puro vuelve igual. "" si es inválido. */
export function diaArg(iso: string | null | undefined): string {
  if (!iso) return "";
  if (SOLO_DIA.test(iso)) return iso;
  const d = aDate(iso);
  return d ? fmtYmdAR.format(d) : "";
}

/** Hoy en Argentina (YYYY-MM-DD), no el día UTC del servidor. */
export function hoyArg(now: Date = new Date()): string {
  return fmtYmdAR.format(now);
}

/**
 * Instante a guardar cuando el usuario elige un DÍA (input type=date) para una
 * columna timestamptz: el día que eligió es el día Argentina, no UTC. Si es hoy,
 * ahora; si es un día pasado, el último minuto de ese día (así nunca queda antes de
 * una llamada del mismo día ni en el futuro).
 */
export function instanteDeDiaArg(dia: string, now: Date = new Date()): string {
  if (dia === hoyArg(now)) return now.toISOString();
  return new Date(`${dia}T23:59:00${OFFSET_AR}`).toISOString();
}

// Formateador único de moneda: sin decimales sueltos, separador de miles.
export function fmtMonto(monto: number | null, moneda: string | null): string {
  if (monto == null) return "—";
  return `${moneda ?? "USD"} ${Number(monto).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

// Monto sin el prefijo de moneda (para tablas densas: la moneda va en el header).
export function fmtNum(monto: number | null): string {
  if (monto == null) return "—";
  return Number(monto).toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

export function fmtInt(v: number | null | undefined): string {
  if (v == null) return "—";
  return Number(v).toLocaleString("es-AR");
}

export function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${(Number(v) * 100).toFixed(1)}%`;
}

// Número con decimales (para "ritmo": 3,1 leads/día). Único lugar para números
// fraccionarios sueltos.
export function fmtDec(v: number | null | undefined, digits = 1): string {
  if (v == null) return "—";
  return Number(v).toLocaleString("es-AR", { maximumFractionDigits: digits });
}
