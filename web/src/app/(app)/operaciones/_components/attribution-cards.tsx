"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { fmtInt, fmtMonto } from "@/lib/format";
import {
  claveMes,
  leerPieza,
  resolverAnio,
  type CategoriaPieza,
} from "@/lib/pieza";

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

// El cash/lead es LA métrica (qué contenido trae la gente que paga). El orden se
// aplica DENTRO de cada grupo del timeline: la estructura primaria es la fecha.
const SORTS: { key: keyof AtribRow; label: string }[] = [
  { key: "cash_por_lead", label: "Cash/lead" },
  { key: "cash_collected", label: "Cash" },
  { key: "leads", label: "Leads" },
  { key: "ventas", label: "Ventas" },
];

// Color por categoría. Vive en el borde izquierdo y en el punto del timeline,
// nunca en relleno: los semánticos del tema son solo para badges de estado.
const COLOR: Record<CategoriaPieza, { borde: string; texto: string; fondo: string }> = {
  reel: { borde: "border-l-pieza-reel", texto: "text-pieza-reel", fondo: "bg-pieza-reel" },
  posteo: { borde: "border-l-pieza-posteo", texto: "text-pieza-posteo", fondo: "bg-pieza-posteo" },
  historias: { borde: "border-l-pieza-historias", texto: "text-pieza-historias", fondo: "bg-pieza-historias" },
  seguimientos: { borde: "border-l-pieza-seguimientos", texto: "text-pieza-seguimientos", fondo: "bg-pieza-seguimientos" },
};
const SIN_COLOR = { borde: "border-l-border", texto: "text-muted-foreground", fondo: "bg-border" };

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** Fila enriquecida con lo que el timeline necesita para ubicarla. */
interface Item extends AtribRow {
  label: string;
  categoria: CategoriaPieza | null;
  /** null = sin fecha (Seguimientos, inválidas, formato no reconocido). */
  orden: number | null; // timestamp para ordenar
  dia: number | null;
  mes: number | null;
  anio: number | null;
  anioInferido: boolean;
  invalida: boolean;
}

function Metric({ label, value, fuerte }: { label: string; value: string; fuerte?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="micro-label">{label}</span>
      <span
        className={`font-mono text-sm tabular-nums ${fuerte ? "text-foreground" : "text-muted-foreground"}`}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Card colapsable. Cerrada muestra lo mínimo para escanear (pieza + leads);
 * abierta, todas las métricas. Varias pueden estar abiertas a la vez: comparar dos
 * piezas es el caso de uso real, y un acordeón exclusivo lo impediría.
 */
function PiezaCard({ it, abierta, onToggle }: { it: Item; abierta: boolean; onToggle: () => void }) {
  const c = it.categoria ? COLOR[it.categoria] : SIN_COLOR;
  return (
    <div className={`rounded-lg border border-border border-l-2 bg-card ${it.invalida ? "border-l-danger" : c.borde}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierta}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-elevated)]"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className={`font-mono text-xs ${it.invalida ? "text-danger" : "text-muted-foreground"}`}>
            {abierta ? "▾" : "▸"}
          </span>
          <span
            className={`truncate font-mono text-sm ${it.invalida ? "text-danger" : "text-foreground"}`}
          >
            {it.label}
          </span>
          {it.invalida && (
            <span className="shrink-0 rounded-full border border-danger px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-danger">
              inválida
            </span>
          )}
        </span>
        <span className="shrink-0 font-mono text-sm tabular-nums text-foreground">
          {fmtInt(it.leads)} <span className="micro-label">leads</span>
        </span>
      </button>

      {abierta && (
        <div className="space-y-2 border-t border-border px-4 py-3">
          <Metric label="Cash / lead" value={usd(it.cash_por_lead)} fuerte />
          <Metric label="Leads" value={fmtInt(it.leads)} />
          <Metric label="Agendas" value={fmtInt(it.agendas)} />
          <Metric label="Ventas" value={fmtInt(it.ventas)} />
          <Metric label="Cash" value={usd(it.cash_collected)} />
          <Metric label="Facturación" value={usd(it.facturacion)} />
        </div>
      )}
    </div>
  );
}

/** Un nodo del timeline: la fecha a la izquierda, las piezas de ese día a la derecha. */
function NodoFecha({
  items,
  abiertas,
  toggle,
}: {
  items: Item[];
  abiertas: Set<string>;
  toggle: (k: string) => void;
}) {
  const p = items[0];
  const c = p.categoria ? COLOR[p.categoria] : SIN_COLOR;
  const fecha =
    p.dia == null || p.mes == null
      ? "sin fecha"
      : `${String(p.dia).padStart(2, "0")}/${String(p.mes).padStart(2, "0")}`;

  return (
    <div className="flex gap-4">
      {/* Riel del timeline: punto del color de la categoría + línea */}
      <div className="flex w-20 shrink-0 flex-col items-end pt-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {p.anioInferido && <span title="Año inferido: el formato viejo no lo incluye">~</span>}
            {fecha}
          </span>
          <span className={`h-2 w-2 shrink-0 rounded-full ${c.fondo}`} />
        </div>
        {p.anio != null && (
          <span className="mt-0.5 font-mono text-[10px] text-[var(--text-muted)]">
            {p.anioInferido ? "~" : ""}
            {p.anio}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2 border-l border-border pb-6 pl-4">
        {items.map((it) => (
          <PiezaCard
            key={it.pieza_origen}
            it={it}
            abierta={abiertas.has(it.pieza_origen)}
            onToggle={() => toggle(it.pieza_origen)}
          />
        ))}
      </div>
    </div>
  );
}

export function AttributionCards({
  rows,
  desde,
  hasta,
}: {
  rows: AtribRow[];
  /** Límites del período activo (YYYY-MM-DD): deciden qué es "del mes" y qué "anterior". */
  desde: string;
  hasta: string;
}) {
  const [sortKey, setSortKey] = useState<keyof AtribRow>("cash_por_lead");
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const [anterioresAbierto, setAnterioresAbierto] = useState(false);

  const toggle = (k: string) =>
    setAbiertas((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const { seguimientos, delPeriodo, anteriores, totales } = useMemo(() => {
    const ref = new Date(`${hasta}T00:00:00Z`);
    const dDesde = new Date(`${desde}T00:00:00Z`).getTime();
    const dHasta = ref.getTime();

    const items: Item[] = rows.map((r) => {
      const p = leerPieza(r.pieza_origen);
      const f = p.fecha;
      const res = f ? resolverAnio(f, ref) : null;
      const orden = f && res ? Date.UTC(res.anio, f.mes - 1, f.dia) : null;
      return {
        ...r,
        leads: Number(r.leads),
        agendas: Number(r.agendas),
        ventas: Number(r.ventas),
        facturacion: Number(r.facturacion),
        cash_collected: Number(r.cash_collected),
        cash_por_lead: Number(r.cash_por_lead),
        label: p.label,
        categoria: p.categoria,
        orden,
        dia: f?.dia ?? null,
        mes: f?.mes ?? null,
        anio: res?.anio ?? null,
        anioInferido: res?.inferido ?? false,
        invalida: r.pieza_origen === "Pieza inválida",
      };
    });

    const totales = {
      piezas: items.length,
      leads: items.reduce((s, r) => s + r.leads, 0),
      cash: items.reduce((s, r) => s + r.cash_collected, 0),
      ventas: items.reduce((s, r) => s + r.ventas, 0),
    };

    // Seguimientos va aparte: no tiene fecha, no entra al timeline.
    const seguimientos = items.filter((i) => i.categoria === "seguimientos");
    const conFecha = items.filter((i) => i.categoria !== "seguimientos");

    // "Del período" = la pieza se publicó dentro del rango elegido. El resto son
    // piezas viejas que igual aparecen porque trajeron leads en el período.
    const dentro = (i: Item) => i.orden != null && i.orden >= dDesde && i.orden <= dHasta;
    return {
      seguimientos,
      delPeriodo: conFecha.filter(dentro),
      anteriores: conFecha.filter((i) => !dentro(i)),
      totales,
    };
  }, [rows, desde, hasta]);

  // Agrupa por día y ordena: días más recientes arriba; dentro del día, por la
  // métrica elegida (el timeline manda, el orden desempata).
  const agrupar = (items: Item[]) => {
    const porDia = new Map<string, Item[]>();
    for (const i of items) {
      const k = i.orden != null && i.mes != null && i.anio != null
        ? `${claveMes(i.anio, i.mes)}-${String(i.dia).padStart(2, "0")}`
        : "sin-fecha";
      if (!porDia.has(k)) porDia.set(k, []);
      porDia.get(k)!.push(i);
    }
    for (const v of porDia.values()) v.sort((a, b) => Number(b[sortKey]) - Number(a[sortKey]));
    return [...porDia.entries()].sort(([, a], [, b]) => (b[0].orden ?? -Infinity) - (a[0].orden ?? -Infinity));
  };

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin datos de atribución en el período.</p>;
  }

  const mesLabel = (() => {
    const d = new Date(`${desde}T00:00:00Z`);
    return `${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  })();

  return (
    <div className="space-y-6">
      {/* Totales de integridad + orden (cuadran con las cards de Operaciones). */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-muted-foreground">
          <span>{totales.piezas} piezas</span>
          <span>Leads {fmtInt(totales.leads)}</span>
          <span>Cash {usd(totales.cash)}</span>
          <span>Ventas {fmtInt(totales.ventas)}</span>
          <span className="text-foreground">
            Cash/lead {usd(totales.leads > 0 ? totales.cash / totales.leads : 0)}
          </span>
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

      {/* Seguimientos: sin fecha, sección propia arriba. */}
      {seguimientos.length > 0 && (
        <section className="space-y-2">
          <h2 className="section-title border-b border-border pb-2">Seguimientos</h2>
          {seguimientos.map((it) => (
            <PiezaCard
              key={it.pieza_origen}
              it={it}
              abierta={abiertas.has(it.pieza_origen)}
              onToggle={() => toggle(it.pieza_origen)}
            />
          ))}
        </section>
      )}

      <section>
        <h2 className="section-title mb-4 border-b border-border pb-2">Piezas de {mesLabel}</h2>
        {delPeriodo.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ninguna pieza publicada en el período trajo leads. Mirá “Meses anteriores”.
          </p>
        ) : (
          <div>
            {agrupar(delPeriodo).map(([k, items]) => (
              <NodoFecha key={k} items={items} abiertas={abiertas} toggle={toggle} />
            ))}
          </div>
        )}
      </section>

      {/* Piezas viejas que igual trajeron leads en el período. Colapsado por default. */}
      {anteriores.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setAnterioresAbierto((v) => !v)}
            aria-expanded={anterioresAbierto}
            className="flex w-full items-center justify-between gap-3 rounded-md border border-border px-4 py-3 text-left transition-colors hover:bg-[var(--surface-elevated)]"
          >
            <span className="flex items-baseline gap-3">
              <span className="section-title">Meses anteriores</span>
              <span className="font-mono text-xs text-muted-foreground">
                piezas más viejas que siguen trayendo leads
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span className="font-mono text-lg text-foreground">{fmtInt(anteriores.length)}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {anterioresAbierto ? "▲" : "▼"}
              </span>
            </span>
          </button>
          {anterioresAbierto && (
            <div className="mt-4">
              {agrupar(anteriores).map(([k, items]) => (
                <NodoFecha key={k} items={items} abiertas={abiertas} toggle={toggle} />
              ))}
            </div>
          )}
        </section>
      )}

      <p className="font-mono text-[11px] text-[var(--text-muted)]">
        El ~ marca un año inferido: las piezas del formato viejo (REEL_0402) no lo incluyen, se
        deduce el más reciente que caiga en o antes del período.
      </p>
    </div>
  );
}
