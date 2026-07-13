import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { periodFromParam } from "@/lib/period";
import { DEFS } from "@/lib/metric-defs";
import { DOLOR_LABEL, CONCIENCIA_LABEL } from "@/lib/types";
import { fmtInt, fmtMonto, fmtPct } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PeriodSelector } from "./_components/period-selector";
import { KpiCard } from "./_components/kpi-card";
import { MetricLabel } from "./_components/metric-label";
import { AttributionTable } from "./_components/attribution-table";
import { MetasEditor } from "./_components/metas-editor";
import { GastosForm } from "./_components/gastos-form";

const usd = (n: number) => fmtMonto(n, "USD");

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="section-title mb-3 border-b border-border pb-2">{children}</h2>;
}

export default async function OperacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.rol !== "admin") redirect("/");

  const sp = await searchParams;
  const period = periodFromParam(sp.periodo);
  const supabase = await createClient();
  const args = { p_start: period.startStr, p_end: period.endStr };

  const [kpisRes, atribRes, dolorRes, concRes, closerRes, metasRes, gastosRes] = await Promise.all([
    supabase.rpc("dashboard_kpis", args),
    supabase.rpc("dashboard_atribucion", args),
    supabase.rpc("dashboard_por_dolor", args),
    supabase.rpc("dashboard_por_conciencia", args),
    supabase.rpc("dashboard_por_closer", args),
    supabase.from("metas").select("metrica, objetivo").eq("periodo", period.startStr),
    supabase.from("gastos").select("categoria, concepto, monto").eq("periodo", period.startStr),
  ]);

  const kr = kpisRes.data?.[0] ?? {};
  const K = {
    leads: Number(kr.leads ?? 0),
    calificados: Number(kr.calificados ?? 0),
    agendas: Number(kr.agendas ?? 0),
    atendidas: Number(kr.atendidas ?? 0),
    no_show: Number(kr.no_show ?? 0),
    ventas: Number(kr.ventas ?? 0),
    facturacion: Number(kr.facturacion ?? 0),
    cash_collected: Number(kr.cash_collected ?? 0),
    aov: Number(kr.aov ?? 0),
    tasa_calificacion: Number(kr.tasa_calificacion ?? 0),
    tasa_agenda: Number(kr.tasa_agenda ?? 0),
    show_rate: Number(kr.show_rate ?? 0),
    close_rate_atendidas: Number(kr.close_rate_atendidas ?? 0),
    close_rate_agendadas: Number(kr.close_rate_agendadas ?? 0),
  };

  const metas = (metasRes.data ?? []) as { metrica: string; objetivo: number }[];
  const metaOf = (m: string): number | null => {
    const row = metas.find((r) => r.metrica === m);
    return row ? Number(row.objetivo) : null;
  };
  const metasActuales = Object.fromEntries(metas.map((m) => [m.metrica, Number(m.objetivo)]));

  const gastos = (gastosRes.data ?? []) as { categoria: string; concepto: string | null; monto: number }[];
  const totalGastos = gastos.reduce((s, g) => s + (Number(g.monto) || 0), 0);
  const neto = K.cash_collected - totalGastos;
  const gastosPorCat = Object.entries(
    gastos.reduce<Record<string, number>>((acc, g) => {
      acc[g.categoria] = (acc[g.categoria] ?? 0) + (Number(g.monto) || 0);
      return acc;
    }, {}),
  );

  const dolores = (dolorRes.data ?? []) as {
    dolor: string; leads: number; agendas: number; ventas: number; close_rate: number;
  }[];
  const conciencias = (concRes.data ?? []) as {
    conciencia: number; leads: number; agendas: number; ventas: number; close_rate: number;
  }[];
  const closers = (closerRes.data ?? []) as {
    closer: string; llamadas: number; atendidas: number; no_show: number; show_rate: number;
    ventas: number; facturacion: number; aov: number; close_rate: number;
  }[];

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
    <div className="space-y-10">
      {/* Header + selector de período */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold">Operaciones</h1>
        <PeriodSelector value={period.periodo} />
      </div>

      {/* Bloque 1 — KPIs */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Cash Collected" def={DEFS.cash_collected} value={K.cash_collected} meta={metaOf("cash_collected")} fmt={usd} ritmoUnit="USD" isCurrent={period.isCurrent} daysLeft={period.daysLeft} />
        <KpiCard label="Facturación" def={DEFS.facturacion} value={K.facturacion} meta={metaOf("facturacion")} fmt={usd} ritmoUnit="USD" isCurrent={period.isCurrent} daysLeft={period.daysLeft} />
        <KpiCard label="Ventas" def={DEFS.ventas} value={K.ventas} meta={metaOf("ventas")} fmt={fmtInt} ritmoUnit="ventas" isCurrent={period.isCurrent} daysLeft={period.daysLeft} />
        <KpiCard label="Llamadas agendadas" def={DEFS.agendas} value={K.agendas} meta={metaOf("agendas")} fmt={fmtInt} ritmoUnit="agendas" isCurrent={period.isCurrent} daysLeft={period.daysLeft} />
      </section>

      {/* Bloque 2 — Embudo */}
      <section>
        <SectionTitle>Embudo</SectionTitle>
        <Card>
          <CardContent className="space-y-1 py-5">
            {funnel.map((f, i) =>
              f.kind === "step" ? (
                <div key={i} className="flex items-center justify-between py-1.5">
                  <MetricLabel label={f.label} def={f.def} />
                  <span className="font-mono text-xl text-foreground">{fmtInt(f.value)}</span>
                </div>
              ) : (
                <div key={i} className="flex items-center justify-between border-l-2 border-border py-1 pl-4">
                  <MetricLabel label={f.label} def={f.def} />
                  <span className="font-mono text-sm text-muted-foreground">{fmtPct(f.rate)}</span>
                </div>
              ),
            )}
            <div className="mt-2 flex flex-wrap gap-6 border-t border-border pt-3 font-mono text-xs text-muted-foreground">
              <span>Close (agendadas): {fmtPct(K.close_rate_agendadas)}</span>
              <span>AOV: {usd(K.aov)}</span>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Bloque 3 — Atribución por pieza */}
      <section>
        <SectionTitle>Atribución por pieza</SectionTitle>
        <Card>
          <CardContent className="py-4">
            <AttributionTable rows={(atribRes.data ?? []) as never} />
          </CardContent>
        </Card>
      </section>

      {/* Bloque 4 — Cortes */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div>
          <SectionTitle>Por dolor</SectionTitle>
          <Card>
            <CardContent className="overflow-x-auto py-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dolor</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Agendas</TableHead>
                    <TableHead className="text-right">Ventas</TableHead>
                    <TableHead className="text-right">Close</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dolores.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">Sin datos.</TableCell></TableRow>
                  ) : dolores.map((d) => (
                    <TableRow key={d.dolor}>
                      <TableCell className="text-foreground">{DOLOR_LABEL[d.dolor] ?? d.dolor}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">{fmtInt(d.leads)}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">{fmtInt(d.agendas)}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">{fmtInt(d.ventas)}</TableCell>
                      <TableCell className="text-right font-mono text-foreground">{fmtPct(d.close_rate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
        <div>
          <SectionTitle>Por nivel de conciencia</SectionTitle>
          <Card>
            <CardContent className="overflow-x-auto py-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Conciencia</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Agendas</TableHead>
                    <TableHead className="text-right">Ventas</TableHead>
                    <TableHead className="text-right">Close</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conciencias.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">Sin datos.</TableCell></TableRow>
                  ) : conciencias.map((c) => (
                    <TableRow key={c.conciencia}>
                      <TableCell className="font-mono text-foreground">{CONCIENCIA_LABEL[c.conciencia] ?? c.conciencia}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">{fmtInt(c.leads)}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">{fmtInt(c.agendas)}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">{fmtInt(c.ventas)}</TableCell>
                      <TableCell className="text-right font-mono text-foreground">{fmtPct(c.close_rate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Bloque 5 — Equipo */}
      <section>
        <SectionTitle>Performance del equipo</SectionTitle>
        <Card>
          <CardContent className="overflow-x-auto py-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Closer</TableHead>
                  <TableHead className="text-right">Llamadas</TableHead>
                  <TableHead className="text-right">Show</TableHead>
                  <TableHead className="text-right">Close</TableHead>
                  <TableHead className="text-right">Ventas</TableHead>
                  <TableHead className="text-right">Facturación</TableHead>
                  <TableHead className="text-right">Ticket prom.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {closers.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-sm text-muted-foreground">Sin llamadas en el período.</TableCell></TableRow>
                ) : closers.map((c) => (
                  <TableRow key={c.closer}>
                    <TableCell className="font-mono text-foreground">{c.closer}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{fmtInt(c.llamadas)}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{fmtPct(c.show_rate)}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{fmtPct(c.close_rate)}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{fmtInt(c.ventas)}</TableCell>
                    <TableCell className="text-right font-mono text-foreground">{usd(Number(c.facturacion))}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{usd(Number(c.aov))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-4 flex flex-wrap gap-6 border-t border-border pt-3 font-mono text-xs text-muted-foreground">
              <span>Setters (global) · Leads {fmtInt(K.leads)} → Agendas {fmtInt(K.agendas)} ({fmtPct(K.tasa_agenda)})</span>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Bloque 6 — Metas */}
      <section>
        <SectionTitle>Metas del período</SectionTitle>
        <Card>
          <CardContent className="py-5">
            <MetasEditor periodo={period.startStr} actuales={metasActuales} />
          </CardContent>
        </Card>
      </section>

      {/* Bloque 7 — Plata neta */}
      <section>
        <SectionTitle>Plata neta</SectionTitle>
        <Card>
          <CardContent className="space-y-5 py-5">
            <div className="grid gap-5 sm:grid-cols-3">
              <div>
                <div className="micro-label">Cash Collected</div>
                <div className="mt-1 font-mono text-2xl text-foreground">{usd(K.cash_collected)}</div>
              </div>
              <div>
                <div className="micro-label">Gastos</div>
                <div className="mt-1 font-mono text-2xl text-foreground">{usd(totalGastos)}</div>
              </div>
              <div>
                <div className="micro-label">Ingreso neto</div>
                <div className="mt-1 font-mono text-2xl text-foreground">{usd(neto)}</div>
              </div>
            </div>

            {gastosPorCat.length > 0 && (
              <div className="space-y-1 border-t border-border pt-3">
                {gastosPorCat.map(([cat, monto]) => (
                  <div key={cat} className="flex justify-between font-mono text-sm">
                    <span className="capitalize text-muted-foreground">{cat}</span>
                    <span className="text-foreground">{usd(monto)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-border pt-4">
              <div className="micro-label mb-3">Cargar gasto</div>
              <GastosForm periodo={period.startStr} />
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
