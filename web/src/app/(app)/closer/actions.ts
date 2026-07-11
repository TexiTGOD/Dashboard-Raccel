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

// Carga manual de una venta linkeada al lead/booking del contexto.
export async function createManualSale(input: {
  bookingId: string;
  leadId: string | null;
  email_comprador: string;
  nombre_comprador: string;
  monto: number;
  moneda: string;
  metodo_pago: MetodoPago;
}): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("sales").insert({
    email_comprador: input.email_comprador || null,
    nombre_comprador: input.nombre_comprador || null,
    monto: input.monto,
    moneda: input.moneda || "USD",
    status: "approved",
    metodo_pago: input.metodo_pago,
    booking_id: input.bookingId,
    lead_id: input.leadId,
    // matcheada la fija el trigger (booking_id no nulo => true).
  });
  if (error) return { error: error.message };

  revalidatePath(`/closer/${input.bookingId}`);
  return { ok: true };
}

// Concilia una venta sin matchear: la vincula a un booking propio (y hereda su lead).
export async function linkSale(input: {
  saleId: string;
  bookingId: string;
}): Promise<Result> {
  const supabase = await createClient();

  const { data: b } = await supabase
    .from("bookings")
    .select("lead_id")
    .eq("id", input.bookingId)
    .single();

  const { error } = await supabase
    .from("sales")
    .update({ booking_id: input.bookingId, lead_id: b?.lead_id ?? null, matcheada: true })
    .eq("id", input.saleId);
  if (error) return { error: error.message };

  revalidatePath("/closer/ventas-sin-matchear");
  revalidatePath("/closer");
  return { ok: true };
}
