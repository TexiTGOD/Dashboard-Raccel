import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { periodFromParams } from "@/lib/period";
import { loadRpc } from "@/lib/dashboard";
import { PageHeader } from "../operaciones/_components/page-header";
import { AttributionCards } from "../operaciones/_components/attribution-cards";

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
      <AttributionCards rows={rows as never} />
      <p className="mt-4 max-w-2xl font-mono text-xs text-[var(--text-muted)]">
        La métrica que decide qué contenido hacer mañana es Cash/lead: no cuál trae más gente, cuál
        trae la que paga. Ordenar por volumen miente; por cash/lead, dice la verdad.
      </p>
    </div>
  );
}
