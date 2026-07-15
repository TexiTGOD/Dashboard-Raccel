import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { periodFromParams, type Period } from "@/lib/period";
import { loadKpis, loadMetas, loadTasasHistoricas } from "@/lib/dashboard";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "../operaciones/_components/page-header";
import { MetasCascade } from "../operaciones/_components/metas-cascade";

export default async function MetasPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; periodo?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.rol !== "admin") redirect("/");
  const period = periodFromParams(await searchParams);
  const supabase = await createClient();

  return (
    <div className="tabular-nums">
      <PageHeader title="Metas del período" period={period} />

      {!period.esMesCompleto ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground">
              Las metas son mensuales. Elegí un mes calendario completo (preset “Este mes” o “Mes
              pasado” en el selector) para cargar o editar las metas.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
            Ingresá la meta de cash. El resto se deriva hacia atrás con tus tasas reales. Fijá cualquier
            eslabón con el candado y el resto recalcula. No se puede guardar una meta aritméticamente
            imposible.
          </p>
          <Card>
            <CardContent className="py-5">
              <MetasCascadeLoader period={period} supabase={supabase} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// Carga los datos de la cascada solo cuando el período es un mes completo.
async function MetasCascadeLoader({
  period,
  supabase,
}: {
  period: Period;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const [metas, historico, K] = await Promise.all([
    loadMetas(supabase, period.mesInicioStr),
    loadTasasHistoricas(supabase),
    loadKpis(supabase, period),
  ]);
  const actuales = Object.fromEntries(metas.map((m) => [m.metrica, Number(m.objetivo)]));

  return (
    <MetasCascade
      periodo={period.mesInicioStr}
      historico={historico}
      actuales={actuales}
      leadsActual={K.leads}
      daysLeft={period.daysLeft}
      isCurrent={period.isCurrent}
    />
  );
}
