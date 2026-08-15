"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtFecha, fmtInt, fmtMonto, fmtPct } from "@/lib/format";
import {
  DOLOR_LABEL,
  CONCIENCIA_LABEL,
  ESTADOS_BOOKING,
  RESULTADOS_CALL,
} from "@/lib/types";
import { updateLead, updateBooking, updateSale, updateCallResultado } from "./actions";

type ColType = "text" | "int" | "money" | "date" | "pct" | "dolor";
type EditKind = "text" | "select" | "date" | "int";
type Entity = "lead" | "booking" | "sale" | "call";

interface EditSpec {
  kind: EditKind;
  entity: Entity;
  field: string; // columna real en la DB (para el patch)
  idKey: string; // key en la row con el id de la entidad
  options?: { value: string; label: string }[];
}
interface Col {
  key: string;
  label: string;
  type: ColType;
  total?: boolean;
  /** Peso visual extra (montos): tipografía más grande y color pleno. */
  emph?: boolean;
  /** Render propio de la celda (ej. @IG como link). Pisa el formateo por tipo. */
  render?: (r: Record<string, unknown>) => React.ReactNode;
  edit?: EditSpec;
}

const NUMERIC = new Set(["conciencia"]); // campos que van como número al patch

function fmtCell(v: unknown, type: ColType): string {
  if (v == null || v === "") return "—";
  switch (type) {
    case "money": return fmtMonto(Number(v), "USD");
    case "int": return fmtInt(Number(v));
    case "pct": return fmtPct(Number(v));
    case "date": return fmtFecha(String(v));
    case "dolor": return DOLOR_LABEL[String(v)] ?? String(v);
    default: return String(v);
  }
}

// Valor crudo para el input de edición.
function toRaw(v: unknown, kind: EditKind): string {
  if (v == null) return "";
  if (kind === "date") {
    const d = new Date(String(v));
    return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }
  return String(v);
}

async function saveEdit(spec: EditSpec, id: string, raw: string) {
  const value: string | number | null =
    raw === "" ? null : NUMERIC.has(spec.field) ? Number(raw) : raw;
  switch (spec.entity) {
    case "lead": return updateLead({ leadId: id, patch: { [spec.field]: value } });
    case "booking": return updateBooking({ bookingId: id, patch: { [spec.field]: value } });
    case "sale": return updateSale({ saleId: id, patch: { [spec.field]: value } });
    case "call": return updateCallResultado({ bookingId: id, resultado: String(value ?? "pendiente") });
  }
}

function EditableCell({
  value,
  spec,
  id,
  colType,
}: {
  value: unknown;
  spec: EditSpec;
  id: string;
  colType: ColType;
}) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState("");
  const [pending, start] = useTransition();
  const alignRight = colType === "int" || colType === "money" || colType === "pct";

  function commit(next: string) {
    setEditing(false);
    if (next === toRaw(value, spec.kind)) return; // sin cambio
    start(async () => {
      const res = await saveEdit(spec, id, next);
      if (res && "error" in res) toast.error("No se pudo guardar: " + res.error);
      else toast.success("Guardado");
    });
  }

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => {
          // La fila navega al expediente; el click de edición NO debe burbujear.
          e.stopPropagation();
          e.preventDefault();
          setRaw(toRaw(value, spec.kind));
          setEditing(true);
        }}
        className={`block w-full rounded px-2 py-2 underline decoration-dotted decoration-[var(--text-muted)] underline-offset-2 hover:bg-[var(--surface-elevated)] ${alignRight ? "text-right" : "text-left"}`}
      >
        {pending ? "…" : fmtCell(value, colType)}
      </button>
    );
  }

  const cls =
    "w-full rounded border border-primary bg-[var(--surface-elevated)] px-2 py-1.5 font-mono text-sm outline-none";

  if (spec.kind === "select") {
    return (
      <select
        autoFocus
        value={raw}
        onClick={stop}
        onChange={(e) => commit(e.target.value)}
        onBlur={() => setEditing(false)}
        className={cls}
      >
        <option value="">—</option>
        {spec.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      autoFocus
      type={spec.kind === "date" ? "date" : spec.kind === "int" ? "number" : "text"}
      value={raw}
      onClick={stop}
      onChange={(e) => setRaw(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit(raw);
        if (e.key === "Escape") setEditing(false);
      }}
      onBlur={() => commit(raw)}
      className={`${cls} ${alignRight ? "text-right" : "text-left"}`}
    />
  );
}

const PAGE_SIZE = 50;

// Key estable por fila (id de la entidad) — necesario con paginación: si usáramos
// el índice, el estado de edición de una celda "saltaría" de fila al cambiar de página.
function rowKey(r: Record<string, unknown>, i: number): string {
  return String(r.payment_id ?? r.lead_id ?? r.sale_id ?? r.booking_id ?? i);
}

function DataTable({
  rows,
  cols,
  totalCount,
  totalLabel,
  sums,
  densidad = "normal",
  filtradas,
}: {
  rows: Record<string, unknown>[];
  cols: Col[];
  totalCount: number; // total real (count agregado en la base, sin el cap de 1000)
  totalLabel: string; // "leads" | "llamadas" | "ventas" | "pagos"
  sums?: Record<string, number>; // sumas agregadas por columna (facturación, cash…)
  densidad?: "normal" | "amplia"; // "amplia" = filas altas y aireadas
  /** Si hay filtros client-side activos: cuántas filas quedaron (para "N de M"). */
  filtradas?: number;
}) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = cols.find((c) => c.key === sortKey);
    const numeric = col && ["int", "money", "pct"].includes(col.type);
    return [...rows].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      let cmp: number;
      if (numeric) cmp = Number(av ?? 0) - Number(bv ?? 0);
      else cmp = String(av ?? "").localeCompare(String(bv ?? ""));
      return dir === "asc" ? cmp : -cmp;
    });
  }, [rows, cols, sortKey, dir]);

  // Total de columna: la suma agregada de la base (correcta a cualquier volumen);
  // si no vino, cae a la suma del array traído.
  const colTotal = (c: Col): number | null => {
    if (!c.total) return null;
    if (sums && c.key in sums) return sums[c.key];
    return rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
  };

  function toggle(key: string) {
    if (key === sortKey) setDir(dir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setDir("desc"); }
    setPage(0);
  }

  if (rows.length === 0) {
    // Con filtros activos esto es "no hay coincidencias"; sin filtros, delata que
    // el período tiene filas que no llegaron (truncamiento). El texto sirve a los
    // dos casos sin afirmar cuál es.
    return (
      <p className="py-4 text-sm text-muted-foreground">
        {totalCount > 0
          ? `Ninguna fila para mostrar. El período tiene ${fmtInt(totalCount)} ${totalLabel}.`
          : "Sin registros en el período."}
      </p>
    );
  }

  const alignOf = (t: ColType) => (t === "text" || t === "dolor" || t === "date" ? "text-left" : "text-right");
  // Densidad: "amplia" da filas altas y aireadas (Llamadas, estilo de la referencia).
  const padCelda = densidad === "amplia" ? "px-4 py-4" : "px-3 py-3";
  const padHead = densidad === "amplia" ? "px-4 py-3" : "px-3 py-2";
  // Paginación client-side: renderiza solo la página actual (no manda 1.000+ filas
  // al DOM). El orden y las sumas siguen sobre todas las filas traídas.
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const from = clampedPage * PAGE_SIZE;
  const visible = sorted.slice(from, from + PAGE_SIZE);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {cols.map((c) => (
                <TableHead
                  key={c.key}
                  onClick={() => toggle(c.key)}
                  className={`cursor-pointer select-none whitespace-nowrap ${padHead} ${alignOf(c.type)}`}
                >
                  <span className="micro-label">{c.label}</span>
                  {sortKey === c.key && <span className="ml-1 text-primary">{dir === "asc" ? "↑" : "↓"}</span>}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((r, i) => {
              const bookingId = r["booking_id"] as string | null;
              return (
                <TableRow
                  key={rowKey(r, from + i)}
                  onClick={() => bookingId && router.push(`/closer/${bookingId}`)}
                  className={bookingId ? "cursor-pointer" : ""}
                >
                  {cols.map((c) => {
                    const editId = c.edit ? (r[c.edit.idKey] as string | null) : null;
                    const isEdit = Boolean(c.edit && editId);
                    return (
                      <TableCell
                        key={c.key}
                        // En celdas editables, frenar el click acá evita que la fila
                        // navegue (cubre también el padding alrededor del control).
                        onClick={isEdit ? (e) => e.stopPropagation() : undefined}
                        className={[
                          "whitespace-nowrap font-mono",
                          alignOf(c.type),
                          // Los montos pesan: tipografía más grande y color pleno.
                          c.emph
                            ? "text-base font-medium text-foreground tabular-nums"
                            : c.total || c.key === "monto"
                              ? "text-foreground"
                              : "text-muted-foreground",
                          isEdit ? "p-0" : padCelda,
                        ].join(" ")}
                      >
                        {isEdit && c.edit && editId ? (
                          <EditableCell value={r[c.key]} spec={c.edit} id={editId} colType={c.type} />
                        ) : c.render ? (
                          c.render(r)
                        ) : (
                          fmtCell(r[c.key], c.type)
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
          {/* Fila de totales: siempre visible. El conteo y las sumas vienen de la
              base (agregado, sin cap). Si difiere de "Mostrando … de N", hubo truncamiento. */}
          <TableFooter>
            <TableRow>
              {cols.map((c, idx) => {
                const ct = colTotal(c);
                return (
                  <TableCell
                    key={c.key}
                    className={[
                      "whitespace-nowrap font-mono text-foreground",
                      padCelda,
                      alignOf(c.type),
                      c.emph ? "text-lg font-semibold tabular-nums" : "",
                    ].join(" ")}
                  >
                    {idx === 0
                      ? // Con filtros activos: "N de M" (N filtrado / M total del mes en SQL).
                        filtradas != null && filtradas !== totalCount
                        ? `Total: ${fmtInt(filtradas)} de ${fmtInt(totalCount)} ${totalLabel}`
                        : `Total: ${fmtInt(totalCount)} ${totalLabel}`
                      : ct != null
                        ? fmtCell(ct, c.type)
                        : ""}
                  </TableCell>
                );
              })}
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      {pageCount > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-xs text-muted-foreground">
          <span>
            Mostrando {fmtInt(from + 1)}–{fmtInt(Math.min(from + PAGE_SIZE, sorted.length))} de {fmtInt(sorted.length)}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(clampedPage - 1)}
              disabled={clampedPage === 0}
              className="rounded border border-border px-2 py-1 hover:bg-[var(--surface-elevated)] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
            >
              ‹ Anterior
            </button>
            <span>Página {clampedPage + 1} / {pageCount}</span>
            <button
              type="button"
              onClick={() => setPage(clampedPage + 1)}
              disabled={clampedPage >= pageCount - 1}
              className="rounded border border-border px-2 py-1 hover:bg-[var(--surface-elevated)] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
            >
              Siguiente ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// @handle como link al perfil. El handle ya viene normalizado (sin @, lowercase)
// por el trigger de la base; igual se limpia por las dudas.
function IgLink({ handle }: { handle: unknown }) {
  const h = String(handle ?? "").trim().replace(/^@+/, "");
  if (!h) return <>—</>;
  return (
    <a
      href={`https://instagram.com/${h}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()} // la fila navega al expediente; el link no
      className="text-primary underline decoration-dotted underline-offset-2 hover:text-primary/80"
    >
      @{h}
    </a>
  );
}

/**
 * Caja de la página: título, contador y contenido con alto máximo + scroll propio.
 * `colapsable` arranca cerrada (el box de Leads, que trae cientos de filas).
 */
function Box({
  titulo,
  nota,
  contador,
  colapsable,
  barra,
  children,
}: {
  titulo: string;
  nota?: string;
  contador: number;
  colapsable?: boolean;
  /** Controles fijos (filtros): quedan FUERA del área con scroll. */
  barra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(!colapsable);
  const cabecera = (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div className="flex items-baseline gap-3">
        <span className="section-title">{titulo}</span>
        <span className="font-mono text-sm text-muted-foreground">{fmtInt(contador)}</span>
      </div>
      {nota && <span className="font-mono text-[11px] text-[var(--text-muted)]">{nota}</span>}
    </div>
  );

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        {colapsable ? (
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            className="-mx-2 w-full rounded px-2 py-1 text-left transition-colors hover:bg-[var(--surface-elevated)]"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{abierto ? "▾" : "▸"}</span>
              <div className="flex-1">{cabecera}</div>
            </div>
          </button>
        ) : (
          cabecera
        )}
        {abierto && (
          <>
            {barra}
            {/* Alto máximo + scroll interno: cada box se desplaza por su cuenta. */}
            <div className="max-h-[26rem] overflow-y-auto">{children}</div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

const dolorOpts = Object.entries(DOLOR_LABEL).map(([value, label]) => ({ value, label }));
const concienciaOpts = [1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: CONCIENCIA_LABEL[n] }));
const estadoOpts = ESTADOS_BOOKING.map((e) => ({ value: e, label: e.replace("_", " ") }));
const resultadoOpts = RESULTADOS_CALL.map((r) => ({ value: r, label: r.replace("_", " ") }));

const COLS = {
  pagos: [
    { key: "fecha", label: "Fecha", type: "date" },
    { key: "comprador", label: "Comprador", type: "text" },
    { key: "producto", label: "Producto", type: "text" },
    { key: "numero_cuota", label: "Cuota", type: "int" },
    { key: "metodo_pago", label: "Método", type: "text" },
    { key: "monto", label: "Monto", type: "money", total: true, emph: true },
  ] as Col[],
  ventas: [
    { key: "fecha", label: "Cierre", type: "date", edit: { kind: "date", entity: "sale", field: "fecha_cierre", idKey: "sale_id" } },
    { key: "comprador", label: "Comprador", type: "text" },
    { key: "producto", label: "Producto", type: "text" },
    { key: "closer", label: "Closer", type: "text", edit: { kind: "text", entity: "sale", field: "closer", idKey: "sale_id" } },
    { key: "valor_contrato", label: "Facturación", type: "money", total: true, emph: true },
    { key: "cash_collected", label: "Cash", type: "money", total: true, emph: true },
  ] as Col[],
  llamadas: [
    { key: "lead_nombre", label: "Nombre", type: "text" },
    { key: "ig", label: "@IG", type: "text", render: (r) => <IgLink handle={r.ig} /> },
    { key: "whatsapp", label: "WhatsApp", type: "text" },
    { key: "pieza", label: "Origen", type: "text" },
    { key: "closer", label: "Closer", type: "text", edit: { kind: "text", entity: "booking", field: "closer", idKey: "booking_id" } },
    { key: "fecha", label: "Fecha", type: "date" },
    { key: "estado", label: "Estado", type: "text", edit: { kind: "select", entity: "booking", field: "estado", idKey: "booking_id", options: estadoOpts } },
    { key: "resultado", label: "Resultado", type: "text", edit: { kind: "select", entity: "call", field: "resultado", idKey: "booking_id", options: resultadoOpts } },
  ] as Col[],
  leads: [
    { key: "fecha", label: "Fecha", type: "date" },
    { key: "nombre", label: "Nombre", type: "text" },
    { key: "ig", label: "@IG", type: "text" },
    { key: "pieza", label: "Pieza", type: "text", edit: { kind: "text", entity: "lead", field: "pieza_origen", idKey: "lead_id" } },
    { key: "dolor", label: "Dolor", type: "dolor", edit: { kind: "select", entity: "lead", field: "dolor", idKey: "lead_id", options: dolorOpts } },
    { key: "conciencia", label: "Concien.", type: "int", edit: { kind: "select", entity: "lead", field: "conciencia", idKey: "lead_id", options: concienciaOpts } },
    { key: "econ_calificacion", label: "Econ.", type: "text" },
    { key: "estado_funnel", label: "Funnel", type: "text" },
  ] as Col[],
};

interface Counts {
  pagos: number;
  ventas: number;
  llamadas: number;
  leads: number;
  ventas_facturacion: number;
  ventas_cash: number;
  pagos_cash: number;
}

// Tipos de pieza del filtro de Leads. 'welcome' se compara entero (es el flujo de
// bienvenida); el resto son prefijos de la pieza (REEL_0402, CARR_1103, …).
const TIPOS_PIEZA = [
  { value: "todos", label: "Todas las piezas" },
  { value: "welcome", label: "welcome" },
  { value: "REEL", label: "REEL" },
  { value: "CARR", label: "CARR" },
  { value: "HIST", label: "HIST" },
];

const soloFecha = (v: unknown) => String(v ?? "").slice(0, 10); // ISO -> YYYY-MM-DD

/** Barra de filtros del box de Leads (client-side, sobre las filas del mes). */
function FiltrosLeads({
  texto, setTexto, tipo, setTipo, desde, setDesde, hasta, setHasta, min, max, onLimpiar, activos,
}: {
  texto: string; setTexto: (v: string) => void;
  tipo: string; setTipo: (v: string) => void;
  desde: string; setDesde: (v: string) => void;
  hasta: string; setHasta: (v: string) => void;
  min: string; max: string;
  onLimpiar: () => void; activos: boolean;
}) {
  const input =
    "rounded border border-input bg-[var(--surface-elevated)] px-2 py-1.5 font-mono text-xs text-foreground outline-none focus:border-primary";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar nombre, @ig o pieza…"
        className={`${input} min-w-[14rem] flex-1`}
      />
      <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={input}>
        {TIPOS_PIEZA.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
      <label className="flex items-center gap-1.5">
        <span className="micro-label">Desde</span>
        <input type="date" value={desde} min={min} max={max} onChange={(e) => setDesde(e.target.value)} className={input} />
      </label>
      <label className="flex items-center gap-1.5">
        <span className="micro-label">Hasta</span>
        <input type="date" value={hasta} min={min} max={max} onChange={(e) => setHasta(e.target.value)} className={input} />
      </label>
      {activos && (
        <button
          type="button"
          onClick={onLimpiar}
          className="rounded border border-border px-2 py-1.5 font-mono text-xs text-muted-foreground hover:bg-[var(--surface-elevated)]"
        >
          Limpiar
        </button>
      )}
    </div>
  );
}

export function RegistrosTables({
  pagos,
  ventas,
  llamadas,
  leads,
  counts,
  desde: desdeMes,
  hasta: hastaMes,
}: {
  pagos: Record<string, unknown>[];
  ventas: Record<string, unknown>[];
  llamadas: Record<string, unknown>[];
  leads: Record<string, unknown>[];
  counts: Counts;
  desde: string; // YYYY-MM-DD, límite inferior del período activo
  hasta: string; // YYYY-MM-DD, límite superior (inclusive)
}) {
  const [texto, setTexto] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const filtrosActivos = Boolean(texto || tipo !== "todos" || desde || hasta);

  // Filtrado client-side sobre las filas del mes ya traídas. Los tres criterios
  // se combinan con AND.
  const leadsFiltrados = useMemo(() => {
    if (!filtrosActivos) return leads;
    const q = texto.trim().toLowerCase();
    return leads.filter((r) => {
      if (q) {
        const campos = [r.nombre, r.ig, r.pieza].map((v) => String(v ?? "").toLowerCase());
        if (!campos.some((c) => c.includes(q))) return false;
      }
      if (tipo !== "todos") {
        const p = String(r.pieza ?? "").trim();
        if (tipo === "welcome") {
          if (p.toLowerCase() !== "welcome") return false;
        } else if (!p.toUpperCase().startsWith(`${tipo}_`)) return false;
      }
      const f = soloFecha(r.fecha);
      if (desde && (!f || f < desde)) return false;
      if (hasta && (!f || f > hasta)) return false;
      return true;
    });
  }, [leads, texto, tipo, desde, hasta, filtrosActivos]);

  return (
    <div className="space-y-4">
      <p className="font-mono text-[11px] text-[var(--text-muted)]">
        Las celdas subrayadas son editables: click para cambiar pieza, dolor, conciencia, closer, cierre,
        estado o resultado. Cada cambio queda registrado (quién y cuándo).
      </p>

      <Box titulo="Pagos" contador={counts.pagos} nota="El total coincide con el Cash Collected del período.">
        <DataTable
          rows={pagos} cols={COLS.pagos} totalCount={counts.pagos} totalLabel="pagos"
          filtradas={pagos.length} sums={{ monto: counts.pagos_cash }}
        />
      </Box>

      <Box titulo="Ventas" contador={counts.ventas}>
        <DataTable
          rows={ventas} cols={COLS.ventas} totalCount={counts.ventas} totalLabel="ventas"
          filtradas={ventas.length}
          sums={{ valor_contrato: counts.ventas_facturacion, cash_collected: counts.ventas_cash }}
        />
      </Box>

      <Box titulo="Llamadas" contador={counts.llamadas}>
        <DataTable
          rows={llamadas} cols={COLS.llamadas} totalCount={counts.llamadas} totalLabel="llamadas"
          filtradas={llamadas.length} densidad="amplia"
        />
      </Box>

      {/* Leads arranca colapsado: es el box de más volumen (cientos de filas). */}
      <Box
        titulo="Leads"
        contador={counts.leads}
        colapsable
        nota="Click para expandir"
        barra={
          <FiltrosLeads
            texto={texto} setTexto={setTexto}
            tipo={tipo} setTipo={setTipo}
            desde={desde} setDesde={setDesde}
            hasta={hasta} setHasta={setHasta}
            min={desdeMes} max={hastaMes}
            activos={filtrosActivos}
            onLimpiar={() => { setTexto(""); setTipo("todos"); setDesde(""); setHasta(""); }}
          />
        }
      >
        <DataTable
          rows={leadsFiltrados} cols={COLS.leads} totalCount={counts.leads} totalLabel="leads"
          filtradas={leadsFiltrados.length}
        />
      </Box>
    </div>
  );
}
