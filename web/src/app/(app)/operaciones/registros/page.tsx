import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { periodFromParam } from "@/lib/period";
import { Card, CardContent } from "@/components/ui/card";
import { PeriodSelector } from "../_components/period-selector";
import { RegistrosTables } from "./registros-tables";

export default async function RegistrosPage({
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

  const [pagos, ventas, llamadas, leads] = await Promise.all([
    supabase.rpc("dashboard_rows_pagos", args),
    supabase.rpc("dashboard_rows_ventas", args),
    supabase.rpc("dashboard_rows_llamadas", args),
    supabase.rpc("dashboard_rows_leads", args),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Registros</h1>
          <p className="text-sm text-muted-foreground">
            El detalle fila por fila. El total de Pagos coincide con el Cash Collected del período.
          </p>
        </div>
        <PeriodSelector value={period.periodo} />
      </div>

      <Card>
        <CardContent className="py-4">
          <RegistrosTables
            pagos={(pagos.data ?? []) as never}
            ventas={(ventas.data ?? []) as never}
            llamadas={(llamadas.data ?? []) as never}
            leads={(leads.data ?? []) as never}
          />
        </CardContent>
      </Card>
    </div>
  );
}
