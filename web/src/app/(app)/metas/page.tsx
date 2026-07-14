import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { periodFromParam } from "@/lib/period";
import { loadMetas } from "@/lib/dashboard";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "../operaciones/_components/page-header";
import { MetasEditor } from "../operaciones/_components/metas-editor";

export default async function MetasPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.rol !== "admin") redirect("/");
  const period = periodFromParam((await searchParams).periodo);
  const supabase = await createClient();
  const metas = await loadMetas(supabase, period);
  const actuales = Object.fromEntries(metas.map((m) => [m.metrica, Number(m.objetivo)]));

  return (
    <div className="tabular-nums">
      <PageHeader title="Metas del período" periodo={period.periodo} />
      <Card>
        <CardContent className="py-5">
          <MetasEditor periodo={period.startStr} actuales={actuales} />
        </CardContent>
      </Card>
    </div>
  );
}
