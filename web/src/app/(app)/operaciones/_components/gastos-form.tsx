"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addGasto } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CATEGORIAS = ["closer", "setter", "editor", "ads", "herramientas", "otro"];

export function GastosForm({ periodo }: { periodo: string }) {
  const [categoria, setCategoria] = useState("ads");
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [pending, start] = useTransition();

  function guardar() {
    const num = Number(monto);
    if (!num || num <= 0) return toast.error("Poné un monto válido.");
    start(async () => {
      const res = await addGasto({ periodo, categoria, concepto, monto: num });
      if ("error" in res) toast.error("No se pudo cargar: " + res.error);
      else {
        toast.success("Gasto cargado");
        setConcepto("");
        setMonto("");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="space-y-1.5">
        <Label>Categoría</Label>
        <Select value={categoria} onValueChange={(v) => setCategoria(v ?? "otro")}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIAS.map((c) => (
              <SelectItem key={c} value={c} className="capitalize">
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex-1 space-y-1.5">
        <Label htmlFor="g-concepto">Concepto</Label>
        <Input id="g-concepto" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Ej: ManyChat" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="g-monto">Monto</Label>
        <Input
          id="g-monto"
          inputMode="decimal"
          className="w-32 font-mono"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          placeholder="1200"
        />
      </div>
      <Button variant="outline" onClick={guardar} disabled={pending}>
        {pending ? "Cargando…" : "Cargar gasto"}
      </Button>
    </div>
  );
}
