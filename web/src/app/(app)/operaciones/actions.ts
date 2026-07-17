"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { loadTasasHistoricas, type TasasHistoricas } from "@/lib/dashboard";

type Result = { ok: true } | { error: string };

// Recalcula en vivo el histórico de los supuestos para una ventana (30/60/90 días).
// Cálculo en la base (dashboard_tasas_historicas); acá solo se re-consulta.
export async function getTasasHistoricas(dias: number): Promise<TasasHistoricas> {
  const supabase = await createClient();
  return loadTasasHistoricas(supabase, dias);
}

// Upsert de una meta (objetivo) para un período+métrica. Solo admin (RLS).
export async function upsertMeta(input: {
  periodo: string; // YYYY-MM-01
  metrica: string;
  objetivo: number;
}): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("metas")
    .upsert(
      { periodo: input.periodo, metrica: input.metrica, objetivo: input.objetivo },
      { onConflict: "periodo,metrica" },
    );
  if (error) return { error: error.message };
  revalidatePath("/operaciones");
  return { ok: true };
}

// Guarda todas las metas derivadas de la cascada en un solo upsert.
export async function guardarMetas(input: {
  periodo: string;
  values: Record<string, number>;
}): Promise<Result> {
  const supabase = await createClient();
  const rows = Object.entries(input.values)
    .filter(([, v]) => Number.isFinite(v))
    .map(([metrica, objetivo]) => ({ periodo: input.periodo, metrica, objetivo }));
  if (rows.length === 0) return { ok: true };
  const { error } = await supabase.from("metas").upsert(rows, { onConflict: "periodo,metrica" });
  if (error) return { error: error.message };
  revalidatePath("/metas");
  revalidatePath("/operaciones");
  revalidatePath("/hoy");
  return { ok: true };
}

// Carga de un gasto con su fecha propia. Solo admin (RLS). `periodo` lo deriva
// el trigger gastos_set_periodo desde `fecha`.
export async function addGasto(input: {
  fecha: string; // YYYY-MM-DD
  categoria: string;
  concepto: string;
  monto: number;
}): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("gastos").insert({
    fecha: input.fecha,
    categoria: input.categoria,
    concepto: input.concepto || null,
    monto: input.monto,
  });
  if (error) return { error: error.message };
  revalidatePath("/cashflow");
  return { ok: true };
}

// Edita un gasto existente (fecha, categoría, concepto o monto). Solo admin (RLS).
export async function updateGasto(input: {
  id: string;
  patch: { fecha?: string; categoria?: string; concepto?: string | null; monto?: number };
}): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("gastos").update(input.patch).eq("id", input.id);
  if (error) return { error: error.message };
  revalidatePath("/cashflow");
  return { ok: true };
}

// Borra un gasto. Solo admin (RLS).
export async function deleteGasto(input: { id: string }): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("gastos").delete().eq("id", input.id);
  if (error) return { error: error.message };
  revalidatePath("/cashflow");
  return { ok: true };
}
