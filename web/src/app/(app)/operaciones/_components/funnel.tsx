import { fmtInt, fmtMonto, fmtPct } from "@/lib/format";
import { MetricLabel } from "./metric-label";
import { DEFS } from "@/lib/metric-defs";
import type { MetricDef } from "@/lib/metric-defs";
import type { Kpis } from "@/lib/dashboard";

// Embudo como cards: cada etapa (Leads → Agendas → Atendidas → Ventas) es una
// card con su número grande. Las tasas de conversión viven ENTRE las cards,
// conectándolas y bien legibles (no texto diminuto). La tasa de agenda es la
// conversión principal del bloque (más peso); calificados es sub-línea de Leads.

function Stage({ label, def, value, sub }: { label: string; def?: MetricDef; value: number; sub?: string }) {
  return (
    <div className="flex-1 rounded-lg border border-border bg-card p-5">
      <MetricLabel label={label} def={def} />
      <div className="mt-2 font-mono text-4xl leading-none text-foreground">{fmtInt(value)}</div>
      {sub && <div className="mt-2 font-mono text-[11px] leading-snug text-[var(--text-muted)]">{sub}</div>}
    </div>
  );
}

function Conv({
  label,
  def,
  rate,
  primary,
  incompleto,
}: {
  label: string;
  def?: MetricDef;
  rate: number | null;
  primary?: boolean;
  incompleto?: boolean;
}) {
  return (
    <div className="flex items-center justify-center py-1 lg:w-28 lg:py-0">
      <div className="text-center">
        <span aria-hidden className="mb-1 block text-lg leading-none text-[var(--text-muted)]">
          <span className="lg:hidden">↓</span>
          <span className="hidden lg:inline">→</span>
        </span>
        <div className="micro-label leading-tight">{def ? <MetricLabel label={label} def={def} /> : label}</div>
        <div className={`mt-1 font-mono text-foreground ${primary ? "text-xl" : "text-lg"}`}>
          {rate == null ? "—" : fmtPct(rate)}
          {incompleto ? "*" : ""}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="micro-label">{label}</div>
      <div className="mt-0.5 font-mono text-base text-foreground">{value}</div>
    </div>
  );
}

export function Funnel({ K }: { K: Kpis }) {
  const califSub =
    `${fmtInt(K.calificados)} calif · ${K.tasa_calificacion == null ? "—" : fmtPct(K.tasa_calificacion)}` +
    (K.sin_responder > 0 ? ` · ${fmtInt(K.sin_responder)} s/resp` : "");

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch lg:gap-1">
        <Stage label="Leads" def={DEFS.leads} value={K.leads} sub={califSub} />
        <Conv label="Tasa de agenda" def={DEFS.tasa_agenda} rate={K.tasa_agenda} primary />
        <Stage label="Agendas" def={DEFS.agendas} value={K.agendas} />
        <Conv label="Show-up" def={DEFS.show_rate} rate={K.show_rate} incompleto={K.pendientes > 0} />
        <Stage label="Atendidas" def={DEFS.atendidas} value={K.atendidas} />
        <Conv label="Close" def={DEFS.close_rate_atendidas} rate={K.close_rate_atendidas} />
        <Stage label="Ventas" def={DEFS.ventas} value={K.ventas} />
      </div>

      <div className="flex flex-wrap gap-x-10 gap-y-3 border-t border-border pt-4">
        <Stat label="AOV (ticket)" value={fmtMonto(K.aov, "USD")} />
        <Stat label="Close (agendadas)" value={fmtPct(K.close_rate_agendadas)} />
        {K.canceladas > 0 && <Stat label="Canceladas" value={fmtInt(K.canceladas)} />}
      </div>

      {K.pendientes > 0 && (
        <p className="font-mono text-[11px] text-warning">
          * show-up incompleto — {fmtInt(K.pendientes)} llamada(s) pasadas sin desenlace cargado
        </p>
      )}
    </div>
  );
}
