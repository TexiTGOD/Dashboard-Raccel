import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { periodFromParam } from "@/lib/period";
import { loadRpc } from "@/lib/dashboard";
import { fmtFecha, fmtMonto } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "../operaciones/_components/page-header";

const usd = (n: number | null) => fmtMonto(n, "USD");

interface CuotaPeriodo {
  cuota_id: string; numero_cuota: number; monto_esperado: number; fecha_vencimiento: string;
  cobrada: boolean; comprador: string | null; producto: string | null; booking_id: string | null;
}
interface MoraRow {
  cuota_id: string; numero_cuota: number; monto_esperado: number; fecha_vencimiento: string;
  dias_vencida: number; comprador: string | null; producto: string | null; booking_id: string | null;
}

function Fila({
  href, izq, sub, monto, extra,
}: {
  href: string | null; izq: string; sub: string; monto: number; extra?: React.ReactNode;
}) {
  const inner = (
    <Card className={href ? "gap-0 py-0 transition-colors hover:border-primary/40 hover:bg-[var(--neon-wash)]" : "gap-0 py-0"}>
      <CardContent className="flex items-center justify-between gap-3 px-5 py-3">
        <div className="min-w-0">
          <div className="truncate text-sm text-foreground">{izq}</div>
          <div className="truncate font-mono text-xs text-muted-foreground">{sub}</div>
        </div>
        <div className="flex shrink-0 items-center gap-3 font-mono text-sm">
          {extra}
          <span className="text-foreground">{usd(monto)}</span>
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href} className="block">{inner}</Link> : inner;
}

export default async function CobranzasPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.rol !== "admin") redirect("/");
  const period = periodFromParam((await searchParams).periodo);
  const supabase = await createClient();

  const [cuotasPeriodo, moraRes] = await Promise.all([
    loadRpc(supabase, "dashboard_cuotas_periodo", period) as Promise<CuotaPeriodo[]>,
    supabase.rpc("dashboard_mora"),
  ]);
  const mora = (moraRes.data ?? []) as MoraRow[];

  const proyectado = cuotasPeriodo.reduce((s, c) => s + Number(c.monto_esperado || 0), 0);
  const cobrado = cuotasPeriodo.filter((c) => c.cobrada).reduce((s, c) => s + Number(c.monto_esperado || 0), 0);
  const moraTotal = mora.reduce((s, c) => s + Number(c.monto_esperado || 0), 0);
  const pendientesPeriodo = cuotasPeriodo.filter((c) => !c.cobrada);

  return (
    <div className="tabular-nums">
      <PageHeader title="Cobranzas" periodo={period.periodo} />

      <section className="mb-8 grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="py-5">
          <div className="micro-label">Cash proyectado del período</div>
          <div className="mt-1 font-mono text-2xl text-foreground">{usd(proyectado)}</div>
          <div className="mt-1 font-mono text-xs text-muted-foreground">cobrado {usd(cobrado)}</div>
        </CardContent></Card>
        <Card><CardContent className="py-5">
          <div className="micro-label">Mora (vencido impago)</div>
          <div className={`mt-1 font-mono text-2xl ${moraTotal > 0 ? "text-danger" : "text-foreground"}`}>{usd(moraTotal)}</div>
          <div className="mt-1 font-mono text-xs text-muted-foreground">{mora.length} cuota(s)</div>
        </CardContent></Card>
        <Card><CardContent className="py-5">
          <div className="micro-label">Por cobrar en el período</div>
          <div className="mt-1 font-mono text-2xl text-foreground">{usd(proyectado - cobrado)}</div>
          <div className="mt-1 font-mono text-xs text-muted-foreground">{pendientesPeriodo.length} cuota(s)</div>
        </CardContent></Card>
      </section>

      <section className="mb-8">
        <h2 className="section-title mb-3 border-b border-border pb-2">Mora ({mora.length})</h2>
        {mora.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin cuotas vencidas. Al día.</p>
        ) : (
          <div className="space-y-2">
            {mora.map((c) => (
              <Fila
                key={c.cuota_id}
                href={c.booking_id ? `/closer/${c.booking_id}` : null}
                izq={`${c.comprador ?? "—"} · cuota ${c.numero_cuota}`}
                sub={`${c.producto ?? ""} · venció ${fmtFecha(c.fecha_vencimiento)}`}
                monto={Number(c.monto_esperado)}
                extra={<span className="text-danger">{c.dias_vencida}d</span>}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="section-title mb-3 border-b border-border pb-2">
          Vencen en el período ({pendientesPeriodo.length})
        </h2>
        {pendientesPeriodo.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada por vencer este período.</p>
        ) : (
          <div className="space-y-2">
            {pendientesPeriodo.map((c) => (
              <Fila
                key={c.cuota_id}
                href={c.booking_id ? `/closer/${c.booking_id}` : null}
                izq={`${c.comprador ?? "—"} · cuota ${c.numero_cuota}`}
                sub={`${c.producto ?? ""} · vence ${fmtFecha(c.fecha_vencimiento)}`}
                monto={Number(c.monto_esperado)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
