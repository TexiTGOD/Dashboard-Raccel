import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { periodFromParams } from "@/lib/period";
import { loadKpis, loadMetas } from "@/lib/dashboard";
import { fmtInt, fmtMonto, fmtPct } from "@/lib/format";
import { PageHeader } from "../operaciones/_components/page-header";

const usd = (n: number | null) => fmtMonto(n, "USD");

// --- piezas del tablero -----------------------------------------------------

/** Número grande de volumen (leads, agendas, atendidas, ventas). */
function Volumen({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 tabular-nums">
      <div className="micro-label">{label}</div>
      <div className="mt-2 font-mono text-4xl leading-none text-foreground">{fmtInt(value)}</div>
    </div>
  );
}

/**
 * Ratio de conversión con el par de números que lo origina debajo, para que el
 * porcentaje no quede en el aire ("8,2% · 142 de 1.735 leads").
 */
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

/** Contador de una dimensión de calificación (sistema nuevo, etiquetas de ManyChat). */
function Calif({
  label,
  value,
  total,
  destacado,
}: {
  label: string;
  value: number;
  total: number;
  destacado?: boolean;
}) {
  const pct = total > 0 ? value / total : null;
  return (
    <div
      className={`rounded-lg border bg-card p-5 tabular-nums ${
        destacado ? "border-primary/40" : "border-border"
      }`}
    >
      <div className="micro-label">{label}</div>
      <div className="mt-2 font-mono text-3xl leading-none text-foreground">{fmtInt(value)}</div>
      <div className="mt-2 font-mono text-xs text-muted-foreground">
        {pct == null ? "—" : `${fmtPct(pct)} de los leads`}
      </div>
    </div>
  );
}

// --- página -----------------------------------------------------------------

export default async function SetterPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; periodo?: string }>;
}) {
  // El tablero muestra cash y comisión: solo la setter (dueña de estos números) y
  // el admin. Un closer autenticado que navegue a mano queda fuera.
  const profile = await requireProfile();
  if (profile.rol !== "admin" && profile.rol !== "setter") redirect("/");

  const period = periodFromParams(await searchParams);
  const supabase = await createClient();
  const args = { p_start: period.startStr, p_end: period.endStr };

  const [K, countsRes, ventasRes, metas] = await Promise.all([
    loadKpis(supabase, period),
    supabase.rpc("dashboard_rows_counts", args),
    // Agregados de venta vía RPC security definer: la setter no tiene acceso a
    // sales, pero cobra comisión sobre el cash, así que necesita estos números.
    supabase.rpc("dashboard_setter_ventas", args),
    // Las metas son mensuales: solo aplican si el rango es un mes completo.
    period.esMesCompleto ? loadMetas(supabase, period.mesInicioStr) : Promise.resolve([]),
  ]);

  const cnt = (countsRes.data?.[0] ?? {}) as Record<string, number | null>;
  const n = (k: string) => Number(cnt[k] ?? 0);

  const v = (ventasRes.data?.[0] ?? {}) as Record<string, number | null>;
  const ventas = Number(v.ventas ?? 0);
  const ventasAtribuibles = Number(v.ventas_atribuibles ?? 0);
  const cash = Number(v.cash_collected ?? 0);
  const closeRate = v.close_rate_atendidas == null ? null : Number(v.close_rate_atendidas);
  const pctComision = Number(v.pct_comision ?? 0);
  const comision = Number(v.comision ?? 0);

  // tasa_agenda = leads DISTINTOS que agendaron / leads (definición del proyecto;
  // es la misma sobre la que se guarda la meta). Se reconstruye el numerador para
  // poder mostrar el par debajo del porcentaje.
  const leadsAgendaron = K.tasa_agenda == null ? null : Math.round(K.tasa_agenda * K.leads);

  const metaAgenda = metas.find((m) => m.metrica === "tasa_agenda");
  const objetivo = metaAgenda ? Number(metaAgenda.objetivo) : null;
  const actual = K.tasa_agenda;
  const cumple = objetivo != null && actual != null && actual >= objetivo;
  const avance = objetivo != null && objetivo > 0 && actual != null ? actual / objetivo : null;

  const califLeads = n("leads_count");

  return (
    <div className="tabular-nums space-y-10">
      <PageHeader title="Métricas" period={period} />

      <section>
        <h2 className="section-title mb-3 border-b border-border pb-2">Volumen</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Volumen label="Leads" value={K.leads} />
          <Volumen label="Agendas" value={K.agendas} />
          <Volumen label="Atendidas" value={K.atendidas} />
          <Volumen label="Ventas" value={ventas} />
        </div>
      </section>

      <section>
        <h2 className="section-title mb-3 border-b border-border pb-2">Conversión</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Ratio
            label="% de agenda"
            value={actual}
            num={leadsAgendaron}
            den={K.leads}
            unidad="leads agendaron"
          />
          <Ratio
            label="% de asistencia"
            value={K.show_rate}
            num={K.atendidas}
            den={K.resueltas}
            unidad="llamadas resueltas"
          />
          <Ratio
            label="% de cierre"
            value={closeRate}
            num={ventasAtribuibles}
            den={K.atendidas}
            unidad="atendidas"
          />
        </div>
      </section>

      <section>
        <h2 className="section-title mb-3 border-b border-border pb-2">Calificación</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Calif label="Dolor" value={n("calif_dolor")} total={califLeads} />
          <Calif label="Urgencia" value={n("calif_urgencia")} total={califLeads} />
          <Calif label="Económica" value={n("calif_economica")} total={califLeads} />
          <Calif label="Las 3" value={n("calif_las_tres")} total={califLeads} destacado />
        </div>
        <p className="mt-3 font-mono text-[11px] text-[var(--text-muted)]">
          Leads del período con la etiqueta puesta en ManyChat. El % es sobre los {fmtInt(califLeads)} leads
          del período.
        </p>
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

      {/* Meta: solo con un mes calendario completo, igual que Operaciones. */}
      {period.esMesCompleto && (
        <section>
          <h2 className="section-title mb-3 border-b border-border pb-2">Meta · tasa de agenda</h2>
          {objetivo == null ? (
            <p className="text-sm text-muted-foreground">
              No hay meta de tasa de agenda cargada para {period.mesLabel}.
            </p>
          ) : (
            <div className="rounded-lg border border-border bg-card p-5 tabular-nums">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-4xl leading-none text-foreground">
                    {actual == null ? "—" : fmtPct(actual)}
                  </span>
                  <span className="font-mono text-sm text-muted-foreground">
                    objetivo {fmtPct(objetivo)}
                  </span>
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.08em] ${
                    cumple ? "border-success text-success" : "border-warning text-warning"
                  }`}
                >
                  {cumple ? "por arriba del objetivo" : "por debajo del objetivo"}
                </span>
              </div>
              {/* Misma barra que el ritmo de las KPI cards: track surface-elevated y
                  relleno neón. Los colores semánticos quedan para el badge (borde +
                  texto), que es su único uso permitido en este sistema. */}
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
          )}
        </section>
      )}
    </div>
  );
}
