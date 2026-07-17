import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { fmtInt, fmtPct } from "@/lib/format";

interface LeadRow {
  id: string;
  nombre: string | null;
  ig_username: string | null;
  pieza_origen: string | null;
  estado_funnel: string | null;
}

const COLUMNAS: { key: string; label: string }[] = [
  { key: "calificado", label: "Calificados" },
  { key: "zona_gris", label: "Zona gris" },
  { key: "descalificado", label: "Descalificados" },
  { key: "fria", label: "Frías" },
];

function normEstado(e: string | null): string {
  const v = (e ?? "").toLowerCase();
  if (v.includes("calific") && !v.includes("des")) return "calificado";
  if (v.includes("gris")) return "zona_gris";
  if (v.includes("descalif")) return "descalificado";
  if (v.includes("fria") || v.includes("fría")) return "fria";
  return v || "otro";
}

function LeadItem({ l }: { l: LeadRow }) {
  return (
    <div className="border-b border-border py-2 last:border-0">
      <div className="text-sm text-foreground">{l.nombre ?? "Sin nombre"}</div>
      <div className="font-mono text-xs text-muted-foreground">
        {l.ig_username ? `@${l.ig_username}` : "—"}
        {l.pieza_origen ? `  ·  ${l.pieza_origen}` : ""}
      </div>
    </div>
  );
}

export default async function SetterPage() {
  await requireProfile();
  const supabase = await createClient();

  const [{ data: leadsData }, { data: countsData }] = await Promise.all([
    // Muestras para las listas (NO para contar). Las cifras salen del RPC agregado
    // de abajo, que no tiene el límite de 1000 filas de PostgREST.
    supabase
      .from("leads")
      .select("id, nombre, ig_username, pieza_origen, estado_funnel")
      .eq("crisis", false)
      .order("fecha_primer_contacto", { ascending: false }),
    supabase.rpc("dashboard_setter_pipeline"),
  ]);

  const leads = (leadsData ?? []) as LeadRow[];
  const grupos = new Map<string, LeadRow[]>();
  for (const l of leads) {
    const k = normEstado(l.estado_funnel);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(l);
  }

  // Conteos reales desde la base (count agregado, sin el cap de 1000). Fuente de
  // verdad de los totales; las muestras de arriba solo alimentan las listas.
  const cnt = (countsData?.[0] ?? {}) as Record<string, number | null>;
  const count = (k: string) => Number(cnt[k] ?? 0);
  const totalLeads = count("total");
  const agendasN = count("agendas");
  const tasaAgenda = totalLeads > 0 ? agendasN / totalLeads : 0;
  const zonaGris = grupos.get("zona_gris") ?? [];
  const zonaGrisCount = count("zona_gris");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-bold">Pipeline</h1>
        <p className="text-sm text-muted-foreground">Tus leads por estado. Sin datos de plata.</p>
      </div>

      {/* Métrica: leads trabajados -> agendas */}
      <div className="flex flex-wrap gap-8">
        <div>
          <div className="micro-label">Leads trabajados</div>
          <div className="mt-1 font-mono text-2xl text-foreground">{fmtInt(totalLeads)}</div>
        </div>
        <div>
          <div className="micro-label">Agendas generadas</div>
          <div className="mt-1 font-mono text-2xl text-foreground">{fmtInt(agendasN)}</div>
        </div>
        <div>
          <div className="micro-label">Tasa de agenda</div>
          <div className="mt-1 font-mono text-2xl text-foreground">{fmtPct(tasaAgenda)}</div>
        </div>
      </div>

      {/* Cola de atención: zona gris */}
      <section className="space-y-3">
        <h2 className="section-title border-b border-border pb-2">
          Cola de atención · zona gris ({fmtInt(zonaGrisCount)})
        </h2>
        {zonaGrisCount === 0 ? (
          <p className="text-sm text-muted-foreground">Nada esperando decisión.</p>
        ) : (
          <Card>
            <CardContent className="py-2">
              {zonaGris.map((l) => (
                <LeadItem key={l.id} l={l} />
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      {/* Pipeline por estado */}
      <section className="space-y-3">
        <h2 className="section-title border-b border-border pb-2">Por estado</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {COLUMNAS.map((col) => {
            const shown = (grupos.get(col.key) ?? []).slice(0, 8);
            const bucketCount = count(col.key); // total del bucket desde la base
            return (
              <Card key={col.key}>
                <CardContent className="space-y-2 py-4">
                  <div className="flex items-baseline justify-between">
                    <span className="micro-label">{col.label}</span>
                    <span className="font-mono text-lg text-foreground">{fmtInt(bucketCount)}</span>
                  </div>
                  <div>
                    {bucketCount === 0 ? (
                      <p className="text-xs text-muted-foreground">—</p>
                    ) : (
                      shown.map((l) => <LeadItem key={l.id} l={l} />)
                    )}
                    {bucketCount > shown.length && (
                      <div className="pt-2 font-mono text-xs text-[var(--text-muted)]">
                        +{fmtInt(bucketCount - shown.length)} más
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
