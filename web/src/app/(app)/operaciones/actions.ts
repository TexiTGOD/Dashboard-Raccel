"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type Result = { ok: true } | { error: string };

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

// Carga de un gasto del período. Solo admin (RLS).
export async function addGasto(input: {
  periodo: string;
  categoria: string;
  concepto: string;
  monto: number;
}): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("gastos").insert({
    periodo: input.periodo,
    categoria: input.categoria,
    concepto: input.concepto || null,
    monto: input.monto,
  });
  if (error) return { error: error.message };
  revalidatePath("/operaciones");
  return { ok: true };
}
