import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { EstadoBadge } from "../_components/badges";
import { OutcomeForm } from "./outcome-form";
import { ManualSaleForm } from "./manual-sale-form";
import { CuotasPanel } from "./cuotas-panel";
import { fmtFecha, fmtMonto } from "@/lib/format";
import { DOLOR_LABEL, CONCIENCIA_LABEL } from "@/lib/types";
import type { Booking, Call, Cuota, Lead, Payment, Sale } from "@/lib/types";

type SaleWithPayments = Sale & { payments: Payment[] | null };
type BookingDetail = Booking & {
  lead: Lead | null;
  calls: Call[] | null;
  sales: SaleWithPayments[] | null;
};

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-5">
        <div className="section-title border-b border-border pb-3">{title}</div>
        {children}
      </CardContent>
    </Card>
  );
}

function Field({ label, mono, children }: { label: string; mono?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="micro-label">{label}</div>
      <div className={`mt-1.5 text-sm text-foreground ${mono ? "font-mono" : ""}`}>
        {children || "—"}
      </div>
    </div>
  );
}

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireProfile();
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("bookings")
    .select("*, lead:leads(*), calls(*), sales(*, payments(*))")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();
  const b = data as unknown as BookingDetail;
  const lead = b.lead;
  const call = b.calls?.[0] ?? null;
  const sale = b.sales?.[0] ?? null;
  const payments = (sale?.payments ?? [])
    .slice()
    .sort((a, b) => (a.numero_cuota ?? 999) - (b.numero_cuota ?? 999));
  const cashCollected = payments.reduce((sum, p) => sum + (Number(p.monto) || 0), 0);

  // Cuotas aparte: si la tabla no existe todavía, no rompe el expediente.
  let cuotas: Cuota[] = [];
  if (sale) {
    const { data: cu } = await supabase
      .from("cuotas")
      .select("*")
      .eq("sale_id", sale.id)
      .order("numero_cuota", { ascending: true });
    cuotas = (cu ?? []) as Cuota[];
  }
  // No se puede cargar una venta si la llamada todavía no ocurrió.
  const bookingFutura = b.fecha_llamada ? new Date(b.fecha_llamada).getTime() > Date.now() : false;

  return (
    <div className="space-y-6">
      <Link href="/closer" className="micro-label hover:text-foreground">
        ← Volver a llamadas
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-heading text-2xl font-bold">{lead?.nombre ?? b.nombre ?? "Sin nombre"}</h1>
        {(lead?.ig_username ?? b.ig_username) && (
          <span className="font-mono text-sm text-muted-foreground">
            @{lead?.ig_username ?? b.ig_username}
          </span>
        )}
        <EstadoBadge estado={b.estado} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        {/* Columna izquierda: contexto */}
        <div className="space-y-4">
          <Panel title="Contexto del lead">
            {lead ? (
              <>
                <div className="grid grid-cols-2 gap-5">
                  <Field label="Pieza de origen" mono>{lead.pieza_origen}</Field>
                  <Field label="Calificación econ.">{lead.econ_calificacion?.replace("_", " ")}</Field>
                  <Field label="Dolor">{lead.dolor ? DOLOR_LABEL[lead.dolor] : null}</Field>
                  <Field label="Conciencia" mono>
                    {lead.conciencia ? CONCIENCIA_LABEL[lead.conciencia] : null}
                  </Field>
                </div>
                {lead.respuesta_lead && (
                  <div>
                    <div className="micro-label mb-2">Lo que escribió (DM)</div>
                    <blockquote className="dm-quote whitespace-pre-wrap">{lead.respuesta_lead}</blockquote>
                  </div>
                )}
                {lead.respuesta_lead_2 && (
                  <div>
                    <div className="micro-label mb-2">Profundización</div>
                    <blockquote className="dm-quote whitespace-pre-wrap">{lead.respuesta_lead_2}</blockquote>
                  </div>
                )}
                {lead.respuesta_econ && <Field label="Respuesta económica">{lead.respuesta_econ}</Field>}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Este booking todavía no matcheó con un lead.
              </p>
            )}
          </Panel>

          <Panel title="La llamada">
            <div className="grid grid-cols-2 gap-5">
              <Field label="Fecha / hora" mono>{fmtFecha(b.fecha_llamada)}</Field>
              <Field label="Closer" mono>{b.closer}</Field>
            </div>
            <Field label="Resumen de Fathom">
              {call?.resumen_fathom ? (
                <span className="whitespace-pre-wrap">{call.resumen_fathom}</span>
              ) : (
                <span className="text-muted-foreground">Todavía no hay resumen.</span>
              )}
            </Field>
          </Panel>
        </div>

        {/* Columna derecha: lo que escribe el closer + venta */}
        <div className="space-y-4">
          <Panel title="Desenlace">
            <OutcomeForm
              bookingId={b.id}
              estado={b.estado ?? "programada"}
              resultado={call?.resultado ?? "pendiente"}
              notas={call?.notas_closer ?? ""}
            />
          </Panel>

          <Panel title="Venta">
            {sale ? (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-5">
                  <Field label="Valor contrato" mono>{fmtMonto(sale.valor_contrato, sale.moneda)}</Field>
                  <Field label="Cash collected" mono>{fmtMonto(cashCollected, sale.moneda)}</Field>
                  <Field label="Tipo">{sale.tipo}</Field>
                  <Field label="Producto">{sale.producto}</Field>
                  <Field label="Cuotas" mono>
                    {sale.cuotas_total ? `${payments.length}/${sale.cuotas_total}` : String(payments.length)}
                  </Field>
                  <Field label="Status" mono>{sale.status}</Field>
                </div>

                <CuotasPanel bookingId={b.id} moneda={sale.moneda ?? "USD"} cuotas={cuotas} />
              </div>
            ) : (
              <ManualSaleForm
                bookingId={b.id}
                leadId={b.lead_id}
                defaultEmail={b.email ?? ""}
                defaultNombre={lead?.nombre ?? b.nombre ?? ""}
                bookingFutura={bookingFutura}
              />
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
