import type { SupabaseClient } from "@supabase/supabase-js";
import type { Period } from "@/lib/period";

const num = (v: unknown): number | null => (v == null ? null : Number(v));

export interface Kpis {
  leads: number; calificados: number; no_calificados: number; sin_responder: number;
  agendas: number; atendidas: number;
  no_show: number; resueltas: number; pendientes: number; canceladas: number;
  ventas: number; ventas_atribuibles: number; facturacion: number; cash_collected: number;
  aov: number | null; aov_cash: number | null; tasa_calificacion: number | null; tasa_agenda: number | null;
  show_rate: number | null; close_rate_atendidas: number | null; close_rate_agendadas: number | null;
}

export async function loadKpis(sb: SupabaseClient, p: Period): Promise<Kpis> {
  const { data } = await sb.rpc("dashboard_kpis", { p_start: p.startStr, p_end: p.endStr });
  const k = data?.[0] ?? {};
  return {
    leads: Number(k.leads ?? 0), calificados: Number(k.calificados ?? 0),
    no_calificados: Number(k.no_calificados ?? 0), sin_responder: Number(k.sin_responder ?? 0),
    agendas: Number(k.agendas ?? 0), atendidas: Number(k.atendidas ?? 0),
    no_show: Number(k.no_show ?? 0), resueltas: Number(k.resueltas ?? 0),
    pendientes: Number(k.pendientes ?? 0), canceladas: Number(k.canceladas ?? 0),
    ventas: Number(k.ventas ?? 0), ventas_atribuibles: Number(k.ventas_atribuibles ?? 0),
    facturacion: Number(k.facturacion ?? 0), cash_collected: Number(k.cash_collected ?? 0),
    aov: num(k.aov), aov_cash: num(k.aov_cash),
    tasa_calificacion: num(k.tasa_calificacion), tasa_agenda: num(k.tasa_agenda),
    show_rate: num(k.show_rate), close_rate_atendidas: num(k.close_rate_atendidas),
    close_rate_agendadas: num(k.close_rate_agendadas),
  };
}

export interface TasasHistoricas {
  aov_cash: number | null; close_rate: number | null;
  show_rate: number | null; tasa_agenda: number | null;
}

// dias = ventana del histórico (30 / 60 / 90). 90 = más estable.
export async function loadTasasHistoricas(sb: SupabaseClient, dias = 90): Promise<TasasHistoricas> {
  const { data } = await sb.rpc("dashboard_tasas_historicas", { p_dias: dias });
  const t = data?.[0] ?? {};
  return {
    aov_cash: num(t.aov_cash), close_rate: num(t.close_rate),
    show_rate: num(t.show_rate), tasa_agenda: num(t.tasa_agenda),
  };
}

export async function loadRpc(sb: SupabaseClient, fn: string, p: Period) {
  const { data } = await sb.rpc(fn, { p_start: p.startStr, p_end: p.endStr });
  return data ?? [];
}

// mesKey = YYYY-MM-01. Metas y gastos son mensuales (Period.mesInicioStr).
export async function loadMetas(sb: SupabaseClient, mesKey: string) {
  const { data } = await sb.from("metas").select("metrica, objetivo").eq("periodo", mesKey);
  return (data ?? []) as { metrica: string; objetivo: number }[];
}

export async function loadGastos(sb: SupabaseClient, mesKey: string) {
  const { data } = await sb.from("gastos").select("categoria, concepto, monto").eq("periodo", mesKey);
  return (data ?? []) as { categoria: string; concepto: string | null; monto: number }[];
}
