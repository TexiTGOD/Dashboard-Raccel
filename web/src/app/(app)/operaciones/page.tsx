import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { periodFromParams } from "@/lib/period";
import { loadKpis, loadMetas } from "@/lib/dashboard";
import { DEFS } from "@/lib/metric-defs";
import { fmtInt, fmtMonto, fmtPct } from "@/lib/format";
import { PageHeader } from "./_components/page-header";
import { KpiCard } from "./_components/kpi-card";
import { Funnel } from "./_components/funnel";

const usd = (n: number | null) => fmtMonto(n, "USD");

// Contador simple de una dimensión de calificación. "Las 3" se destaca: es la
// intersección, el número que dice cuántos leads están calificados de verdad.
function CalifCard({
  label,
  value,
  total,
  destacado,
}: {
  label: string;
  value: number;
  total: number;
  destacado?: boolean;
}) {
  const pct = total > 0 ? value / total : null;
  return (
    <div
      className={`rounded-lg border bg-card p-5 tabular-nums ${
        destacado ? "border-primary/40" : "border-border"
      }`}
    >
      <div className="micro-label">{label}</div>
      <div className="mt-2 font-mono text-3xl leading-none text-foreground">{fmtInt(value)}</div>
      <div className="mt-2 font-mono text-xs text-muted-foreground">
        {pct == null ? "—" : `${fmtPct(pct)} de los leads`}
      </div>
    </div>
  );
}

export default async function OperacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; periodo?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.rol !== "admin") redirect("/");
  const period = periodFromParams(await searchParams);
  const supabase = await createClient();
  // Metas son mensuales: solo se cargan/muestran si el rango es un mes completo.
  const [K, metas, countsRes] = await Promise.all([
    loadKpis(supabase, period),
    period.esMesCompleto ? loadMetas(supabase, period.mesInicioStr) : Promise.resolve([]),
    // Contadores de calificación (sistema nuevo: etiquetas de ManyChat).
    supabase.rpc("dashboard_rows_counts", { p_start: period.startStr, p_end: period.endStr }),
  ]);
  const cnt = (countsRes.data?.[0] ?? {}) as Record<string, number | null>;
  const calif = {
    dolor: Number(cnt.calif_dolor ?? 0),
    urgencia: Number(cnt.calif_urgencia ?? 0),
    economica: Number(cnt.calif_economica ?? 0),
    lasTres: Number(cnt.calif_las_tres ?? 0),
    leads: Number(cnt.leads_count ?? 0),
  };
  const metaOf = (m: string) => {
    const r = metas.find((x) => x.metrica === m);
    return r ? Number(r.objetivo) : null;
  };

  return (
    <div className="tabular-nums">
      <PageHeader title="Operaciones" period={period} />

      {!period.esMesCompleto && (
        <p className="mb-4 font-mono text-xs text-[var(--text-muted)]">
          Rango custom: metas y ritmo aplican a meses calendario completos, no se muestran.
        </p>
      )}

      <section className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Cash Collected" def={DEFS.cash_collected} value={K.cash_collected} meta={metaOf("cash_collected")} fmt={usd} ritmoUnit="USD" isCurrent={period.isCurrent} daysLeft={period.daysLeft} mostrarMeta={period.esMesCompleto} />
        <KpiCard label="Facturación" def={DEFS.facturacion} value={K.facturacion} meta={metaOf("facturacion")} fmt={usd} ritmoUnit="USD" isCurrent={period.isCurrent} daysLeft={period.daysLeft} mostrarMeta={period.esMesCompleto} />
        <KpiCard label="Ventas" def={DEFS.ventas} value={K.ventas} meta={metaOf("ventas")} fmt={(n) => fmtInt(n)} ritmoUnit="ventas" isCurrent={period.isCurrent} daysLeft={period.daysLeft} mostrarMeta={period.esMesCompleto} />
        <KpiCard label="Llamadas agendadas" def={DEFS.agendas} value={K.agendas} meta={metaOf("agendas")} fmt={(n) => fmtInt(n)} ritmoUnit="agendas" isCurrent={period.isCurrent} daysLeft={period.daysLeft} mostrarMeta={period.esMesCompleto} />
      </section>

      <section>
        <h2 className="section-title mb-3 border-b border-border pb-2">Embudo</h2>
        <Funnel K={K} />
      </section>

      {/* Calificación de leads (3 dimensiones). Solo lectura: la fuente de verdad
          son las etiquetas de ManyChat, que entran por el webhook calificacion-lead. */}
      <section className="mt-10">
        <h2 className="section-title mb-3 border-b border-border pb-2">Calificación de leads</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CalifCard label="Dolor" value={calif.dolor} total={calif.leads} />
          <CalifCard label="Urgencia" value={calif.urgencia} total={calif.leads} />
          <CalifCard label="Económica" value={calif.economica} total={calif.leads} />
          <CalifCard label="Las 3" value={calif.lasTres} total={calif.leads} destacado />
        </div>
        <p className="mt-3 font-mono text-[11px] text-[var(--text-muted)]">
          Leads del período con la etiqueta puesta en ManyChat. El % es sobre los {fmtInt(calif.leads)} leads
          del período.
        </p>
      </section>
    </div>
  );
}
