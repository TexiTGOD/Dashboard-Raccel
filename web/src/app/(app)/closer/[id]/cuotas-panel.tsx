"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { marcarCuotaCobrada } from "../actions";
import { Button } from "@/components/ui/button";
import { fmtFecha, fmtMonto } from "@/lib/format";
import type { Cuota } from "@/lib/types";

function estadoCuota(c: Cuota): "cobrada" | "vencida" | "pendiente" {
  if (c.payment_id) return "cobrada";
  if (c.fecha_vencimiento && new Date(c.fecha_vencimiento).getTime() < Date.now()) return "vencida";
  return "pendiente";
}

export function CuotasPanel({
  bookingId,
  moneda,
  cuotas,
}: {
  bookingId: string;
  moneda: string;
  cuotas: Cuota[];
}) {
  const [pending, start] = useTransition();
  const [marcando, setMarcando] = useState<string | null>(null);

  // Una sola cuota = pago único (no "Cuota 1", que sugiere que hay más).
  const pagoUnico = cuotas.length === 1;
  const etiqueta = (c: Cuota) => (pagoUnico ? "Pago único" : `Cuota ${c.numero_cuota}`);

  function marcar(c: Cuota) {
    setMarcando(c.id);
    start(async () => {
      const res = await marcarCuotaCobrada({
        bookingId,
        saleId: c.sale_id,
        cuotaId: c.id,
        numeroCuota: c.numero_cuota,
        monto: Number(c.monto_esperado ?? 0),
        moneda,
        metodo_pago: "transferencia",
        fecha: new Date().toISOString(),
      });
      setMarcando(null);
      if ("error" in res) toast.error("No se pudo registrar: " + res.error);
      else toast.success(pagoUnico ? "Pago cobrado" : `Cuota ${c.numero_cuota} cobrada`);
    });
  }

  if (cuotas.length === 0) {
    return <p className="text-sm text-muted-foreground">Esta venta no tiene plan de cuotas.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="micro-label">Plan de cuotas</div>
      <ul className="divide-y divide-border">
        {cuotas.map((c) => {
          const est = estadoCuota(c);
          return (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2 font-mono text-sm">
              <span className="text-muted-foreground">
                {etiqueta(c)} · vence {fmtFecha(c.fecha_vencimiento)}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-foreground">{fmtMonto(c.monto_esperado, moneda)}</span>
                {est === "cobrada" ? (
                  <span className="text-success">✓ cobrada</span>
                ) : (
                  <span className="flex items-center gap-2">
                    <span className={est === "vencida" ? "text-danger" : "text-[var(--text-muted)]"}>
                      {est === "vencida" ? "vencida" : "pendiente"}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending && marcando === c.id}
                      onClick={() => marcar(c)}
                    >
                      {pending && marcando === c.id ? "…" : "Marcar cobrada"}
                    </Button>
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
