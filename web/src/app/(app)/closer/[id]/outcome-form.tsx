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

// El selector de calificado es tri-estado: "" = sin marcar (null en la base),
// distinto de "No". Se serializa a boolean|null al guardar.
// Fuente de etiquetas para el trigger cerrado de cada Select (prop `items`).
const ESTADO_OPTS = ESTADOS_BOOKING.map((s) => ({ value: s, label: s.replace("_", " ") }));
const RESULTADO_OPTS = RESULTADOS_CALL.map((r) => ({ value: r, label: resultadoLabel[r] }));

const CALIFICADO_OPTS = [
  { value: "sin", label: "Sin marcar" },
  { value: "si", label: "Sí" },
  { value: "no", label: "No" },
];
const aCalificado = (v: string): boolean | null => (v === "sin" ? null : v === "si");
const deCalificado = (b: boolean | null): string => (b == null ? "sin" : b ? "si" : "no");

export function OutcomeForm({
  bookingId,
  estado: e0,
  resultado: r0,
  notas: n0,
  calificado: c0,
}: {
  bookingId: string;
  estado: EstadoBooking;
  resultado: ResultadoCall;
  notas: string;
  calificado: boolean | null;
}) {
  const [estado, setEstado] = useState<EstadoBooking>(e0);
  const [resultado, setResultado] = useState<ResultadoCall>(r0);
  const [notas, setNotas] = useState(n0);
  const [calificado, setCalificado] = useState(deCalificado(c0));
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await saveCallOutcome({
        bookingId, estado, resultado, notas,
        calificado: aCalificado(calificado),
      });
      if ("error" in res) toast.error("No se pudo guardar: " + res.error);
      else toast.success("Guardado");
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Estado de la call</Label>
          {/* `items` es lo que usa SelectValue para resolver la etiqueta del trigger
              cerrado; sin él muestra el value crudo (ej. "no_show"). */}
          <Select items={ESTADO_OPTS} value={estado} onValueChange={(v) => setEstado(v as EstadoBooking)}>
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
          <Select items={RESULTADO_OPTS} value={resultado} onValueChange={(v) => setResultado(v as ResultadoCall)}>
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
        <Label>Calificado</Label>
        <Select items={CALIFICADO_OPTS} value={calificado} onValueChange={(v) => setCalificado(v ?? "sin")}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CALIFICADO_OPTS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-[var(--text-muted)]">
          Tu criterio después de la llamada. Independiente de lo que haya respondido en Calendly.
        </p>
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
