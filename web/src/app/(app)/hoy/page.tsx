import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { periodFromParams } from "@/lib/period";
import { loadKpis, loadMetas } from "@/lib/dashboard";
import { fmtFecha, fmtMonto, fmtDec } from "@/lib/format";
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
  searchParams: Promise<{ desde?: string; hasta?: string; periodo?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.rol !== "admin") redirect("/");
  const period = periodFromParams(await searchParams);
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const [K, metas, pendRes, moraRes] = await Promise.all([
    loadKpis(supabase, period),
    loadMetas(supabase, period.mesInicioStr),
    supabase
      .from("bookings")
      .select("id, fecha_llamada, nombre, closer, lead:leads(nombre, crisis)")
      .eq("estado", "programada")
      .lt("fecha_llamada", nowIso)
      .order("fecha_llamada", { ascending: true }),
    supabase.rpc("dashboard_mora"),
  ]);

  const pendientes = ((pendRes.data ?? []) as unknown as PendRow[]).filter((b) => !b.lead?.crisis);
  const mora = (moraRes.data ?? []) as {
    cuota_id: string; numero_cuota: number; cuotas_total: number | null; monto_esperado: number;
    fecha_vencimiento: string; dias_vencida: number; comprador: string | null; booking_id: string | null;
  }[];
  // "pago único" cuando la venta es de 1 cuota; si no, "cuota N/total".
  const etiquetaCuota = (n: number, total: number | null) =>
    total != null && total <= 1 ? "pago único" : `cuota ${n}${total ? `/${total}` : ""}`;

  // Ritmo del mes: cascada desde el gap de cash, en unidades de negocio.
  const metaOf = (m: string) => {
    const r = metas.find((x) => x.metrica === m);
    return r ? Number(r.objetivo) : null;
  };
  const cashMeta = metaOf("cash_collected");
  const gap = cashMeta != null ? Math.max(cashMeta - K.cash_collected, 0) : null;
  // tasa del período (K) con fallback al supuesto de la meta.
  const tasa = (kv: number | null, mk: string): { v: number | null; sup: boolean } => {
    if (kv != null && kv > 0) return { v: kv, sup: false };
    const m = metaOf(mk);
    return m != null && m > 0 ? { v: m, sup: true } : { v: null, sup: false };
  };
  // Un solo eslabón de plata: AOV cash (plata real que entra por venta). Ya
  // captura el efecto de las cuotas — no hay paso de facturación ni % cobrado.
  const aovT = tasa(K.aov_cash, "aov");
  const closeT = tasa(K.close_rate_atendidas, "close_rate");
  const showT = tasa(K.show_rate, "show_rate");
  const agendaT = tasa(K.tasa_agenda, "tasa_agenda");
  let ventasGap: number | null = null,
    atendidasGap: number | null = null,
    agendasGap: number | null = null,
    leadsGap: number | null = null;
  if (gap != null && gap > 0) {
    if (aovT.v) ventasGap = gap / aovT.v;
    if (ventasGap != null && closeT.v) atendidasGap = ventasGap / closeT.v;
    if (atendidasGap != null && showT.v) agendasGap = atendidasGap / showT.v;
    if (agendasGap != null && agendaT.v) leadsGap = agendasGap / agendaT.v;
  }
  const algunSupuesto = [aovT, closeT, showT, agendaT].some((t) => t.sup);
  const dl = period.daysLeft;

  return (
    <div className="tabular-nums">
      <PageHeader title="Hoy" period={period} />

      <Card className="mb-6">
        <CardContent className="py-4">
          {!period.esMesCompleto ? (
            <p className="text-sm text-muted-foreground">
              El ritmo aplica a meses calendario completos. Elegí un mes (preset “Este mes”).
            </p>
          ) : cashMeta == null ? (
            <p className="text-sm text-muted-foreground">Cargá una meta de cash en Metas para ver el ritmo.</p>
          ) : gap === 0 ? (
            <p className="font-mono text-sm text-foreground">
              Meta de cash cumplida ✓ ({fmtMonto(K.cash_collected, "USD")} de {fmtMonto(cashMeta, "USD")}).
            </p>
          ) : ventasGap == null ? (
            <p className="text-sm text-muted-foreground">
              Te faltan {fmtMonto(gap ?? 0, "USD")} de cash, pero no hay tasas suficientes (ni del período ni
              supuestos en Metas) para traducirlo a unidades de negocio.
            </p>
          ) : (
            <div className="space-y-1 font-mono text-sm text-foreground">
              <p>
                Te faltan <span className="text-primary">{fmtMonto(gap ?? 0, "USD")}</span> → {fmtDec(ventasGap)}{" "}
                ventas → {atendidasGap != null ? fmtDec(atendidasGap) : "—"} atendidas →{" "}
                {agendasGap != null ? fmtDec(agendasGap) : "—"} agendas
                {leadsGap != null && <> → {fmtDec(leadsGap)} leads</>}.
              </p>
              {period.isCurrent && dl > 0 && (agendasGap != null || leadsGap != null) && (
                <p className="text-muted-foreground">
                  Quedan {dl} días →{" "}
                  {agendasGap != null && (
                    <span className="text-primary">{fmtDec(agendasGap / dl)} agendas/día</span>
                  )}
                  {leadsGap != null && <> · {fmtDec(leadsGap / dl)} leads/día</>}.
                </p>
              )}
              {algunSupuesto && (
                <p className="text-[11px] text-[var(--text-muted)]">
                  * algunas tasas usan el supuesto de la meta (no hay dato suficiente del período).
                </p>
              )}
            </div>
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

      <section>
        <h2 className="section-title mb-3 border-b border-border pb-2">Cuotas vencidas ({mora.length})</h2>
        {mora.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin cuotas vencidas.</p>
        ) : (
          <div className="space-y-2">
            {mora.slice(0, 8).map((c) => {
              const inner = (
                <Card className="gap-0 py-0 transition-colors hover:border-primary/40 hover:bg-[var(--neon-wash)]">
                  <CardContent className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-foreground">
                        {c.comprador ?? "—"} · {etiquetaCuota(c.numero_cuota, c.cuotas_total)}
                      </div>
                      <div className="truncate font-mono text-xs text-muted-foreground">
                        venció {fmtFecha(c.fecha_vencimiento)} · <span className="text-danger">{c.dias_vencida}d</span>
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-sm text-foreground">
                      {fmtMonto(c.monto_esperado, "USD")}
                    </span>
                  </CardContent>
                </Card>
              );
              return c.booking_id ? (
                <Link key={c.cuota_id} href={`/closer/${c.booking_id}`} className="block">{inner}</Link>
              ) : (
                <div key={c.cuota_id}>{inner}</div>
              );
            })}
            {mora.length > 8 && (
              <Link href="/cobranzas" className="block font-mono text-xs text-primary">
                ver todas en Cobranzas →
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
