"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addPayment } from "../actions";
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
import type { MetodoPago } from "@/lib/types";

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

export function AddPaymentForm({
  bookingId,
  saleId,
  moneda,
  nextCuota,
}: {
  bookingId: string;
  saleId: string;
  moneda: string;
  nextCuota: number;
}) {
  const [open, setOpen] = useState(false);
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<MetodoPago>("transferencia");
  const [fecha, setFecha] = useState(hoy());
  const [cuota, setCuota] = useState(String(nextCuota));
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Registrar pago
      </Button>
    );
  }

  function submit() {
    const montoN = Number(monto);
    if (!montoN || montoN <= 0) return toast.error("Poné un monto válido.");
    start(async () => {
      const res = await addPayment({
        bookingId,
        saleId,
        monto: montoN,
        moneda,
        metodo_pago: metodo,
        fecha: fecha ? new Date(fecha).toISOString() : new Date().toISOString(),
        numero_cuota: cuota ? Number(cuota) : null,
      });
      if ("error" in res) toast.error("No se pudo registrar: " + res.error);
      else {
        toast.success("Pago registrado");
        setOpen(false);
        setMonto("");
      }
    });
  }

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="micro-label">Registrar pago</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="p-monto">Monto</Label>
          <Input
            id="p-monto"
            inputMode="decimal"
            className="font-mono"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="833"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-cuota">Nro. de cuota</Label>
          <Input
            id="p-cuota"
            inputMode="numeric"
            className="font-mono"
            value={cuota}
            onChange={(e) => setCuota(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-fecha">Fecha</Label>
          <Input
            id="p-fecha"
            type="date"
            className="font-mono"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Método</Label>
          <Select value={metodo} onValueChange={(v) => setMetodo((v as MetodoPago) ?? "transferencia")}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="transferencia">Transferencia</SelectItem>
              <SelectItem value="hotmart">Hotmart</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={submit} disabled={pending}>
          {pending ? "Registrando…" : "Guardar pago"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
