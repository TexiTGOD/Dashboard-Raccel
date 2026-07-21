import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { periodFromParams } from "@/lib/period";
import { Card, CardContent } from "@/components/ui/card";
import { RangePicker } from "../_components/period-selector";
import { RegistrosTables } from "./registros-tables";

type DbClient = Awaited<ReturnType<typeof createClient>>;
type RpcArgs = { p_start: string; p_end: string };

// Trae TODAS las filas de un RPC que devuelve SETOF, paginando con .range() para
// superar el cap de 1000 filas por request de PostgREST. El ORDER BY de las
// dashboard_rows_* es TOTAL (fecha + id, migración 0016), así que el paginado por
// range no duplica ni saltea filas en los bordes de chunk. `expected` (el conteo
// agregado) acota el loop; si no vino, corta al primer chunk incompleto.
async function fetchAllRows(
  supabase: DbClient,
  fn: string,
  args: RpcArgs,
  expected: number,
): Promise<Record<string, unknown>[]> {
  const CHUNK = 1000;
  const MAX_ITERS = 500; // red de seguridad ante un range que no avanzara
  const out: Record<string, unknown>[] = [];
  let offset = 0;
  for (let i = 0; i < MAX_ITERS; i++) {
    const { data, error } = await supabase.rpc(fn, args).range(offset, offset + CHUNK - 1);
    if (error || !data || data.length === 0) break; // no hay más filas
    out.push(...(data as Record<string, unknown>[]));
    // Avanzar por lo REALMENTE recibido (no por CHUNK): si el server capara por
    // debajo de CHUNK, igual paginamos bien. offset siempre crece → el loop corta.
    offset += data.length;
    if (expected > 0 && out.length >= expected) break; // llegamos al total conocido
  }
  return out;
}

export default async function RegistrosPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; periodo?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.rol !== "admin") redirect("/");

  const period = periodFromParams(await searchParams);
  const supabase = await createClient();
  const args: RpcArgs = { p_start: period.startStr, p_end: period.endStr };

  // Totales por tab calculados en la base (count/sum agregado, sin el límite de
  // 1000 filas de PostgREST). Fuente de verdad de los totales y cota del paginado.
  const { data: countsData } = await supabase.rpc("dashboard_rows_counts", args);
  const c = (countsData?.[0] ?? {}) as Record<string, number | null>;
  const n = (k: string) => Number(c[k] ?? 0);

  // Filas: TODAS (paginadas por chunks con .range), no las primeras 1000. Así la
  // paginación client-side recorre el volumen completo y no queda topada en el cap.
  const [pagos, ventas, llamadas, leads] = await Promise.all([
    fetchAllRows(supabase, "dashboard_rows_pagos", args, n("pagos_count")),
    fetchAllRows(supabase, "dashboard_rows_ventas", args, n("ventas_count")),
    fetchAllRows(supabase, "dashboard_rows_llamadas", args, n("llamadas_count")),
    fetchAllRows(supabase, "dashboard_rows_leads", args, n("leads_count")),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Registros</h1>
          <p className="text-sm text-muted-foreground">
            El detalle fila por fila. El total de Pagos coincide con el Cash Collected del período.
          </p>
        </div>
        <RangePicker period={period} />
      </div>

      <Card>
        <CardContent className="py-4">
          <RegistrosTables
            pagos={pagos as never}
            ventas={ventas as never}
            llamadas={llamadas as never}
            leads={leads as never}
            counts={{
              pagos: Number(c.pagos_count ?? 0),
              ventas: Number(c.ventas_count ?? 0),
              llamadas: Number(c.llamadas_count ?? 0),
              leads: Number(c.leads_count ?? 0),
              ventas_facturacion: Number(c.ventas_facturacion ?? 0),
              ventas_cash: Number(c.ventas_cash ?? 0),
              pagos_cash: Number(c.pagos_cash ?? 0),
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
