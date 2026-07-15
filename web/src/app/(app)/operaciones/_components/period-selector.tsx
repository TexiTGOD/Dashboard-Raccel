"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ymd, parseYmd, presets, type Period } from "@/lib/period";

const WEEKDAYS = ["lu", "ma", "mi", "ju", "vi", "sá", "do"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const monthStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
const t = (d: Date) => d.getTime();

function MonthGrid({
  month,
  desde,
  hasta,
  onPick,
}: {
  month: Date; // primer día del mes a mostrar
  desde: Date | null;
  hasta: Date | null;
  onPick: (d: Date) => void;
}) {
  const y = month.getUTCFullYear();
  const m = month.getUTCMonth();
  const first = new Date(Date.UTC(y, m, 1));
  const offset = (first.getUTCDay() + 6) % 7; // lunes primero
  const dias = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const n = new Date();
  const hoy = ymd(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())));

  const cells: (Date | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= dias; d++) cells.push(new Date(Date.UTC(y, m, d)));

  return (
    <div className="w-56">
      <div className="mb-2 text-center font-mono text-xs capitalize text-foreground">
        {MESES[m]} {y}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="text-center font-mono text-[10px] text-[var(--text-muted)]">
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const inRange = desde && hasta && t(d) >= t(desde) && t(d) <= t(hasta);
          const isEnd = (desde && t(d) === t(desde)) || (hasta && t(d) === t(hasta));
          const isToday = ymd(d) === hoy;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onPick(d)}
              className={[
                "h-7 rounded font-mono text-xs transition-colors",
                isEnd
                  ? "bg-primary text-primary-foreground"
                  : inRange
                    ? "bg-[var(--neon-wash)] text-foreground"
                    : "text-muted-foreground hover:bg-[var(--surface-elevated)]",
                isToday && !isEnd ? "ring-1 ring-inset ring-border" : "",
              ].join(" ")}
            >
              {d.getUTCDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function RangePicker({ period }: { period: Period }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [desde, setDesde] = useState<Date | null>(parseYmd(period.desde));
  const [hasta, setHasta] = useState<Date | null>(parseYmd(period.hasta));
  const [view, setView] = useState<Date>(monthStart(parseYmd(period.desde)));

  function abrir() {
    setDesde(parseYmd(period.desde));
    setHasta(parseYmd(period.hasta));
    setView(monthStart(parseYmd(period.desde)));
    setOpen(true);
  }

  function pick(d: Date) {
    if (!desde || (desde && hasta)) {
      setDesde(d);
      setHasta(null);
    } else if (t(d) < t(desde)) {
      setDesde(d);
    } else {
      setHasta(d);
    }
  }

  function navegar(dDesde: string, dHasta: string) {
    router.push(`${pathname}?desde=${dDesde}&hasta=${dHasta}`);
    setOpen(false);
  }

  function aplicar() {
    if (!desde) return;
    navegar(ymd(desde), ymd(hasta ?? desde));
  }

  return (
    <div className="relative">
      <Button variant="outline" className="w-64 justify-between font-mono capitalize" onClick={abrir}>
        <span className="truncate">{period.label}</span>
        <span className="text-[var(--text-muted)]">📅</span>
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 flex flex-col gap-3 rounded-md border border-border bg-[var(--surface-elevated)] p-4 shadow-lg sm:flex-row">
            {/* Presets */}
            <div className="flex shrink-0 flex-col gap-1 sm:w-40 sm:border-r sm:border-border sm:pr-3">
              {presets().map((p) => {
                const activo = period.desde === p.desde && period.hasta === p.hasta;
                return (
                  <Button
                    key={p.key}
                    variant={activo ? "secondary" : "ghost"}
                    size="sm"
                    className="justify-start"
                    onClick={() => navegar(p.desde, p.hasta)}
                  >
                    {p.label}
                  </Button>
                );
              })}
            </div>

            {/* Calendario (dos meses) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="icon-sm" onClick={() => setView(addMonths(view, -1))}>
                  ‹
                </Button>
                <span className="font-mono text-[11px] text-[var(--text-muted)]">
                  {desde ? ymd(desde) : "—"} → {hasta ? ymd(hasta) : "…"}
                </span>
                <Button variant="ghost" size="icon-sm" onClick={() => setView(addMonths(view, 1))}>
                  ›
                </Button>
              </div>
              <div className="flex flex-col gap-4 sm:flex-row">
                <MonthGrid month={view} desde={desde} hasta={hasta} onPick={pick} />
                <MonthGrid month={addMonths(view, 1)} desde={desde} hasta={hasta} onPick={pick} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={aplicar} disabled={!desde}>
                  Aplicar
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
