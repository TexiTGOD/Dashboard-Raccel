// Manejo del período (mes) del dashboard.

export interface Period {
  periodo: string; // "YYYY-MM"
  startStr: string; // "YYYY-MM-01" (para RPC y metas.periodo)
  endStr: string; // primer día del mes siguiente
  label: string; // "julio de 2026"
  isCurrent: boolean;
  daysLeft: number; // días que quedan del mes (0 si no es el mes actual)
  daysInMonth: number;
}

export function periodFromParam(param?: string): Period {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-based
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const [y, m] = param.split("-").map(Number);
    year = y;
    month = m - 1;
  }
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));
  const pad = (n: number) => String(n).padStart(2, "0");
  const isCurrent = year === now.getFullYear() && month === now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysLeft = isCurrent ? Math.max(daysInMonth - now.getDate(), 0) : 0;

  return {
    periodo: `${year}-${pad(month + 1)}`,
    startStr: start.toISOString().slice(0, 10),
    endStr: end.toISOString().slice(0, 10),
    label: start.toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }),
    isCurrent,
    daysLeft,
    daysInMonth,
  };
}

export function monthOptions(count = 12): { value: string; label: string }[] {
  const now = new Date();
  const opts: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    opts.push({
      value,
      label: d.toLocaleDateString("es-AR", { month: "long", year: "numeric" }),
    });
  }
  return opts;
}
