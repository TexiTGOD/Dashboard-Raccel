import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { periodFromParam } from "@/lib/period";
import { loadKpis, loadMetas } from "@/lib/dashboard";
import { fmtFecha, fmtMonto } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "../operaciones/_components/page-header";

interface PendRow {
  id: string;
  fecha_llamada: string | null;
  nombre: string | null;
  closer: string | null;
  lead: { nombre: string | null; crisis: boolean } | null;
}

export default async function HoyPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.rol !== "admin") redirect("/");
  const period = periodFromParam((await searchParams).periodo);
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const [K, metas, pendRes, ventasRes] = await Promise.all([
    loadKpis(supabase, period),
    loadMetas(supabase, period),
    supabase
      .from("bookings")
      .select("id, fecha_llamada, nombre, closer, lead:leads(nombre, crisis)")
      .eq("estado", "programada")
      .lt("fecha_llamada", nowIso)
      .order("fecha_llamada", { ascending: true }),
    supabase.from("sales").select("id").eq("matcheada", false),
  ]);

  const pendientes = ((pendRes.data ?? []) as unknown as PendRow[]).filter((b) => !b.lead?.crisis);
  const ventasSinMatchear = (ventasRes.data ?? []).length;

  // Ritmo del mes contra la meta de cash.
  const cashMeta = metas.find((m) => m.metrica === "cash_collected")?.objetivo ?? null;
  const falta = cashMeta != null ? Math.max(Number(cashMeta) - K.cash_collected, 0) : 0;
  const ritmo =
    cashMeta != null && period.isCurrent && period.daysLeft > 0 && falta > 0
      ? falta / period.daysLeft
      : null;

  return (
    <div className="tabular-nums">
      <PageHeader title="Hoy" periodo={period.periodo} />

      <Card className="mb-6">
        <CardContent className="py-4">
          {cashMeta == null ? (
            <p className="text-sm text-muted-foreground">Cargá una meta de cash en Metas para ver el ritmo.</p>
          ) : ritmo == null ? (
            <p className="font-mono text-sm text-foreground">
              Cash {fmtMonto(K.cash_collected, "USD")} de {fmtMonto(Number(cashMeta), "USD")}
              {falta === 0 ? " — meta cumplida ✓" : ""}
            </p>
          ) : (
            <p className="font-mono text-sm text-foreground">
              Necesitás <span className="text-primary">{fmtMonto(ritmo, "USD")}/día</span> de cash para llegar a la
              meta. Vas {fmtMonto(K.cash_collected, "USD")} de {fmtMonto(Number(cashMeta), "USD")} · quedan{" "}
              {period.daysLeft} días.
            </p>
          )}
        </CardContent>
      </Card>

      <section className="mb-6">
        <h2 className="section-title mb-3 border-b border-border pb-2">
          Llamadas sin desenlace ({pendientes.length})
        </h2>
        {pendientes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada pendiente de cargar. Al día.</p>
        ) : (
          <div className="space-y-2">
            {pendientes.map((b) => (
              <Link key={b.id} href={`/closer/${b.id}`} className="block">
                <Card className="gap-0 py-0 transition-colors hover:border-primary/40 hover:bg-[var(--neon-wash)]">
                  <CardContent className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-foreground">{b.lead?.nombre ?? b.nombre ?? "Sin nombre"}</div>
                      <div className="truncate font-mono text-xs text-muted-foreground">
                        {b.closer ?? "—"} · {fmtFecha(b.fecha_llamada)}
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-xs text-primary">cargar →</span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mb-6">
        <h2 className="section-title mb-3 border-b border-border pb-2">
          Ventas sin matchear ({ventasSinMatchear})
        </h2>
        {ventasSinMatchear === 0 ? (
          <p className="text-sm text-muted-foreground">No hay ventas sin conciliar.</p>
        ) : (
          <Link href="/closer/ventas-sin-matchear" className="block">
            <Card className="transition-colors hover:border-primary/40 hover:bg-[var(--neon-wash)]">
              <CardContent className="flex items-center justify-between py-4">
                <span className="font-mono text-sm text-foreground">
                  {ventasSinMatchear} venta(s) esperando conciliación
                </span>
                <span className="font-mono text-xs text-primary">conciliar →</span>
              </CardContent>
            </Card>
          </Link>
        )}
      </section>

      <section>
        <h2 className="section-title mb-3 border-b border-border pb-2">Cuotas vencidas</h2>
        <p className="text-sm text-muted-foreground">
          Disponible cuando esté el plan de cuotas (Cobranzas · T2.2).
        </p>
      </section>
    </div>
  );
}
