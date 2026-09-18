import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { EstadoBadge } from "../_components/badges";
import { OutcomeForm } from "./outcome-form";
import { ManualSaleForm } from "./manual-sale-form";
import { CuotasPanel } from "./cuotas-panel";
import { GrabacionField } from "./grabacion-field";
import { fmtFecha, fmtMonto } from "@/lib/format";
import { leerRespuestasCalendly, recortar } from "@/lib/calendly";
import { piezaLabel } from "@/lib/pieza";
import { closerLabel } from "@/lib/closers";
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

// Texto libre del formulario: se recorta para no romper la grilla; el completo
// queda en el title (hover). Es una FUNCIÓN, no un componente: devuelve null
// cuando no hay dato, para que el `children || "—"` de Field muestre el guión
// (un <Componente/> siempre es truthy y se comía el fallback).
function libre(s: string | null, max = 90): React.ReactNode {
  if (!s) return null;
  const corto = recortar(s, max);
  return <span title={corto === s ? undefined : s}>{corto}</span>;
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
  // Respuestas del formulario de Calendly (jsonb crudo -> campos con etiqueta).
  const qa = leerRespuestasCalendly(b.calendly_respuestas);
  // Red de seguridad: si sobró alguna respuesta sin clasificar Y falta algún campo
  // conocido, la mostramos cruda para que el dato no desaparezca de la pantalla
  // (cubre la degradación PARCIAL: una sola pregunta reformulada). Las preguntas
  // que no van a la ficha (Instagram, compromiso) ya las descarta el parser.
  const otrasRespuestas = qa.sinClasificar;
  const sinReconocer =
    otrasRespuestas.length > 0 &&
    [qa.telefono, qa.sentimientos, qa.trabajo, qa.objetivo, qa.recursos, qa.decisor].some((v) => !v);

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

      {/* Contexto del lead + La llamada: información de referencia, compacta,
          lado a lado — no compiten por espacio con el Desenlace. */}
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Panel title="Contexto del lead">
          {lead ? (
            <>
              <div className="grid grid-cols-2 gap-5">
                <Field label="Pieza de origen">{piezaLabel(lead.pieza_origen)}</Field>
                <Field label="Calificación econ.">{lead.econ_calificacion?.replace("_", " ")}</Field>
              </div>
              {/* Dolor, Conciencia y "Lo que escribió (DM)" se dejaron de mostrar:
                  vienen de la automatización de ManyChat que ya no se usa (el DM
                  llegaba con el placeholder crudo). Siguen en la base, sin borrar. */}
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

          {/* Lo que respondió el prospecto al agendar. Vive en el booking, así que
              se muestra aunque no haya lead matcheado. */}
          <div className="space-y-4 border-t border-border pt-4">
            <div className="micro-label">Respondió al agendar</div>
            <div className="grid grid-cols-2 gap-5">
              <Field label="Teléfono / WhatsApp" mono>{libre(qa.telefono, 40)}</Field>
              <Field label="Recursos" mono>{qa.recursos}</Field>
              <Field label="Objetivo">{qa.objetivo}</Field>
              <Field label="Decisor">{qa.decisor}</Field>
            </div>
            <Field label="Sentimientos">{libre(qa.sentimientos)}</Field>
            <Field label="Trabajo">{libre(qa.trabajo)}</Field>

            {/* Red de seguridad: si el formulario cambió tanto que no se reconoció
                ninguna pregunta, mostrar los pares crudos en vez de 6 guiones. */}
            {sinReconocer && (
              <div className="space-y-2">
                <div className="micro-label">Otras respuestas</div>
                {otrasRespuestas.map((p, i) => (
                  <div key={i} className="text-sm">
                    <span className="text-muted-foreground">{p.pregunta || "—"}: </span>
                    <span className="text-foreground">{recortar(p.respuesta, 120)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Panel>

        <Panel title="La llamada">
          <div className="grid grid-cols-2 gap-5">
            <Field label="Fecha / hora" mono>{fmtFecha(b.fecha_llamada)}</Field>
            <Field label="Closer" mono>{closerLabel(b.closer)}</Field>
          </div>
          <Field label="Resumen de Fathom">
            {call?.resumen_fathom ? (
              <span className="whitespace-pre-wrap">{call.resumen_fathom}</span>
            ) : (
              <span className="text-muted-foreground">Todavía no hay resumen.</span>
            )}
          </Field>
          <GrabacionField bookingId={b.id} url={b.grabacion_url ?? null} />
        </Panel>
      </div>

      {/* Encabezado sticky: nombre + pieza quedan visibles mientras se scrollea
          el desenlace (10 campos, no entra todo en una pantalla). Fuera del
          Card a propósito: Card tiene overflow-hidden, que rompe el sticky. */}
      <div className="sticky top-0 z-10 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-border bg-card px-5 py-3 shadow-sm">
        <span className="font-heading text-sm font-bold text-foreground">
          {lead?.nombre ?? b.nombre ?? "Sin nombre"}
        </span>
        <span className="micro-label text-muted-foreground">{piezaLabel(lead?.pieza_origen ?? null)}</span>
      </div>

      {/* Desenlace: lo que completa la closer después de colgar. Es la acción
          principal de la página — ancho completo, no una columna angosta. */}
      <Panel title="Desenlace">
        <OutcomeForm
          bookingId={b.id}
          estado={b.estado ?? "programada"}
          resultado={call?.resultado ?? "pendiente"}
          notas={call?.notas_closer ?? ""}
          calificado={b.calificado ?? null}
          productoOfrecido={call?.producto_ofrecido ?? null}
          precioOfrecido={call?.precio_ofrecido ?? null}
          dolorPrincipal={call?.dolor_principal ?? null}
          dolorExtra={call?.dolor_extra ?? ""}
          objeciones={call?.objeciones ?? []}
          objecionesExtra={call?.objeciones_extra ?? ""}
          proximoSeguimiento={call?.proximo_seguimiento ?? null}
        />
      </Panel>

      <Panel title="Venta">
        {sale ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
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
  );
}
