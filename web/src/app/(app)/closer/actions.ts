"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { EstadoBooking, MetodoPago, ResultadoCall } from "@/lib/types";

type Result = { ok: true } | { error: string };

// Guarda el desenlace de una llamada: estado del booking + resultado/notas de la
// call. La RLS garantiza que solo se pueda tocar un booking propio.
export async function saveCallOutcome(input: {
  bookingId: string;
  estado: EstadoBooking;
  resultado: ResultadoCall;
  notas: string;
}): Promise<Result> {
  const supabase = await createClient();

  const { error: bErr } = await supabase
    .from("bookings")
    .update({ estado: input.estado })
    .eq("id", input.bookingId);
  if (bErr) return { error: bErr.message };

  // calls no tiene unique por booking_id: buscamos y update o insert.
  const { data: existing } = await supabase
    .from("calls")
    .select("id")
    .eq("booking_id", input.bookingId)
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("calls")
      .update({ resultado: input.resultado, notas_closer: input.notas })
      .eq("id", existing.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("calls")
      .insert({
        booking_id: input.bookingId,
        resultado: input.resultado,
        notas_closer: input.notas,
      });
    if (error) return { error: error.message };
  }

  revalidatePath(`/closer/${input.bookingId}`);
  revalidatePath("/closer");
  return { ok: true };
}

// Pipeline de llamadas: mover una llamada de columna = cambiar su estado. Es la
// acción visual de la tarjeta (select), no hay drag & drop. La RLS decide quién
// puede: admin cualquiera, closer solo las suyas.
export async function cambiarEstadoLlamada(input: {
  bookingId: string;
  estado: EstadoBooking;
}): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("bookings")
    .update({ estado: input.estado })
    .eq("id", input.bookingId);
  if (error) return { error: error.message };

  revalidatePath("/closer");
  revalidatePath(`/closer/${input.bookingId}`);
  return { ok: true };
}

// Carga manual de una venta (el TRATO) + su primer pago.
// sale = valor del contrato (facturación); payment = la plata que entró.
export async function createManualSale(input: {
  bookingId: string;
  leadId: string | null;
  email_comprador: string;
  nombre_comprador: string;
  producto: string;
  valor_contrato: number;
  cuotas_total: number;
  moneda: string;
  primer_pago_monto: number;
  primer_pago_metodo: MetodoPago;
}): Promise<Result> {
  const supabase = await createClient();
  const moneda = input.moneda || "USD";

  // closer_identifier del profile logueado (para atribuir la venta).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let closer: string | null = null;
  if (user) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("closer_identifier")
      .eq("id", user.id)
      .maybeSingle();
    closer = prof?.closer_identifier ?? null;
  }

  const { data: sale, error } = await supabase
    .from("sales")
    .insert({
      email_comprador: input.email_comprador || null,
      nombre_comprador: input.nombre_comprador || null,
      producto: input.producto || null,
      valor_contrato: input.valor_contrato,
      monto: input.valor_contrato, // legacy: espejo de la facturación
      cuotas_total: input.cuotas_total,
      tipo: "nueva",
      closer,
      moneda,
      status: "approved",
      metodo_pago: input.primer_pago_metodo,
      booking_id: input.bookingId,
      lead_id: input.leadId,
      // matcheada la fija el trigger (booking_id no nulo => true).
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const { data: pay, error: pErr } = await supabase
    .from("payments")
    .insert({
      sale_id: sale.id,
      monto: input.primer_pago_monto,
      moneda,
      fecha: new Date().toISOString(),
      metodo_pago: input.primer_pago_metodo,
      numero_cuota: 1,
    })
    .select("id")
    .single();
  if (pErr) return { error: pErr.message };

  // El trigger ya generó las cuotas esperadas; marcamos la cuota 1 como cobrada.
  await supabase.from("cuotas").update({ payment_id: pay.id }).eq("sale_id", sale.id).eq("numero_cuota", 1);

  revalidatePath(`/closer/${input.bookingId}`);
  return { ok: true };
}

// Marca una cuota esperada como cobrada: crea el payment y lo linkea a la cuota.
export async function marcarCuotaCobrada(input: {
  bookingId: string;
  saleId: string;
  cuotaId: string;
  numeroCuota: number;
  monto: number;
  moneda: string;
  metodo_pago: MetodoPago;
  fecha: string; // ISO
}): Promise<Result> {
  const supabase = await createClient();
  const { data: pay, error } = await supabase
    .from("payments")
    .insert({
      sale_id: input.saleId,
      monto: input.monto,
      moneda: input.moneda || "USD",
      fecha: input.fecha || new Date().toISOString(),
      metodo_pago: input.metodo_pago,
      numero_cuota: input.numeroCuota,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const { error: cErr } = await supabase
    .from("cuotas")
    .update({ payment_id: pay.id })
    .eq("id", input.cuotaId);
  if (cErr) return { error: cErr.message };

  revalidatePath(`/closer/${input.bookingId}`);
  revalidatePath("/cobranzas");
  revalidatePath("/hoy");
  return { ok: true };
}

// Registra un pago posterior (cuota) contra un sale existente.
export async function addPayment(input: {
  bookingId: string;
  saleId: string;
  monto: number;
  moneda: string;
  metodo_pago: MetodoPago;
  fecha: string; // ISO
  numero_cuota: number | null;
}): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("payments").insert({
    sale_id: input.saleId,
    monto: input.monto,
    moneda: input.moneda || "USD",
    fecha: input.fecha || new Date().toISOString(),
    metodo_pago: input.metodo_pago,
    numero_cuota: input.numero_cuota,
  });
  if (error) return { error: error.message };

  revalidatePath(`/closer/${input.bookingId}`);
  return { ok: true };
}
