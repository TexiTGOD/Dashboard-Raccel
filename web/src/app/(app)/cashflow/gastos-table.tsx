"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addGasto, updateGasto, deleteGasto } from "../operaciones/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtDia, fmtMonto } from "@/lib/format";
import type { GastoRow } from "@/lib/dashboard";

const CATEGORIAS = ["closer", "setter", "editor", "ads", "herramientas", "otro"];

type FieldKind = "date" | "select" | "text" | "money";

// Celda de gasto: click para editar, guarda en blur/Enter (Esc cancela).
function GastoCell({
  value,
  kind,
  display,
  onSave,
}: {
  value: string;
  kind: FieldKind;
  display: string;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState(value);

  function commit(next: string) {
    setEditing(false);
    if (next !== value) onSave(next);
  }
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setRaw(value);
          setEditing(true);
        }}
        className={`w-full rounded px-1 py-0.5 underline decoration-dotted decoration-[var(--text-muted)] underline-offset-2 hover:bg-[var(--surface-elevated)] ${kind === "money" ? "text-right" : "text-left"}`}
      >
        {display}
      </button>
    );
  }
  const cls = "w-full rounded border border-primary bg-[var(--surface-elevated)] px-1 py-0.5 font-mono text-sm outline-none";
  if (kind === "select") {
    return (
      <select autoFocus value={raw} onChange={(e) => commit(e.target.value)} onBlur={() => setEditing(false)} className={`${cls} capitalize`}>
        {CATEGORIAS.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    );
  }
  return (
    <input
      autoFocus
      type={kind === "date" ? "date" : kind === "money" ? "number" : "text"}
      value={raw}
      onChange={(e) => setRaw(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit(raw);
        if (e.key === "Escape") setEditing(false);
      }}
      onBlur={() => commit(raw)}
      className={`${cls} ${kind === "money" ? "text-right" : "text-left"}`}
    />
  );
}

export function GastosTable({ gastos, defaultFecha }: { gastos: GastoRow[]; defaultFecha: string }) {
  const [pending, start] = useTransition();
  // alta
  const [fecha, setFecha] = useState(defaultFecha);
  const [categoria, setCategoria] = useState("ads");
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");

  function edit(id: string, field: string, value: string | number | null) {
    start(async () => {
      const res = await updateGasto({ id, patch: { [field]: value } });
      if ("error" in res) toast.error("No se pudo guardar: " + res.error);
      else toast.success("Guardado");
    });
  }
  function borrar(id: string) {
    if (!confirm("¿Borrar este gasto?")) return;
    start(async () => {
      const res = await deleteGasto({ id });
      if ("error" in res) toast.error("No se pudo borrar: " + res.error);
      else toast.success("Gasto borrado");
    });
  }
  function agregar() {
    const num = Number(monto);
    if (!num || num <= 0) return toast.error("Poné un monto válido.");
    if (!fecha) return toast.error("Poné una fecha.");
    start(async () => {
      const res = await addGasto({ fecha, categoria, concepto, monto: num });
      if ("error" in res) toast.error("No se pudo cargar: " + res.error);
      else {
        toast.success("Gasto cargado");
        setConcepto("");
        setMonto("");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="micro-label text-left">Fecha</TableHead>
              <TableHead className="micro-label text-left">Categoría</TableHead>
              <TableHead className="micro-label text-left">Concepto</TableHead>
              <TableHead className="micro-label text-right">Monto</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {gastos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-4 text-sm text-muted-foreground">
                  Sin gastos en el período.
                </TableCell>
              </TableRow>
            ) : (
              gastos.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="whitespace-nowrap font-mono text-muted-foreground">
                    <GastoCell value={g.fecha} kind="date" display={fmtDia(g.fecha)} onSave={(v) => edit(g.id, "fecha", v)} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono capitalize text-muted-foreground">
                    <GastoCell value={g.categoria} kind="select" display={g.categoria} onSave={(v) => edit(g.id, "categoria", v)} />
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    <GastoCell value={g.concepto ?? ""} kind="text" display={g.concepto || "—"} onSave={(v) => edit(g.id, "concepto", v || null)} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono text-foreground">
                    <GastoCell value={String(g.monto)} kind="money" display={fmtMonto(g.monto, "USD")} onSave={(v) => edit(g.id, "monto", Number(v))} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon-sm" disabled={pending} onClick={() => borrar(g.id)} aria-label="Borrar gasto">
                      ✕
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Alta de gasto */}
      <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <div className="micro-label">Fecha</div>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-40 font-mono" />
        </div>
        <div className="space-y-1">
          <div className="micro-label">Categoría</div>
          <Select value={categoria} onValueChange={(v) => setCategoria(v ?? "otro")}>
            <SelectTrigger className="w-36 capitalize"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIAS.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 space-y-1">
          <div className="micro-label">Concepto</div>
          <Input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Ej: ManyChat" />
        </div>
        <div className="space-y-1">
          <div className="micro-label">Monto</div>
          <Input inputMode="decimal" className="w-28 font-mono" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="1200" />
        </div>
        <Button variant="outline" onClick={agregar} disabled={pending}>
          {pending ? "…" : "Agregar"}
        </Button>
      </div>
    </div>
  );
}
