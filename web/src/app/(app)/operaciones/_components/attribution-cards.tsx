"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { fmtInt, fmtMonto } from "@/lib/format";

export interface AtribRow {
  pieza_origen: string;
  leads: number;
  calificados: number;
  agendas: number;
  atendidas: number;
  ventas: number;
  facturacion: number;
  cash_collected: number;
  cash_por_lead: number;
}

const usd = (n: number) => fmtMonto(n, "USD");

// El cash/lead es LA métrica (qué contenido trae la gente que paga). Se destaca
// por escala y posición, no por color (el neón es escaso; la plata no se estiliza).
const SORTS: { key: keyof AtribRow; label: string }[] = [
  { key: "cash_por_lead", label: "Cash/lead" },
  { key: "cash_collected", label: "Cash" },
  { key: "leads", label: "Leads" },
  { key: "ventas", label: "Ventas" },
];

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="micro-label">{label}</span>
      <span className="font-mono text-sm tabular-nums text-muted-foreground">{value}</span>
    </div>
  );
}

function AtribCard({ r }: { r: AtribRow }) {
  const invalida = r.pieza_origen === "Pieza inválida";
  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card p-5 tabular-nums">
      <div className="flex items-center justify-between gap-2">
        <span className={`truncate font-mono text-sm ${invalida ? "text-danger" : "text-foreground"}`}>
          {r.pieza_origen}
        </span>
        {invalida && (
          <span className="shrink-0 rounded-full border border-danger px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-danger">
            inválida
          </span>
        )}
      </div>
      <div className="mt-4">
        <div className="micro-label">Cash / lead</div>
        <div className="mt-1 font-mono text-3xl leading-none tabular-nums text-foreground">{usd(r.cash_por_lead)}</div>
      </div>
      {/* Una sola columna: los valores alinean parejo al borde derecho en todas las cards. */}
      <div className="mt-auto space-y-2 border-t border-border pt-3">
        <Metric label="Leads" value={fmtInt(r.leads)} />
        <Metric label="Ventas" value={fmtInt(r.ventas)} />
        <Metric label="Cash" value={usd(r.cash_collected)} />
        <Metric label="Facturación" value={usd(r.facturacion)} />
      </div>
    </div>
  );
}

export function AttributionCards({ rows }: { rows: AtribRow[] }) {
  const [sortKey, setSortKey] = useState<keyof AtribRow>("cash_por_lead");

  const data = rows.map((r) => ({
    pieza_origen: r.pieza_origen,
    leads: Number(r.leads),
    calificados: Number(r.calificados),
    agendas: Number(r.agendas),
    atendidas: Number(r.atendidas),
    ventas: Number(r.ventas),
    facturacion: Number(r.facturacion),
    cash_collected: Number(r.cash_collected),
    cash_por_lead: Number(r.cash_por_lead),
  }));

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin datos de atribución en el período.</p>;
  }

  const sorted = [...data].sort((a, b) => Number(b[sortKey]) - Number(a[sortKey]));

  // Totales — control de integridad (cuadran con las cards de Operaciones).
  const totLeads = data.reduce((s, r) => s + r.leads, 0);
  const totCash = data.reduce((s, r) => s + r.cash_collected, 0);
  const totVentas = data.reduce((s, r) => s + r.ventas, 0);
  const cashPorLead = totLeads > 0 ? totCash / totLeads : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-muted-foreground">
          <span>{data.length} piezas</span>
          <span>Leads {fmtInt(totLeads)}</span>
          <span>Cash {usd(totCash)}</span>
          <span>Ventas {fmtInt(totVentas)}</span>
          <span className="text-foreground">Cash/lead {usd(cashPorLead)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="micro-label mr-1">Ordenar</span>
          {SORTS.map((s) => (
            <Button
              key={s.key}
              size="sm"
              variant={sortKey === s.key ? "secondary" : "ghost"}
              onClick={() => setSortKey(s.key)}
            >
              {s.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((r) => (
          <AtribCard key={r.pieza_origen} r={r} />
        ))}
      </div>
    </div>
  );
}
