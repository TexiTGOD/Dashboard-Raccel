import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { periodFromParams } from "@/lib/period";
import { fetchAllRpcRows } from "@/lib/dashboard";
import { leerRespuestasCalendly } from "@/lib/calendly";
import { RangePicker } from "../_components/period-selector";
import { RegistrosTables } from "./registros-tables";

type RpcArgs = { p_start: string; p_end: string };
type DbClient = Awaited<ReturnType<typeof createClient>>;

/**
 * WhatsApp de cada llamada. Vive en bookings.calendly_respuestas (el jsonb que
 * persiste el webhook) y el RPC de llamadas no lo devuelve, así que se trae aparte
 * y se mergea por booking_id — sin tocar el schema ni la función.
 *
 * Se consulta SOLO por los ids que ya devolvió el RPC, que vienen filtrados por
 * período y por la regla de leads en crisis: así ningún booking de un lead en
 * crisis se trae siquiera. En chunks por si algún período trae muchas llamadas.
 */
async function whatsappPorBooking(sb: DbClient, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await sb
      .from("bookings")
      .select("id, calendly_respuestas")
      .in("id", ids.slice(i, i + 500));
    for (const b of data ?? []) {
      const tel = leerRespuestasCalendly(b.calendly_respuestas).telefono;
      if (tel) out.set(String(b.id), tel);
    }
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
    fetchAllRpcRows(supabase, "dashboard_rows_pagos", args, n("pagos_count")),
    fetchAllRpcRows(supabase, "dashboard_rows_ventas", args, n("ventas_count")),
    fetchAllRpcRows(supabase, "dashboard_rows_llamadas", args, n("llamadas_count")),
    fetchAllRpcRows(supabase, "dashboard_rows_leads", args, n("leads_count")),
  ]);

  // Merge del WhatsApp en las filas de llamadas (ver whatsappPorBooking).
  const tels = await whatsappPorBooking(
    supabase,
    llamadas.map((r) => String(r.booking_id ?? "")).filter(Boolean),
  );
  const llamadasConTel = llamadas.map((r) => ({
    ...r,
    whatsapp: tels.get(String(r.booking_id ?? "")) ?? null,
  }));

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

      <RegistrosTables
        pagos={pagos as never}
        ventas={ventas as never}
        llamadas={llamadasConTel as never}
        leads={leads as never}
        // Límites del período activo: acotan el filtro de fechas del box de Leads.
        desde={period.desde}
        hasta={period.hasta}
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
    </div>
  );
}
