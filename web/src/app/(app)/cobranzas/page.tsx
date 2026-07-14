import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { periodFromParam } from "@/lib/period";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "../operaciones/_components/page-header";

export default async function CobranzasPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.rol !== "admin") redirect("/");
  const period = periodFromParam((await searchParams).periodo);

  return (
    <div className="tabular-nums">
      <PageHeader title="Cobranzas" periodo={period.periodo} />
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          Plan de cuotas, cash proyectado y mora — en construcción (T2.2).
        </CardContent>
      </Card>
    </div>
  );
}
