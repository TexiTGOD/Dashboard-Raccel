import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { periodFromParams } from "@/lib/period";
import { loadMetas } from "@/lib/dashboard";
import { fmtInt, fmtMonto, fmtPct } from "@/lib/format";
import { PageHeader } from "../operaciones/_components/page-header";

const usd = (n: number | null) => fmtMonto(n, "USD");

// --- panel de métricas (mismo estilo que /setter) --------------------------

function Volumen({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 tabular-nums">
      <div className="micro-label">{label}</div>
      <div className="mt-2 font-mono text-4xl leading-none text-foreground">{fmtInt(value)}</div>
    </div>
  );
}

function Ratio({
  label,
  value,
  num,
  den,
  unidad,
}: {
  label: string;
  value: number | null;
  num: number | null;
  den: number;
  unidad: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 tabular-nums">
      <div className="micro-label">{label}</div>
      <div className="mt-2 font-mono text-3xl leading-none text-foreground">
        {value == null ? "—" : fmtPct(value)}
      </div>
      <div className="mt-2 font-mono text-xs text-muted-foreground">
        {num == null ? "—" : `${fmtInt(num)} de ${fmtInt(den)} ${unidad}`}
      </div>
    </div>
  );
}

/** Actual vs objetivo mensual, con barra de avance. Se oculta por fuera (ver
 * `period.esMesCompleto` en la página) si el rango no es un mes calendario. */
function Meta({
  label,
  actual,
  objetivo,
  fmt,
}: {
  label: string;
  actual: number | null;
  objetivo: number | null;
  fmt: (n: number) => string;
}) {
  if (objetivo == null) {
    return (
      <div className="rounded-lg border border-border bg-card p-5 tabular-nums">
        <div className="micro-label">{label}</div>
        <p className="mt-2 text-sm text-muted-foreground">Sin meta cargada para este mes.</p>
      </div>
    );
  }
  const cumple = actual != null && actual >= objetivo;
  const avance = objetivo > 0 && actual != null ? actual / objetivo : null;
  return (
    <div className="rounded-lg border border-border bg-card p-5 tabular-nums">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="micro-label">{label}</span>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.08em] ${
            cumple ? "border-success text-success" : "border-warning text-warning"
          }`}
        >
          {cumple ? "por arriba del objetivo" : "por debajo del objetivo"}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-3">
        <span className="font-mono text-3xl leading-none text-foreground">
          {actual == null ? "—" : fmt(actual)}
        </span>
        <span className="font-mono text-sm text-muted-foreground">objetivo {fmt(objetivo)}</span>
      </div>
      <div className="mt-4 h-1 w-full bg-[var(--surface-elevated)]">
        <div
          className="h-1 bg-primary"
          style={{ width: `${Math.min(Math.max((avance ?? 0) * 100, 0), 100)}%` }}
        />
      </div>
      <div className="mt-2 font-mono text-xs text-muted-foreground">
        {avance == null ? "—" : `${fmtPct(avance)} del objetivo del mes`}
      </div>
    </div>
  );
}

// --- página -----------------------------------------------------------------

// Panel propio de la closer: volumen, conversión, resultado económico +
// comisión y metas del mes. Separado de /closer (Llamadas) porque son dos
// tareas distintas — mirar cómo viene el mes vs. trabajar la lista de
// llamadas — y mezclarlas en una sola página las hacía competir por espacio.
// Solo para closer: los números salen de current_closer_identifier(), que
// para un admin es NULL (Linda es admin, no closer) — mostrarían todo en
// cero. El admin ya tiene Equipo (todos los closers comparados) y
// Operaciones (negocio completo).
export default async function PanelPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; periodo?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.rol !== "closer") redirect("/");

  const period = periodFromParams(await searchParams);
  const supabase = await createClient();
  const args = { p_start: period.startStr, p_end: period.endStr };

  const [metricasRes, metas] = await Promise.all([
    supabase.rpc("dashboard_closer_metricas", args).then((r) => r.data?.[0] ?? null),
    // Las metas son mensuales: solo aplican si el rango es un mes completo.
    period.esMesCompleto ? loadMetas(supabase, period.mesInicioStr) : Promise.resolve([]),
  ]);

  const m = (metricasRes ?? {}) as Record<string, number | null>;
  const llamadas = Number(m.llamadas ?? 0);
  const atendidas = Number(m.atendidas ?? 0);
  const resueltas = Number(m.resueltas ?? 0);
  const showRate = m.show_rate == null ? null : Number(m.show_rate);
  const ventas = Number(m.ventas ?? 0);
  const ventasAtribuibles = Number(m.ventas_atribuibles ?? 0);
  const closeRate = m.close_rate_atendidas == null ? null : Number(m.close_rate_atendidas);
  const cash = Number(m.cash_collected ?? 0);
  const pctComision = Number(m.pct_comision ?? 0);
  const comision = Number(m.comision ?? 0);

  const metaVentas = metas.find((x) => x.metrica === "ventas");
  const metaCash = metas.find((x) => x.metrica === "cash_collected");

  return (
    <div className="tabular-nums space-y-10">
      <PageHeader title="Panel" period={period} />

      <section>
        <h2 className="section-title mb-3 border-b border-border pb-2">Volumen</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Volumen label="Agendadas" value={llamadas} />
          <Volumen label="Atendidas" value={atendidas} />
          <Volumen label="Ventas" value={ventas} />
        </div>
      </section>

      <section>
        <h2 className="section-title mb-3 border-b border-border pb-2">Conversión</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Ratio
            label="% de asistencia"
            value={showRate}
            num={atendidas}
            den={resueltas}
            unidad="llamadas resueltas"
          />
          <Ratio
            label="% de cierre"
            value={closeRate}
            num={ventasAtribuibles}
            den={atendidas}
            unidad="atendidas"
          />
        </div>
      </section>

      <section>
        <h2 className="section-title mb-3 border-b border-border pb-2">Resultado económico</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-5 tabular-nums">
            <div className="micro-label">Cash collected del período</div>
            <div className="mt-2 font-mono text-3xl leading-none text-foreground">{usd(cash)}</div>
            <div className="mt-2 font-mono text-xs text-muted-foreground">Plata que entró en el rango.</div>
          </div>
          <div className="rounded-lg border border-primary/40 bg-card p-5 tabular-nums">
            <div className="micro-label">Tu comisión</div>
            <div className="mt-2 font-mono text-4xl leading-none text-foreground">{usd(comision)}</div>
            <div className="mt-2 font-mono text-xs text-muted-foreground">
              {fmtPct(pctComision)} de {usd(cash)}
            </div>
          </div>
        </div>
      </section>

      {/* Metas: solo con un mes calendario completo, igual que Operaciones. */}
      {period.esMesCompleto && (
        <section>
          <h2 className="section-title mb-3 border-b border-border pb-2">Metas · {period.mesLabel}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Meta
              label="Ventas"
              actual={ventas}
              objetivo={metaVentas ? Number(metaVentas.objetivo) : null}
              fmt={(n) => fmtInt(n)}
            />
            <Meta
              label="Cash collected"
              actual={cash}
              objetivo={metaCash ? Number(metaCash.objetivo) : null}
              fmt={(n) => usd(n)}
            />
          </div>
        </section>
      )}
    </div>
  );
}
