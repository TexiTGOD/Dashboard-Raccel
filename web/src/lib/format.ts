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
