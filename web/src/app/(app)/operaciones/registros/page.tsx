import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { periodFromParams } from "@/lib/period";
import { Card, CardContent } from "@/components/ui/card";
import { RangePicker } from "../_components/period-selector";
import { RegistrosTables } from "./registros-tables";

export default async function RegistrosPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; periodo?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.rol !== "admin") redirect("/");

  const period = periodFromParams(await searchParams);
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
        <RangePicker period={period} />
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
