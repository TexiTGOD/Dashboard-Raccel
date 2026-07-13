"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { DOLOR_LABEL } from "@/lib/types";

type ColType = "text" | "int" | "money" | "date" | "pct" | "dolor";
interface Col {
  key: string;
  label: string;
  type: ColType;
  total?: boolean;
}

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

function DataTable({ rows, cols }: { rows: Record<string, unknown>[]; cols: Col[] }) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [dir, setDir] = useState<"asc" | "desc">("desc");

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

  const totals = cols.map((c) =>
    c.total ? rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0) : null,
  );

  function toggle(key: string) {
    if (key === sortKey) setDir(dir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setDir("desc"); }
  }

  if (rows.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">Sin registros en el período.</p>;
  }

  const hasTotals = totals.some((t) => t != null);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {cols.map((c) => (
              <TableHead
                key={c.key}
                onClick={() => toggle(c.key)}
                className={`cursor-pointer select-none whitespace-nowrap ${c.type === "text" || c.type === "dolor" || c.type === "date" ? "text-left" : "text-right"}`}
              >
                <span className="micro-label">{c.label}</span>
                {sortKey === c.key && <span className="ml-1 text-primary">{dir === "asc" ? "↑" : "↓"}</span>}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((r, i) => {
            const bookingId = r["booking_id"] as string | null;
            return (
              <TableRow
                key={i}
                onClick={() => bookingId && router.push(`/closer/${bookingId}`)}
                className={bookingId ? "cursor-pointer" : ""}
              >
                {cols.map((c) => (
                  <TableCell
                    key={c.key}
                    className={`whitespace-nowrap font-mono ${c.type === "text" || c.type === "dolor" || c.type === "date" ? "text-left" : "text-right"} ${c.total || c.key === "monto" ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {fmtCell(r[c.key], c.type)}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
        {hasTotals && (
          <TableFooter>
            <TableRow>
              {cols.map((c, idx) => (
                <TableCell
                  key={c.key}
                  className={`whitespace-nowrap font-mono ${c.type === "text" || c.type === "dolor" || c.type === "date" ? "text-left" : "text-right"} text-foreground`}
                >
                  {idx === 0 ? `Total · ${rows.length}` : totals[idx] != null ? fmtCell(totals[idx], c.type) : ""}
                </TableCell>
              ))}
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}

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
    { key: "fecha", label: "Fecha", type: "date" },
    { key: "comprador", label: "Comprador", type: "text" },
    { key: "producto", label: "Producto", type: "text" },
    { key: "closer", label: "Closer", type: "text" },
    { key: "valor_contrato", label: "Facturación", type: "money", total: true },
    { key: "cash_collected", label: "Cash", type: "money", total: true },
  ] as Col[],
  llamadas: [
    { key: "fecha", label: "Fecha", type: "date" },
    { key: "lead_nombre", label: "Lead", type: "text" },
    { key: "ig", label: "@IG", type: "text" },
    { key: "closer", label: "Closer", type: "text" },
    { key: "estado", label: "Estado", type: "text" },
    { key: "resultado", label: "Resultado", type: "text" },
  ] as Col[],
  leads: [
    { key: "fecha", label: "Fecha", type: "date" },
    { key: "nombre", label: "Nombre", type: "text" },
    { key: "ig", label: "@IG", type: "text" },
    { key: "pieza", label: "Pieza", type: "text" },
    { key: "dolor", label: "Dolor", type: "dolor" },
    { key: "conciencia", label: "Concien.", type: "int" },
    { key: "econ_calificacion", label: "Econ.", type: "text" },
    { key: "estado_funnel", label: "Funnel", type: "text" },
  ] as Col[],
};

export function RegistrosTables({
  pagos,
  ventas,
  llamadas,
  leads,
}: {
  pagos: Record<string, unknown>[];
  ventas: Record<string, unknown>[];
  llamadas: Record<string, unknown>[];
  leads: Record<string, unknown>[];
}) {
  return (
    <Tabs defaultValue="pagos">
      <TabsList>
        <TabsTrigger value="pagos">Pagos</TabsTrigger>
        <TabsTrigger value="ventas">Ventas</TabsTrigger>
        <TabsTrigger value="llamadas">Llamadas</TabsTrigger>
        <TabsTrigger value="leads">Leads</TabsTrigger>
      </TabsList>
      <TabsContent value="pagos"><DataTable rows={pagos} cols={COLS.pagos} /></TabsContent>
      <TabsContent value="ventas"><DataTable rows={ventas} cols={COLS.ventas} /></TabsContent>
      <TabsContent value="llamadas"><DataTable rows={llamadas} cols={COLS.llamadas} /></TabsContent>
      <TabsContent value="leads"><DataTable rows={leads} cols={COLS.leads} /></TabsContent>
    </Tabs>
  );
}
