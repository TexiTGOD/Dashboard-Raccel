export function fmtFecha(iso: string | null): string {
  if (!iso) return "Sin fecha";
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
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

// Fecha corta solo día/mes (para tablas).
export function fmtDia(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}
