import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { periodFromParams } from "@/lib/period";
import { loadKpis, loadMetas } from "@/lib/dashboard";
import { DEFS } from "@/lib/metric-defs";
import { fmtInt, fmtMonto } from "@/lib/format";
import { PageHeader } from "./_components/page-header";
import { KpiCard } from "./_components/kpi-card";
import { Funnel } from "./_components/funnel";

const usd = (n: number | null) => fmtMonto(n, "USD");

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
  const [K, metas] = await Promise.all([
    loadKpis(supabase, period),
    period.esMesCompleto ? loadMetas(supabase, period.mesInicioStr) : Promise.resolve([]),
  ]);
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
    </div>
  );
}
