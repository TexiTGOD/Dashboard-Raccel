"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
}: {
  rows: Record<string, unknown>[];
  cols: Col[];
  totalCount: number; // total real (count agregado en la base, sin el cap de 1000)
  totalLabel: string; // "leads" | "llamadas" | "ventas" | "pagos"
  sums?: Record<string, number>; // sumas agregadas por columna (facturación, cash…)
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
    return <p className="py-4 text-sm text-muted-foreground">Sin registros en el período.</p>;
  }

  const alignOf = (t: ColType) => (t === "text" || t === "dolor" || t === "date" ? "text-left" : "text-right");
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
                  className={`cursor-pointer select-none whitespace-nowrap ${alignOf(c.type)}`}
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
                        className={`whitespace-nowrap font-mono ${alignOf(c.type)} ${c.total || c.key === "monto" ? "text-foreground" : "text-muted-foreground"} ${isEdit ? "p-0" : ""}`}
                      >
                        {isEdit && c.edit && editId ? (
                          <EditableCell value={r[c.key]} spec={c.edit} id={editId} colType={c.type} />
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
                  <TableCell key={c.key} className={`whitespace-nowrap font-mono ${alignOf(c.type)} text-foreground`}>
                    {idx === 0 ? `Total: ${fmtInt(totalCount)} ${totalLabel}` : ct != null ? fmtCell(ct, c.type) : ""}
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
    { key: "monto", label: "Monto", type: "money", total: true },
  ] as Col[],
  ventas: [
    { key: "fecha", label: "Cierre", type: "date", edit: { kind: "date", entity: "sale", field: "fecha_cierre", idKey: "sale_id" } },
    { key: "comprador", label: "Comprador", type: "text" },
    { key: "producto", label: "Producto", type: "text" },
    { key: "closer", label: "Closer", type: "text", edit: { kind: "text", entity: "sale", field: "closer", idKey: "sale_id" } },
    { key: "valor_contrato", label: "Facturación", type: "money", total: true },
    { key: "cash_collected", label: "Cash", type: "money", total: true },
  ] as Col[],
  llamadas: [
    { key: "fecha", label: "Fecha", type: "date" },
    { key: "lead_nombre", label: "Lead", type: "text" },
    { key: "ig", label: "@IG", type: "text" },
    { key: "closer", label: "Closer", type: "text", edit: { kind: "text", entity: "booking", field: "closer", idKey: "booking_id" } },
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

export function RegistrosTables({
  pagos,
  ventas,
  llamadas,
  leads,
  counts,
}: {
  pagos: Record<string, unknown>[];
  ventas: Record<string, unknown>[];
  llamadas: Record<string, unknown>[];
  leads: Record<string, unknown>[];
  counts: Counts;
}) {
  return (
    <div className="space-y-3">
      <p className="font-mono text-[11px] text-[var(--text-muted)]">
        Las celdas subrayadas son editables: click para cambiar pieza, dolor, conciencia, closer, cierre,
        estado o resultado. Cada cambio queda registrado (quién y cuándo).
      </p>
      <Tabs defaultValue="pagos">
        <TabsList>
          <TabsTrigger value="pagos">Pagos</TabsTrigger>
          <TabsTrigger value="ventas">Ventas</TabsTrigger>
          <TabsTrigger value="llamadas">Llamadas</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
        </TabsList>
        <TabsContent value="pagos">
          <DataTable rows={pagos} cols={COLS.pagos} totalCount={counts.pagos} totalLabel="pagos"
            sums={{ monto: counts.pagos_cash }} />
        </TabsContent>
        <TabsContent value="ventas">
          <DataTable rows={ventas} cols={COLS.ventas} totalCount={counts.ventas} totalLabel="ventas"
            sums={{ valor_contrato: counts.ventas_facturacion, cash_collected: counts.ventas_cash }} />
        </TabsContent>
        <TabsContent value="llamadas">
          <DataTable rows={llamadas} cols={COLS.llamadas} totalCount={counts.llamadas} totalLabel="llamadas" />
        </TabsContent>
        <TabsContent value="leads">
          <DataTable rows={leads} cols={COLS.leads} totalCount={counts.leads} totalLabel="leads" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
