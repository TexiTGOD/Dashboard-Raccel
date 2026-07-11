"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveCallOutcome } from "../actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ESTADOS_BOOKING,
  RESULTADOS_CALL,
  type EstadoBooking,
  type ResultadoCall,
} from "@/lib/types";

const resultadoLabel: Record<ResultadoCall, string> = {
  pendiente: "Pendiente",
  vendido: "Vendido",
  perdido: "Perdido",
  follow_up: "Follow up",
};

export function OutcomeForm({
  bookingId,
  estado: e0,
  resultado: r0,
  notas: n0,
}: {
  bookingId: string;
  estado: EstadoBooking;
  resultado: ResultadoCall;
  notas: string;
}) {
  const [estado, setEstado] = useState<EstadoBooking>(e0);
  const [resultado, setResultado] = useState<ResultadoCall>(r0);
  const [notas, setNotas] = useState(n0);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await saveCallOutcome({ bookingId, estado, resultado, notas });
      if ("error" in res) toast.error("No se pudo guardar: " + res.error);
      else toast.success("Guardado");
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Estado de la call</Label>
          <Select value={estado} onValueChange={(v) => setEstado(v as EstadoBooking)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ESTADOS_BOOKING.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s.replace("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Resultado</Label>
          <Select value={resultado} onValueChange={(v) => setResultado(v as ResultadoCall)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RESULTADOS_CALL.map((r) => (
                <SelectItem key={r} value={r}>
                  {resultadoLabel[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notas">Notas</Label>
        <Textarea
          id="notas"
          rows={4}
          placeholder="Objeciones, contexto, qué pasó…"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={pending}>
          {pending ? "Guardando…" : "Guardar desenlace"}
        </Button>
      </div>
    </div>
  );
}
