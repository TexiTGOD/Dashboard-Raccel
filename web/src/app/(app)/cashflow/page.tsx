import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { periodFromParams, ymd, todayUTC } from "@/lib/period";
import { loadKpis, loadGastos } from "@/lib/dashboard";
import { fmtMonto } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "../operaciones/_components/page-header";
import { GastosTable } from "./gastos-table";

const usd = (n: number | null) => fmtMonto(n, "USD");

export default async function CashflowPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; periodo?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.rol !== "admin") redirect("/");
  const period = periodFromParams(await searchParams);
  const supabase = await createClient();
  // Gastos ahora tienen fecha propia → cash y gastos corren sobre el mismo rango.
  const [K, gastos] = await Promise.all([loadKpis(supabase, period), loadGastos(supabase, period)]);

  const totalGastos = gastos.reduce((s, g) => s + (Number(g.monto) || 0), 0);
  const neto = K.cash_collected - totalGastos;
  const porCat = Object.entries(
    gastos.reduce<Record<string, number>>((acc, g) => {
      acc[g.categoria] = (acc[g.categoria] ?? 0) + (Number(g.monto) || 0);
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  // La fecha de alta por defecto cae dentro del rango visto (para que el gasto aparezca).
  const hoy = ymd(todayUTC());
  const defaultFecha = hoy < period.desde ? period.desde : hoy > period.hasta ? period.hasta : hoy;

  return (
    <div className="tabular-nums">
      <PageHeader title="Cashflow" period={period} />
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
              <div className={`mt-1 font-mono text-2xl ${neto < 0 ? "text-danger" : "text-foreground"}`}>{usd(neto)}</div>
            </div>
          </div>

          {porCat.length > 0 && (
            <div className="space-y-1 border-t border-border pt-3">
              <div className="micro-label mb-1">Resumen por categoría</div>
              {porCat.map(([cat, monto]) => (
                <div key={cat} className="flex justify-between font-mono text-sm">
                  <span className="capitalize text-muted-foreground">{cat}</span>
                  <span className="text-foreground">{usd(monto)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-border pt-4">
            <div className="micro-label mb-3">Detalle de gastos</div>
            <GastosTable gastos={gastos} defaultFecha={defaultFecha} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
