"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createManualSale } from "../actions";
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

export function ManualSaleForm({
  bookingId,
  leadId,
  defaultEmail,
  defaultNombre,
}: {
  bookingId: string;
  leadId: string | null;
  defaultEmail: string;
  defaultNombre: string;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail);
  const [nombre, setNombre] = useState(defaultNombre);
  const [monto, setMonto] = useState("");
  const [moneda, setMoneda] = useState("USD");
  const [metodo, setMetodo] = useState<MetodoPago>("transferencia");
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Todavía no hay una venta cargada para este lead.</p>
        <Button variant="outline" onClick={() => setOpen(true)}>
          Cargar venta manual
        </Button>
      </div>
    );
  }

  function submit() {
    const montoNum = Number(monto);
    if (!montoNum || montoNum <= 0) {
      toast.error("Poné un monto válido.");
      return;
    }
    start(async () => {
      const res = await createManualSale({
        bookingId,
        leadId,
        email_comprador: email,
        nombre_comprador: nombre,
        monto: montoNum,
        moneda,
        metodo_pago: metodo,
      });
      if ("error" in res) toast.error("No se pudo cargar: " + res.error);
      else {
        toast.success("Venta cargada");
        setOpen(false);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="s-email">Email comprador</Label>
          <Input
            id="s-email"
            type="email"
            className="font-mono"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="s-nombre">Nombre comprador</Label>
          <Input id="s-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-monto">Monto</Label>
          <Input
            id="s-monto"
            inputMode="decimal"
            className="font-mono"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="1497"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-moneda">Moneda</Label>
          <Input
            id="s-moneda"
            className="font-mono"
            value={moneda}
            onChange={(e) => setMoneda(e.target.value)}
          />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>Método de pago</Label>
          <Select value={metodo} onValueChange={(v) => setMetodo(v as MetodoPago)}>
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
        <Button variant="outline" onClick={submit} disabled={pending}>
          {pending ? "Cargando…" : "Guardar venta"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
