export function fmtFecha(iso: string | null): string {
  if (!iso) return "Sin fecha";
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtMonto(monto: number | null, moneda: string | null): string {
  if (monto == null) return "—";
  return `${moneda ?? "USD"} ${Number(monto).toLocaleString("es-AR")}`;
}

export function fmtInt(v: number | null | undefined): string {
  if (v == null) return "—";
  return Number(v).toLocaleString("es-AR");
}

export function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${(Number(v) * 100).toFixed(1)}%`;
}

// Fecha corta solo día/mes (para tablas).
export function fmtDia(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}
