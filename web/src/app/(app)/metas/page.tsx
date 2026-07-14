import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { periodFromParam } from "@/lib/period";
import { loadKpis, loadMetas, loadTasasHistoricas } from "@/lib/dashboard";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "../operaciones/_components/page-header";
import { MetasCascade } from "../operaciones/_components/metas-cascade";

export default async function MetasPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.rol !== "admin") redirect("/");
  const period = periodFromParam((await searchParams).periodo);
  const supabase = await createClient();
  const [metas, historico, K] = await Promise.all([
    loadMetas(supabase, period),
    loadTasasHistoricas(supabase),
    loadKpis(supabase, period),
  ]);
  const actuales = Object.fromEntries(metas.map((m) => [m.metrica, Number(m.objetivo)]));

  return (
    <div className="tabular-nums">
      <PageHeader title="Metas del período" periodo={period.periodo} />
      <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
        Ingresá la meta de cash. El resto se deriva hacia atrás con tus tasas reales de los últimos 90
        días. Fijá cualquier eslabón con el candado y el resto recalcula. No se puede guardar una meta
        aritméticamente imposible.
      </p>
      <Card>
        <CardContent className="py-5">
          <MetasCascade
            periodo={period.startStr}
            historico={historico}
            actuales={actuales}
            leadsActual={K.leads}
            daysLeft={period.daysLeft}
            isCurrent={period.isCurrent}
          />
        </CardContent>
      </Card>
    </div>
  );
}
