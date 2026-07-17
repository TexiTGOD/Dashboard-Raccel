import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { periodFromParams } from "@/lib/period";
import { loadRpc } from "@/lib/dashboard";
import { DOLOR_LABEL, CONCIENCIA_LABEL } from "@/lib/types";
import { fmtInt, fmtPct } from "@/lib/format";
import { PageHeader } from "../operaciones/_components/page-header";

const MIN_N = 5;

interface SegRow {
  label: string;
  leads: number;
  agendas: number;
  n: number;
  ventas: number;
  close_rate: number | null;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="micro-label">{label}</span>
      <span className="font-mono text-sm text-muted-foreground">{value}</span>
    </div>
  );
}

// El insight del segmento es el close rate; se destaca por escala. Con n < 5 no
// hay señal: se muestra "—" (no un número que miente con muestra chica).
function SegCard({ r }: { r: SegRow }) {
  const hasClose = Number(r.n) >= MIN_N;
  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card p-5 tabular-nums">
      <div className="font-mono text-sm text-foreground">{r.label}</div>
      <div className="mt-3">
        <div className="micro-label">Close rate</div>
        <div className="mt-1 font-mono text-3xl leading-none text-foreground">
          {hasClose ? fmtPct(r.close_rate) : "—"}
        </div>
        {!hasClose && (
          <div className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">
            n {fmtInt(r.n)} · &lt; {MIN_N} para close
          </div>
        )}
      </div>
      <div className="mt-auto grid grid-cols-2 gap-x-5 gap-y-2 border-t border-border pt-3">
        <Metric label="Leads" value={fmtInt(r.leads)} />
        <Metric label="Agendas" value={fmtInt(r.agendas)} />
        <Metric label="Atend. (n)" value={fmtInt(r.n)} />
        <Metric label="Ventas" value={fmtInt(r.ventas)} />
      </div>
    </div>
  );
}

function Seccion({ title, rows }: { title: string; rows: SegRow[] }) {
  return (
    <section>
      <h2 className="section-title mb-3 border-b border-border pb-2">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin datos en el período.</p>
      ) : (
        <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <SegCard key={r.label} r={r} />
          ))}
        </div>
      )}
    </section>
  );
}

export default async function SegmentosPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; periodo?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.rol !== "admin") redirect("/");
  const period = periodFromParams(await searchParams);
  const supabase = await createClient();
  const [dolores, conciencias] = await Promise.all([
    loadRpc(supabase, "dashboard_por_dolor", period) as Promise<
      { dolor: string; leads: number; agendas: number; n: number; ventas: number; close_rate: number | null }[]
    >,
    loadRpc(supabase, "dashboard_por_conciencia", period) as Promise<
      { conciencia: number; leads: number; agendas: number; n: number; ventas: number; close_rate: number | null }[]
    >,
  ]);

  const dolorRows: SegRow[] = dolores.map((d) => ({
    label: DOLOR_LABEL[d.dolor] ?? d.dolor,
    leads: d.leads, agendas: d.agendas, n: d.n, ventas: d.ventas, close_rate: d.close_rate,
  }));
  const concRows: SegRow[] = conciencias.map((c) => ({
    label: CONCIENCIA_LABEL[c.conciencia] ?? String(c.conciencia),
    leads: c.leads, agendas: c.agendas, n: c.n, ventas: c.ventas, close_rate: c.close_rate,
  }));

  return (
    <div className="tabular-nums space-y-8">
      <PageHeader title="Segmentos" period={period} />
      <Seccion title="Por dolor" rows={dolorRows} />
      <Seccion title="Por nivel de conciencia" rows={concRows} />
      <p className="font-mono text-[11px] text-[var(--text-muted)]">
        n = atendidas. El close rate se muestra solo con n ≥ {MIN_N} (muestra suficiente).
      </p>
    </div>
  );
}
