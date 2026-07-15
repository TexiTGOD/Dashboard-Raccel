import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { periodFromParams } from "@/lib/period";
import { loadRpc } from "@/lib/dashboard";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "../operaciones/_components/page-header";
import { AttributionTable } from "../operaciones/_components/attribution-table";

export default async function AtribucionPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; periodo?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.rol !== "admin") redirect("/");
  const period = periodFromParams(await searchParams);
  const supabase = await createClient();
  const rows = await loadRpc(supabase, "dashboard_atribucion", period);

  return (
    <div className="tabular-nums">
      <PageHeader title="Atribución por pieza" period={period} />
      <Card>
        <CardContent className="py-4">
          <AttributionTable rows={rows as never} />
        </CardContent>
      </Card>
      <p className="mt-3 max-w-2xl font-mono text-xs text-[var(--text-muted)]">
        La columna que decide qué contenido hacer mañana es Cash/lead: no cuál trae más gente, cuál
        trae la que paga. Ordenada por volumen miente; por cash/lead, dice la verdad.
      </p>
    </div>
  );
}
