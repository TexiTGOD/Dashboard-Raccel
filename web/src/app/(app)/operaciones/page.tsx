import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { periodFromParam } from "@/lib/period";
import { loadKpis, loadMetas } from "@/lib/dashboard";
import { DEFS } from "@/lib/metric-defs";
import { fmtInt, fmtMonto, fmtPct } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "./_components/page-header";
import { KpiCard } from "./_components/kpi-card";
import { MetricLabel } from "./_components/metric-label";

const usd = (n: number | null) => fmtMonto(n, "USD");

export default async function OperacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.rol !== "admin") redirect("/");
  const period = periodFromParam((await searchParams).periodo);
  const supabase = await createClient();
  const [K, metas] = await Promise.all([loadKpis(supabase, period), loadMetas(supabase, period)]);
  const metaOf = (m: string) => {
    const r = metas.find((x) => x.metrica === m);
    return r ? Number(r.objetivo) : null;
  };

  const funnel = [
    { kind: "step", label: "Leads", def: DEFS.leads, value: K.leads },
    { kind: "rate", label: "% Calificación", def: DEFS.tasa_calificacion, rate: K.tasa_calificacion },
    { kind: "step", label: "Calificados", def: DEFS.calificados, value: K.calificados },
    { kind: "rate", label: "Tasa de agenda", def: DEFS.tasa_agenda, rate: K.tasa_agenda },
    { kind: "step", label: "Agendas", def: DEFS.agendas, value: K.agendas },
    { kind: "rate", label: "Show-up rate", def: DEFS.show_rate, rate: K.show_rate },
    { kind: "step", label: "Atendidas", def: DEFS.atendidas, value: K.atendidas },
    { kind: "rate", label: "Close rate (atendidas)", def: DEFS.close_rate_atendidas, rate: K.close_rate_atendidas },
    { kind: "step", label: "Ventas", def: DEFS.ventas, value: K.ventas },
  ] as const;

  return (
    <div className="tabular-nums">
      <PageHeader title="Operaciones" periodo={period.periodo} />

      <section className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Cash Collected" def={DEFS.cash_collected} value={K.cash_collected} meta={metaOf("cash_collected")} fmt={usd} ritmoUnit="USD" isCurrent={period.isCurrent} daysLeft={period.daysLeft} />
        <KpiCard label="Facturación" def={DEFS.facturacion} value={K.facturacion} meta={metaOf("facturacion")} fmt={usd} ritmoUnit="USD" isCurrent={period.isCurrent} daysLeft={period.daysLeft} />
        <KpiCard label="Ventas" def={DEFS.ventas} value={K.ventas} meta={metaOf("ventas")} fmt={(n) => fmtInt(n)} ritmoUnit="ventas" isCurrent={period.isCurrent} daysLeft={period.daysLeft} />
        <KpiCard label="Llamadas agendadas" def={DEFS.agendas} value={K.agendas} meta={metaOf("agendas")} fmt={(n) => fmtInt(n)} ritmoUnit="agendas" isCurrent={period.isCurrent} daysLeft={period.daysLeft} />
      </section>

      <section>
        <h2 className="section-title mb-3 border-b border-border pb-2">Embudo</h2>
        <Card>
          <CardContent className="space-y-1 py-5">
            {funnel.map((f, i) =>
              f.kind === "step" ? (
                <div key={i} className="flex items-center justify-between py-1.5">
                  <MetricLabel label={f.label} def={f.def} />
                  <span className="font-mono text-xl text-foreground">{fmtInt(f.value)}</span>
                </div>
              ) : (
                (() => {
                  const incompleto = f.label === "Show-up rate" && K.pendientes > 0;
                  return (
                    <div key={i} className="flex items-center justify-between border-l-2 border-border py-1 pl-4">
                      <MetricLabel label={f.label} def={f.def} />
                      <span className="font-mono text-sm">
                        <span className={incompleto ? "text-[var(--text-muted)]" : "text-muted-foreground"}>
                          {fmtPct(f.rate)}
                          {incompleto ? "*" : ""}
                        </span>
                        {incompleto && <span className="ml-2 text-warning">· {K.pendientes} sin desenlace</span>}
                      </span>
                    </div>
                  );
                })()
              ),
            )}
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-3 font-mono text-xs text-muted-foreground">
              <span>Close (agendadas): {fmtPct(K.close_rate_agendadas)}</span>
              <span>AOV: {usd(K.aov)}</span>
              {K.canceladas > 0 && <span>Canceladas: {fmtInt(K.canceladas)}</span>}
              {K.pendientes > 0 && (
                <span className="text-warning">* show-up incompleto — {K.pendientes} llamada(s) pasadas sin desenlace cargado</span>
              )}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
