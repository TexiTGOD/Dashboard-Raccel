"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { marcarCuotaCobrada } from "../closer/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fmtMonto } from "@/lib/format";

// Fila operativa de Cobranzas: Linda marca la cuota cobrada sin salir de la
// pantalla (misma acción que el expediente). El botón frena el click para no
// disparar la navegación de la card al expediente.
export function CobranzaRow({
  bookingId,
  saleId,
  cuotaId,
  numeroCuota,
  monto,
  izq,
  sub,
  dias,
}: {
  bookingId: string | null;
  saleId: string;
  cuotaId: string;
  numeroCuota: number;
  monto: number;
  izq: string;
  sub: string;
  dias?: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function marcar(e: React.MouseEvent) {
    e.stopPropagation();
    start(async () => {
      const res = await marcarCuotaCobrada({
        bookingId: bookingId ?? "",
        saleId,
        cuotaId,
        numeroCuota,
        monto,
        moneda: "USD",
        metodo_pago: "transferencia",
        fecha: new Date().toISOString(),
      });
      if ("error" in res) toast.error("No se pudo registrar: " + res.error);
      else toast.success("Cuota cobrada");
    });
  }

  const clickable = Boolean(bookingId);
  return (
    <Card
      className={clickable ? "gap-0 py-0 transition-colors hover:border-primary/40 hover:bg-[var(--neon-wash)]" : "gap-0 py-0"}
      onClick={clickable ? () => router.push(`/closer/${bookingId}`) : undefined}
    >
      <CardContent className="flex items-center justify-between gap-3 px-5 py-3">
        <div className="min-w-0">
          <div className="truncate text-sm text-foreground">{izq}</div>
          <div className="truncate font-mono text-xs text-muted-foreground">{sub}</div>
        </div>
        <div className="flex shrink-0 items-center gap-3 font-mono text-sm">
          {dias != null && <span className="text-danger">{dias}d</span>}
          <span className="text-foreground">{fmtMonto(monto, "USD")}</span>
          <Button size="sm" variant="outline" disabled={pending} onClick={marcar}>
            {pending ? "…" : "marcar cobrada"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
