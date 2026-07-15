// Manejo del período del dashboard: un RANGO de fechas [desde, hasta] (inclusive).
// Las métricas de conteo/plata corren sobre el rango (RPC con [p_start, p_end)).
// Metas y ritmo son MENSUALES: solo aplican cuando el rango es un mes calendario
// completo (esMesCompleto). Para un rango custom se ocultan (ver páginas).

export interface Period {
  startStr: string; // YYYY-MM-DD inclusive (= desde). RPC p_start.
  endStr: string; // YYYY-MM-DD exclusive (hasta + 1 día). RPC p_end.
  desde: string; // YYYY-MM-DD inclusive
  hasta: string; // YYYY-MM-DD inclusive (último día del rango)
  label: string; // etiqueta legible del rango
  esMesCompleto: boolean; // el rango es exactamente un mes calendario
  isCurrent: boolean; // esMesCompleto && es el mes en curso
  daysLeft: number; // días que quedan del mes (solo si isCurrent)
  // Mes de referencia (el del `desde`) para las páginas mensuales (metas, gastos):
  mesInicioStr: string; // YYYY-MM-01 del mes de `desde`
  mesFinStr: string; // YYYY-MM-01 del mes siguiente (exclusive)
  mesLabel: string; // "julio 2026"
}

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const parseYmd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const isYmd = (s?: string): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const addDays = (d: Date, n: number) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
const monthStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const monthEndExcl = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
const sameMonth = (a: Date, b: Date) =>
  a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();

// "Hoy" tomado de la fecha local pero fijado a medianoche UTC, para que las
// comparaciones de fecha no se corran por timezone.
export function todayUTC(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const mesNombre = (d: Date) => `${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

function buildPeriod(desdeD: Date, hastaD: Date): Period {
  if (hastaD < desdeD) [desdeD, hastaD] = [hastaD, desdeD];
  const endExcl = addDays(hastaD, 1);
  const ms = monthStart(desdeD);
  const meExcl = monthEndExcl(desdeD);
  const esMesCompleto = ymd(desdeD) === ymd(ms) && ymd(endExcl) === ymd(meExcl);
  const today = todayUTC();
  const isCurrent = esMesCompleto && ymd(ms) === ymd(monthStart(today));
  const daysLeft = isCurrent
    ? Math.max(Math.round((meExcl.getTime() - today.getTime()) / 86400000), 0)
    : 0;

  const label = esMesCompleto
    ? mesNombre(desdeD)
    : sameMonth(desdeD, hastaD)
      ? `${desdeD.getUTCDate()}–${hastaD.getUTCDate()} ${mesNombre(desdeD)}`
      : `${desdeD.getUTCDate()} ${MESES[desdeD.getUTCMonth()].slice(0, 3)} – ${hastaD.getUTCDate()} ${MESES[hastaD.getUTCMonth()].slice(0, 3)} ${hastaD.getUTCFullYear()}`;

  return {
    startStr: ymd(desdeD),
    endStr: ymd(endExcl),
    desde: ymd(desdeD),
    hasta: ymd(hastaD),
    label,
    esMesCompleto,
    isCurrent,
    daysLeft,
    mesInicioStr: ymd(ms),
    mesFinStr: ymd(meExcl),
    mesLabel: mesNombre(desdeD),
  };
}

export function periodFromParams(sp: { desde?: string; hasta?: string; periodo?: string }): Period {
  if (isYmd(sp.desde) && isYmd(sp.hasta)) {
    return buildPeriod(parseYmd(sp.desde), parseYmd(sp.hasta));
  }
  // Legacy: ?periodo=YYYY-MM → ese mes calendario completo.
  if (sp.periodo && /^\d{4}-\d{2}$/.test(sp.periodo)) {
    const [y, m] = sp.periodo.split("-").map(Number);
    return buildPeriod(new Date(Date.UTC(y, m - 1, 1)), new Date(Date.UTC(y, m, 0)));
  }
  // Default: mes en curso.
  const t = todayUTC();
  return buildPeriod(monthStart(t), addDays(monthEndExcl(t), -1));
}

export interface Preset {
  key: string;
  label: string;
  desde: string;
  hasta: string;
}

// Presets tipo sitios de vuelos. Todos en fechas cerradas [desde, hasta].
export function presets(): Preset[] {
  const t = todayUTC();
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth();
  const q = Math.floor(m / 3) * 3;
  const mk = (a: Date, b: Date, key: string, label: string): Preset => ({
    key, label, desde: ymd(a), hasta: ymd(b),
  });
  return [
    mk(new Date(Date.UTC(y, m, 1)), new Date(Date.UTC(y, m + 1, 0)), "mes", "Este mes"),
    mk(new Date(Date.UTC(y, m - 1, 1)), new Date(Date.UTC(y, m, 0)), "mes_pasado", "Mes pasado"),
    mk(addDays(t, -29), t, "30d", "Últimos 30 días"),
    mk(new Date(Date.UTC(y, q, 1)), new Date(Date.UTC(y, q + 3, 0)), "trim", "Este trimestre"),
    mk(new Date(Date.UTC(y, 0, 1)), new Date(Date.UTC(y, 11, 31)), "anio", "Este año"),
  ];
}
