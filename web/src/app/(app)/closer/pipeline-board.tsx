"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { fmtFecha, fmtInt } from "@/lib/format";
import { ESTADOS_BOOKING, type EstadoBooking, type ResultadoCall } from "@/lib/types";
import { ResultadoBadge } from "./_components/badges";
import { cambiarEstadoLlamada } from "./actions";

// La clase la calcula la base (dashboard_pipeline_llamadas). Acá solo agrupamos
// por ella y formateamos — el front no decide en qué columna cae una llamada.
export interface PipelineRow {
  booking_id: string;
  fecha: string | null;
  lead_nombre: string | null;
  ig: string | null;
  closer: string | null;
  estado: EstadoBooking | null;
  resultado: ResultadoCall | null;
  pieza: string | null;
  clase: string;
}

// Conteos agregados en SQL: son la fuente de verdad de cada columna (no se
// cuentan filas en el cliente, que podrían venir capadas).
export interface PipelineCounts {
  programada: number;
  pendiente: number;
  atendida: number;
  vendido: number;
  perdido: number;
  no_show: number;
  cancelada: number;
  total: number;
}

const ESTADO_LABEL: Record<EstadoBooking, string> = {
  programada: "Programada",
  atendida: "Atendida",
  no_show: "No-show",
  reprogramada: "Reprogramada",
  cancelada: "Cancelada",
};

// Columnas visibles = lo accionable. "Atendida" son las que todavía piden algo:
// seguimiento, o atendidas sin resultado cargado.
const COLUMNAS: { key: keyof PipelineCounts; label: string; hint: string }[] = [
  { key: "programada", label: "Programada", hint: "Agendada, todavía no ocurrió" },
  { key: "pendiente", label: "Pendiente de desenlace", hint: "Ya pasó y nadie cargó el desenlace" },
  { key: "atendida", label: "Atendida", hint: "Seguimiento o sin resultado cargado" },
];

// Archivado = lo terminado. Vendidas y perdidas ya están cerradas: no piden
// acción, pero quedan a un click.
const ARCHIVO: { key: keyof PipelineCounts; label: string }[] = [
  { key: "vendido", label: "Vendidas" },
  { key: "perdido", label: "Perdidas" },
  { key: "no_show", label: "No-show" },
  { key: "cancelada", label: "Canceladas" },
];

function LlamadaCard({
  r,
  onMover,
  pendiente,
}: {
  r: PipelineRow;
  onMover: (bookingId: string, estado: EstadoBooking) => void;
  pendiente: boolean;
}) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="space-y-2 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/closer/${r.booking_id}`} className="min-w-0 flex-1 hover:underline">
            <div className="truncate text-sm font-medium text-foreground">
              {r.lead_nombre ?? "Sin nombre"}
            </div>
            <div className="truncate font-mono text-xs text-muted-foreground">
              {r.ig ? `@${r.ig}` : "—"}
              {r.pieza ? `  ·  ${r.pieza}` : ""}
            </div>
          </Link>
          {r.resultado && r.resultado !== "pendiente" && <ResultadoBadge resultado={r.resultado} />}
        </div>

        <div className="font-mono text-[11px] text-[var(--text-muted)]">{fmtFecha(r.fecha)}</div>

        {/* Acción visual: mover de columna = cambiar el estado. Sin drag & drop. */}
        <label className="block">
          <span className="sr-only">Mover llamada de {r.lead_nombre ?? "sin nombre"} a otro estado</span>
          <select
            value={r.estado ?? ""}
            disabled={pendiente}
            onChange={(e) => onMover(r.booking_id, e.target.value as EstadoBooking)}
            className="w-full rounded border border-border bg-[var(--surface-elevated)] px-2 py-1 font-mono text-xs text-foreground outline-none focus:border-primary disabled:opacity-50"
          >
            {ESTADOS_BOOKING.map((e) => (
              <option key={e} value={e}>
                {pendiente && r.estado === e ? "…" : ESTADO_LABEL[e]}
              </option>
            ))}
          </select>
        </label>
      </CardContent>
    </Card>
  );
}

function Columna({
  label,
  hint,
  total,
  rows,
  onMover,
  pendingId,
}: {
  label: string;
  hint?: string;
  total: number;
  rows: PipelineRow[];
  onMover: (bookingId: string, estado: EstadoBooking) => void;
  pendingId: string | null;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-3 border-b border-border pb-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="section-title">{label}</span>
          <span className="font-mono text-lg text-foreground">{fmtInt(total)}</span>
        </div>
        {hint && <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{hint}</p>}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin llamadas.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <LlamadaCard key={r.booking_id} r={r} onMover={onMover} pendiente={pendingId === r.booking_id} />
          ))}
        </div>
      )}
    </div>
  );
}

export function PipelineBoard({
  rows,
  counts,
}: {
  rows: PipelineRow[];
  counts: PipelineCounts;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [archivoAbierto, setArchivoAbierto] = useState(false);

  // Agrupar por la clase que ya vino calculada de la base.
  const porClase = new Map<string, PipelineRow[]>();
  for (const r of rows) {
    if (!porClase.has(r.clase)) porClase.set(r.clase, []);
    porClase.get(r.clase)!.push(r);
  }
  const de = (k: string) => porClase.get(k) ?? [];

  function mover(bookingId: string, estado: EstadoBooking) {
    setPendingId(bookingId);
    startTransition(async () => {
      const res = await cambiarEstadoLlamada({ bookingId, estado });
      setPendingId(null);
      if ("error" in res) toast.error("No se pudo mover: " + res.error);
      else {
        toast.success(`Movida a ${ESTADO_LABEL[estado]}`);
        router.refresh();
      }
    });
  }

  const archivadas = counts.vendido + counts.perdido + counts.no_show + counts.cancelada;

  return (
    <div className="space-y-8">
      <div className="grid gap-6 md:grid-cols-3">
        {COLUMNAS.map((col) => (
          <Columna
            key={col.key}
            label={col.label}
            hint={col.hint}
            total={counts[col.key]}
            rows={de(col.key)}
            onMover={mover}
            pendingId={pendingId}
          />
        ))}
      </div>

      {/* Archivado: no ocupa las columnas principales, pero está a un click. */}
      <section>
        <button
          type="button"
          onClick={() => setArchivoAbierto((v) => !v)}
          aria-expanded={archivoAbierto}
          className="flex w-full items-center justify-between gap-3 rounded-md border border-border px-4 py-3 text-left transition-colors hover:bg-[var(--surface-elevated)]"
        >
          <span className="flex items-baseline gap-3">
            <span className="section-title">Archivado</span>
            <span className="font-mono text-xs text-muted-foreground">
              vendidas {fmtInt(counts.vendido)} · perdidas {fmtInt(counts.perdido)} · no-show{" "}
              {fmtInt(counts.no_show)} · canceladas {fmtInt(counts.cancelada)}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <span className="font-mono text-lg text-foreground">{fmtInt(archivadas)}</span>
            <span className="font-mono text-xs text-muted-foreground">{archivoAbierto ? "▲" : "▼"}</span>
          </span>
        </button>

        {archivoAbierto && (
          <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {ARCHIVO.map((col) => (
              <Columna
                key={col.key}
                label={col.label}
                total={counts[col.key]}
                rows={de(col.key)}
                onMover={mover}
                pendingId={pendingId}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
