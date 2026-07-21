import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { periodFromParams } from "@/lib/period";
import { fetchAllRpcRows } from "@/lib/dashboard";
import { PageHeader } from "../operaciones/_components/page-header";
import { PipelineBoard, type PipelineCounts, type PipelineRow } from "./pipeline-board";

// Pipeline de llamadas: columnas por estado + archivado colapsable.
// La clase de cada llamada y los conteos por columna se calculan en la BASE
// (dashboard_pipeline_llamadas / _counts). El front agrupa y formatea nada más.
export default async function CloserPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; periodo?: string }>;
}) {
  await requireProfile();
  const period = periodFromParams(await searchParams);
  const supabase = await createClient();
  const args = { p_start: period.startStr, p_end: period.endStr };

  // Conteos agregados primero: fuente de verdad de cada columna y cota del fetch.
  const { data: countsData } = await supabase.rpc("dashboard_pipeline_llamadas_counts", args);
  const c = (countsData?.[0] ?? {}) as Record<string, number | null>;
  const counts: PipelineCounts = {
    programada: Number(c.programada ?? 0),
    pendiente: Number(c.pendiente ?? 0),
    atendida: Number(c.atendida ?? 0),
    vendido: Number(c.vendido ?? 0),
    perdido: Number(c.perdido ?? 0),
    no_show: Number(c.no_show ?? 0),
    cancelada: Number(c.cancelada ?? 0),
    total: Number(c.total ?? 0),
  };

  // Filas: todas las del rango (paginadas por chunks, sin el cap de 1000).
  const rows = await fetchAllRpcRows(supabase, "dashboard_pipeline_llamadas", args, counts.total);

  return (
    <div className="tabular-nums">
      <PageHeader title="Llamadas" period={period} />
      <PipelineBoard rows={rows as unknown as PipelineRow[]} counts={counts} />
    </div>
  );
}
