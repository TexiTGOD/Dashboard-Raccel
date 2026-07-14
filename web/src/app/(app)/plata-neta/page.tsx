import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { periodFromParam } from "@/lib/period";
import { loadKpis, loadGastos } from "@/lib/dashboard";
import { fmtMonto } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "../operaciones/_components/page-header";
import { GastosForm } from "../operaciones/_components/gastos-form";

const usd = (n: number | null) => fmtMonto(n, "USD");

export default async function PlataNetaPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.rol !== "admin") redirect("/");
  const period = periodFromParam((await searchParams).periodo);
  const supabase = await createClient();
  const [K, gastos] = await Promise.all([loadKpis(supabase, period), loadGastos(supabase, period)]);

  const totalGastos = gastos.reduce((s, g) => s + (Number(g.monto) || 0), 0);
  const neto = K.cash_collected - totalGastos;
  const porCat = Object.entries(
    gastos.reduce<Record<string, number>>((acc, g) => {
      acc[g.categoria] = (acc[g.categoria] ?? 0) + (Number(g.monto) || 0);
      return acc;
    }, {}),
  );

  return (
    <div className="tabular-nums">
      <PageHeader title="Plata neta" periodo={period.periodo} />
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
          {porCat.length > 0 && (
            <div className="space-y-1 border-t border-border pt-3">
              {porCat.map(([cat, monto]) => (
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
    </div>
  );
}
