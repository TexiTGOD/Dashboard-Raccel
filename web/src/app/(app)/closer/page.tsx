import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { periodFromParams } from "@/lib/period";
import { fetchAllRpcRows } from "@/lib/dashboard";
import { PageHeader } from "../operaciones/_components/page-header";
import { PipelineBoard, type PipelineCounts, type PipelineRow } from "./pipeline-board";
import { ListaLlamadas } from "./lista-llamadas";
import type { LlamadaListaRow, VistaLlamadas } from "@/lib/types";

// Link server-side al modo Pipeline/Lista, preservando el resto de los query
// params (período, filtros de Lista) — no es un componente cliente, así que
// arma el href a mano en vez de useSearchParams.
function hrefModo(sp: Record<string, string | undefined>, modo: "pipeline" | "lista"): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v) params.set(k, v);
  params.set("modo", modo);
  return `/closer?${params.toString()}`;
}

// Llamadas: Pipeline (kanban por estado) + Lista (tabla/cards con accesos
// rápidos). El panel de métricas/comisión de la closer vive aparte, en
// /panel — son dos tareas distintas (mirar el mes vs. trabajar la lista) y
// competían por espacio en una sola página.
export default async function CloserPage({
  searchParams,
}: {
  searchParams: Promise<{
    desde?: string; hasta?: string; periodo?: string;
    modo?: string; vista?: string;
    resultado?: string; producto?: string; objecion?: string; closer?: string;
  }>;
}) {
  const profile = await requireProfile();
  if (profile.rol !== "admin" && profile.rol !== "closer") redirect("/");
  const esCloser = profile.rol === "closer";

  const sp = await searchParams;
  const period = periodFromParams(sp);
  const supabase = await createClient();
  const args = { p_start: period.startStr, p_end: period.endStr };

  // Pipeline es la vista por defecto (para closer y admin); Lista queda a un
  // click para trabajar la tabla con filtros y accesos rápidos.
  const modo = sp.modo === "lista" ? "lista" : "pipeline";
  const vistaDefault: VistaLlamadas = esCloser ? "seguimientos" : "todas";
  const vista: VistaLlamadas =
    sp.vista === "seguimientos" ||
    sp.vista === "sin_desenlace" ||
    sp.vista === "venta_sin_registrar" ||
    sp.vista === "todas"
      ? sp.vista
      : vistaDefault;
  const filtroResultado = sp.resultado ?? "";
  const filtroProducto = sp.producto ?? "";
  const filtroObjecion = sp.objecion ?? "";
  const filtroCloser = sp.closer ?? "";

  // Pipeline y Lista son modos EXCLUYENTES de la misma sección: solo se pide
  // al server lo que el modo activo va a mostrar (nada de traer ambos y
  // descartar la mitad).
  const [countsRes, listaRows, chipsRes] = await Promise.all([
    modo === "pipeline"
      ? supabase.rpc("dashboard_pipeline_llamadas_counts", args)
      : Promise.resolve({ data: null }),
    modo === "lista"
      ? supabase
          .rpc("dashboard_llamadas_lista", {
            p_vista: vista,
            p_resultado: filtroResultado || null,
            p_producto: filtroProducto || null,
            p_objecion: filtroObjecion || null,
            p_closer: filtroCloser || null,
            p_start: vista === "todas" ? period.startStr : null,
            p_end: vista === "todas" ? period.endStr : null,
          })
          .then((r) => (r.data ?? []) as LlamadaListaRow[])
      : Promise.resolve<LlamadaListaRow[]>([]),
    modo === "lista"
      ? supabase.rpc("dashboard_llamadas_chips").then((r) => r.data?.[0] ?? null)
      : Promise.resolve(null),
  ]);

  const c = (countsRes.data?.[0] ?? {}) as Record<string, number | null>;
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
  // Recién acá se sabe counts.total (hace falta para cortar el paginado), así
  // que este fetch no puede ir en el Promise.all de arriba.
  const rows =
    modo === "pipeline" ? await fetchAllRpcRows(supabase, "dashboard_pipeline_llamadas", args, counts.total) : [];

  const chipsData = (chipsRes ?? {}) as Record<string, number | null>;
  const chips = {
    seguimientos_pendientes: Number(chipsData.seguimientos_pendientes ?? 0),
    sin_desenlace: Number(chipsData.sin_desenlace ?? 0),
    venta_sin_registrar: Number(chipsData.venta_sin_registrar ?? 0),
  };

  return (
    <div className="tabular-nums space-y-4">
      <PageHeader title={modo === "pipeline" ? "Pipeline" : "Llamadas"} period={period} />

      <div className="flex justify-end">
        <div className="flex gap-1 rounded-full border border-border p-1">
          {(["lista", "pipeline"] as const).map((m) => (
            <Link
              key={m}
              href={hrefModo(sp, m)}
              className={`rounded-full px-3 py-1 text-sm transition-colors ${
                modo === m
                  ? "bg-[var(--neon-active)] text-primary"
                  : "text-muted-foreground hover:bg-[var(--surface-elevated)]"
              }`}
            >
              {m === "lista" ? "Lista" : "Pipeline"}
            </Link>
          ))}
        </div>
      </div>

      {modo === "lista" ? (
        <ListaLlamadas
          rows={listaRows}
          chips={chips}
          isAdmin={!esCloser}
          vista={vista}
          resultado={filtroResultado}
          producto={filtroProducto}
          objecion={filtroObjecion}
          closerFiltro={filtroCloser}
        />
      ) : (
        <PipelineBoard rows={rows as unknown as PipelineRow[]} counts={counts} />
      )}
    </div>
  );
}
