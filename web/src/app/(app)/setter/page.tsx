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

  const [{ data: leadsData }, { count: agendas }] = await Promise.all([
    supabase
      .from("leads")
      .select("id, nombre, ig_username, pieza_origen, estado_funnel")
      .eq("crisis", false),
    supabase.from("bookings").select("id", { count: "exact", head: true }),
  ]);

  const leads = (leadsData ?? []) as LeadRow[];
  const grupos = new Map<string, LeadRow[]>();
  for (const l of leads) {
    const k = normEstado(l.estado_funnel);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(l);
  }

  const totalLeads = leads.length;
  const agendasN = agendas ?? 0;
  const tasaAgenda = totalLeads > 0 ? agendasN / totalLeads : 0;
  const zonaGris = grupos.get("zona_gris") ?? [];

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
          Cola de atención · zona gris ({zonaGris.length})
        </h2>
        {zonaGris.length === 0 ? (
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
            const items = grupos.get(col.key) ?? [];
            return (
              <Card key={col.key}>
                <CardContent className="space-y-2 py-4">
                  <div className="flex items-baseline justify-between">
                    <span className="micro-label">{col.label}</span>
                    <span className="font-mono text-lg text-foreground">{items.length}</span>
                  </div>
                  <div>
                    {items.length === 0 ? (
                      <p className="text-xs text-muted-foreground">—</p>
                    ) : (
                      items.slice(0, 8).map((l) => <LeadItem key={l.id} l={l} />)
                    )}
                    {items.length > 8 && (
                      <div className="pt-2 font-mono text-xs text-[var(--text-muted)]">
                        +{items.length - 8} más
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
