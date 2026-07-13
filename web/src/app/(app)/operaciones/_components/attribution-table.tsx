"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MetricLabel } from "./metric-label";
import { DEFS } from "@/lib/metric-defs";
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

type ColType = "text" | "int" | "money";
const cols: { key: keyof AtribRow; label: string; type: ColType; def?: (typeof DEFS)[string] }[] = [
  { key: "pieza_origen", label: "Pieza", type: "text" },
  { key: "leads", label: "Leads", type: "int" },
  { key: "calificados", label: "Calif.", type: "int" },
  { key: "agendas", label: "Agendas", type: "int" },
  { key: "atendidas", label: "Atend.", type: "int" },
  { key: "ventas", label: "Ventas", type: "int" },
  { key: "facturacion", label: "Facturación", type: "money" },
  { key: "cash_collected", label: "Cash", type: "money" },
  { key: "cash_por_lead", label: "Cash/lead", type: "money", def: DEFS.cash_por_lead },
];

function fmtCell(v: string | number, type: ColType) {
  if (type === "text") return String(v);
  if (type === "money") return fmtMonto(Number(v), "USD");
  return fmtInt(Number(v));
}

export function AttributionTable({ rows }: { rows: AtribRow[] }) {
  const [sortKey, setSortKey] = useState<keyof AtribRow>("cash_por_lead");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const data = [...rows].map((r) => ({
    ...r,
    leads: Number(r.leads),
    calificados: Number(r.calificados),
    agendas: Number(r.agendas),
    atendidas: Number(r.atendidas),
    ventas: Number(r.ventas),
    facturacion: Number(r.facturacion),
    cash_collected: Number(r.cash_collected),
    cash_por_lead: Number(r.cash_por_lead),
  }));

  data.sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    let cmp = 0;
    if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
    else cmp = String(av).localeCompare(String(bv));
    return dir === "asc" ? cmp : -cmp;
  });

  function toggle(key: keyof AtribRow) {
    if (key === sortKey) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setDir(key === "pieza_origen" ? "asc" : "desc");
    }
  }

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin datos de atribución en el período.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {cols.map((c) => (
              <TableHead
                key={c.key}
                onClick={() => toggle(c.key)}
                className={`cursor-pointer select-none whitespace-nowrap ${
                  c.type === "text" ? "text-left" : "text-right"
                } ${c.key === "cash_por_lead" ? "text-foreground" : ""}`}
              >
                <span className="inline-flex items-center gap-1">
                  {c.def ? <MetricLabel label={c.label} def={c.def} /> : <span className="micro-label">{c.label}</span>}
                  {sortKey === c.key && <span className="text-primary">{dir === "asc" ? "↑" : "↓"}</span>}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((r) => (
            <TableRow key={r.pieza_origen}>
              {cols.map((c) => (
                <TableCell
                  key={c.key}
                  className={`whitespace-nowrap font-mono ${c.type === "text" ? "text-left" : "text-right"} ${
                    c.key === "cash_por_lead" ? "text-foreground" : "text-muted-foreground"
                  } ${c.key === "pieza_origen" ? "text-foreground" : ""}`}
                >
                  {fmtCell(r[c.key], c.type)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
