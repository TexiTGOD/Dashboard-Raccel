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
  const [producto, setProducto] = useState("");
  const [valorContrato, setValorContrato] = useState("");
  const [cuotas, setCuotas] = useState("1");
  const [moneda, setMoneda] = useState("USD");
  const [primerMonto, setPrimerMonto] = useState("");
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
    const valor = Number(valorContrato);
    const cuotasN = Number(cuotas);
    const primer = Number(primerMonto);
    if (!valor || valor <= 0) return toast.error("Poné un valor de contrato válido.");
    if (!cuotasN || cuotasN < 1) return toast.error("Las cuotas tienen que ser 1 o más.");
    if (!primer || primer <= 0) return toast.error("Poné el monto del primer pago.");

    start(async () => {
      const res = await createManualSale({
        bookingId,
        leadId,
        email_comprador: email,
        nombre_comprador: nombre,
        producto,
        valor_contrato: valor,
        cuotas_total: cuotasN,
        moneda,
        primer_pago_monto: primer,
        primer_pago_metodo: metodo,
      });
      if ("error" in res) toast.error("No se pudo cargar: " + res.error);
      else {
        toast.success("Venta cargada");
        setOpen(false);
      }
    });
  }

  return (
    <div className="space-y-4">
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
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="s-producto">Producto</Label>
          <Input
            id="s-producto"
            value={producto}
            onChange={(e) => setProducto(e.target.value)}
            placeholder="Programa vendido"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-valor">Valor del contrato</Label>
          <Input
            id="s-valor"
            inputMode="decimal"
            className="font-mono"
            value={valorContrato}
            onChange={(e) => setValorContrato(e.target.value)}
            placeholder="2500"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-cuotas">Cuotas</Label>
          <Input
            id="s-cuotas"
            inputMode="numeric"
            className="font-mono"
            value={cuotas}
            onChange={(e) => setCuotas(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <div className="micro-label">Primer pago recibido</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="s-primer">Monto</Label>
            <Input
              id="s-primer"
              inputMode="decimal"
              className="font-mono"
              value={primerMonto}
              onChange={(e) => setPrimerMonto(e.target.value)}
              placeholder="833"
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
