import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EstadoBadge } from "../_components/badges";
import { OutcomeForm } from "./outcome-form";
import { ManualSaleForm } from "./manual-sale-form";
import { fmtFecha, fmtMonto } from "@/lib/format";
import { DOLOR_LABEL, CONCIENCIA_LABEL } from "@/lib/types";
import type { Booking, Call, Lead, Sale } from "@/lib/types";

type BookingDetail = Booking & {
  lead: Lead | null;
  calls: Call[] | null;
  sales: Sale[] | null;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm">{children || "—"}</div>
    </div>
  );
}

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireProfile();
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("bookings")
    .select("*, lead:leads(*), calls(*), sales(*)")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();
  const b = data as unknown as BookingDetail;
  const lead = b.lead;
  const call = b.calls?.[0] ?? null;
  const sale = b.sales?.[0] ?? null;

  return (
    <div className="space-y-4">
      <Link href="/closer" className="text-sm text-muted-foreground hover:underline">
        ← Volver a llamadas
      </Link>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">{lead?.nombre ?? b.nombre ?? "Sin nombre"}</h1>
        {(lead?.ig_username ?? b.ig_username) && (
          <span className="text-sm text-muted-foreground">@{lead?.ig_username ?? b.ig_username}</span>
        )}
        <EstadoBadge estado={b.estado} />
      </div>

      {/* Contexto del lead (solo lectura) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contexto del lead</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          {lead ? (
            <>
              <Field label="Pieza de origen">{lead.pieza_origen}</Field>
              <Field label="Calificación econ.">{lead.econ_calificacion?.replace("_", " ")}</Field>
              <Field label="Dolor">{lead.dolor ? DOLOR_LABEL[lead.dolor] : null}</Field>
              <Field label="Conciencia">{lead.conciencia ? CONCIENCIA_LABEL[lead.conciencia] : null}</Field>
              <div className="col-span-2">
                <Field label="Lo que escribió (DM)">
                  <span className="whitespace-pre-wrap">{lead.respuesta_lead}</span>
                </Field>
              </div>
              {lead.respuesta_lead_2 && (
                <div className="col-span-2">
                  <Field label="Profundización">
                    <span className="whitespace-pre-wrap">{lead.respuesta_lead_2}</span>
                  </Field>
                </div>
              )}
              {lead.respuesta_econ && (
                <div className="col-span-2">
                  <Field label="Respuesta económica">{lead.respuesta_econ}</Field>
                </div>
              )}
            </>
          ) : (
            <p className="col-span-2 text-sm text-muted-foreground">
              Este booking todavía no matcheó con un lead.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Datos de la llamada */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">La llamada</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Fecha / hora">{fmtFecha(b.fecha_llamada)}</Field>
            <Field label="Closer">{b.closer}</Field>
          </div>
          <Field label="Resumen de Fathom">
            {call?.resumen_fathom ? (
              <span className="whitespace-pre-wrap">{call.resumen_fathom}</span>
            ) : (
              <span className="text-muted-foreground">Todavía no hay resumen.</span>
            )}
          </Field>
        </CardContent>
      </Card>

      {/* Desenlace (lo que escribe el closer) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Desenlace</CardTitle>
        </CardHeader>
        <CardContent>
          <OutcomeForm
            bookingId={b.id}
            estado={b.estado ?? "programada"}
            resultado={call?.resultado ?? "pendiente"}
            notas={call?.notas_closer ?? ""}
          />
        </CardContent>
      </Card>

      {/* Venta */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Venta</CardTitle>
        </CardHeader>
        <CardContent>
          {sale ? (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Monto">{fmtMonto(sale.monto, sale.moneda)}</Field>
              <Field label="Status">{sale.status}</Field>
              <Field label="Método">{sale.metodo_pago}</Field>
              <Field label="Matcheada">{sale.matcheada ? "Sí" : "No"}</Field>
            </div>
          ) : (
            <ManualSaleForm
              bookingId={b.id}
              leadId={b.lead_id}
              defaultEmail={b.email ?? ""}
              defaultNombre={lead?.nombre ?? b.nombre ?? ""}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
