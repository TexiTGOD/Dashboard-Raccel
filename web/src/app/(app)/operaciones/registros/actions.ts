"use server";

import { createClient } from "@/lib/supabase/server";
import { getUserAndProfile } from "@/lib/auth";
import { revalidatePath } from "next/cache";

type Result = { ok: true } | { error: string };
type Patch = Record<string, string | number | null>;

// Edición inline de Registros: solo admin. Cada cambio manual sella updated_by
// (auth.uid); updated_at lo pone el trigger set_updated_at. La RLS (admin_all)
// permite el update; el guard + whitelist de campos son defensa en profundidad.
async function adminUid(): Promise<string | null> {
  const { user, profile } = await getUserAndProfile();
  if (!user || !profile || profile.rol !== "admin") return null;
  return user.id;
}

// Deja solo los campos permitidos (nadie edita columnas fuera de la lista).
function pick(patch: Patch, allow: readonly string[]): Patch {
  const out: Patch = {};
  for (const k of allow) if (k in patch) out[k] = patch[k];
  return out;
}

// Lead: pieza_origen, dolor, conciencia.
export async function updateLead(input: { leadId: string; patch: Patch }): Promise<Result> {
  const uid = await adminUid();
  if (!uid) return { error: "No autorizado" };
  const patch = pick(input.patch, ["pieza_origen", "dolor", "conciencia"]);
  const supabase = await createClient();
  const { error } = await supabase.from("leads").update({ ...patch, updated_by: uid }).eq("id", input.leadId);
  if (error) return { error: error.message };
  revalidatePath("/operaciones/registros");
  return { ok: true };
}

// Booking: closer, estado de la llamada.
export async function updateBooking(input: { bookingId: string; patch: Patch }): Promise<Result> {
  const uid = await adminUid();
  if (!uid) return { error: "No autorizado" };
  const patch = pick(input.patch, ["closer", "estado"]);
  const supabase = await createClient();
  const { error } = await supabase.from("bookings").update({ ...patch, updated_by: uid }).eq("id", input.bookingId);
  if (error) return { error: error.message };
  revalidatePath("/operaciones/registros");
  return { ok: true };
}

// Resultado de la llamada (vive en calls, una por booking). Update o insert.
export async function updateCallResultado(input: { bookingId: string; resultado: string }): Promise<Result> {
  const uid = await adminUid();
  if (!uid) return { error: "No autorizado" };
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("calls")
    .select("id")
    .eq("booking_id", input.bookingId)
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("calls")
      .update({ resultado: input.resultado, updated_by: uid })
      .eq("id", existing.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("calls")
      .insert({ booking_id: input.bookingId, resultado: input.resultado, updated_by: uid });
    if (error) return { error: error.message };
  }
  revalidatePath("/operaciones/registros");
  return { ok: true };
}

// Sale: closer, fecha_cierre (el trigger valida fecha_cierre >= fecha_llamada).
export async function updateSale(input: { saleId: string; patch: Patch }): Promise<Result> {
  const uid = await adminUid();
  if (!uid) return { error: "No autorizado" };
  const patch = pick(input.patch, ["closer", "fecha_cierre"]);
  const supabase = await createClient();
  const { error } = await supabase.from("sales").update({ ...patch, updated_by: uid }).eq("id", input.saleId);
  if (error) return { error: error.message };
  revalidatePath("/operaciones/registros");
  return { ok: true };
}
