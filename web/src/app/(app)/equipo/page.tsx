import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { periodFromParams } from "@/lib/period";
import { loadKpis, loadRpc } from "@/lib/dashboard";
import { fmtInt, fmtMonto, fmtPct } from "@/lib/format";
import type { Profile } from "@/lib/types";
import { PageHeader } from "../operaciones/_components/page-header";
import { EquipoRoster } from "./equipo-roster";

const usd = (n: number | null) => fmtMonto(n, "USD");

interface CloserRow {
  closer: string; llamadas: number; no_show: number; pendientes: number;
  show_rate: number | null; ventas: number; facturacion: number; aov: number | null; close_rate: number | null;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="micro-label">{label}</span>
      <span className="font-mono text-sm text-muted-foreground">{value}</span>
    </div>
  );
}

function CloserCard({ c }: { c: CloserRow }) {
  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card p-5 tabular-nums">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-sm text-foreground">{c.closer}</span>
        {Number(c.pendientes) > 0 && (
          <span className="shrink-0 rounded-full border border-warning px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-warning">
            {fmtInt(c.pendientes)} pend
          </span>
        )}
      </div>
      <div className="mt-3">
        <div className="micro-label">Close rate</div>
        <div className="mt-1 font-mono text-3xl leading-none text-foreground">
          {c.close_rate == null ? "—" : fmtPct(c.close_rate)}
        </div>
      </div>
      <div className="mt-auto grid grid-cols-2 gap-x-5 gap-y-2 border-t border-border pt-3">
        <Metric label="Llamadas" value={fmtInt(c.llamadas)} />
        <Metric label="Show" value={c.show_rate == null ? "—" : fmtPct(c.show_rate)} />
        <Metric label="Ventas" value={fmtInt(c.ventas)} />
        <Metric label="Facturación" value={usd(Number(c.facturacion))} />
        <Metric label="Ticket prom." value={c.aov == null ? "—" : usd(Number(c.aov))} />
      </div>
    </div>
  );
}

export default async function EquipoPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; periodo?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.rol !== "admin") redirect("/");
  const period = periodFromParams(await searchParams);
  const supabase = await createClient();
  const [K, closers, miembrosRes] = await Promise.all([
    loadKpis(supabase, period),
    loadRpc(supabase, "dashboard_por_closer", period) as Promise<CloserRow[]>,
    supabase
      .from("profiles")
      .select("id, nombre, rol, closer_identifier, activo")
      .order("rol", { ascending: true })
      .order("nombre", { ascending: true }),
  ]);
  const miembros = (miembrosRes.data ?? []) as Profile[];

  return (
    <div className="tabular-nums space-y-8">
      <PageHeader title="Equipo" period={period} />

      <section>
        <h2 className="section-title mb-3 border-b border-border pb-2">Performance por closer</h2>
        {closers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin llamadas en el período.</p>
        ) : (
          <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {closers.map((c) => (
              <CloserCard key={c.closer} c={c} />
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-col gap-1 font-mono text-xs text-muted-foreground">
          <span>Setters (global) · Leads {fmtInt(K.leads)} → Agendaron {fmtPct(K.tasa_agenda)}</span>
          <span className="text-[var(--text-muted)]">
            Ticket prom. es por closer; el AOV del embudo es global (incluye ventas sin closer) — por eso pueden diferir.
          </span>
        </div>
      </section>

      <section>
        <h2 className="section-title mb-3 border-b border-border pb-2">Equipo y roles</h2>
        <EquipoRoster miembros={miembros} currentUserId={profile.id} />
      </section>
    </div>
  );
}
