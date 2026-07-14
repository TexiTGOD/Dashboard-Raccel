import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { periodFromParam } from "@/lib/period";
import { loadKpis, loadRpc } from "@/lib/dashboard";
import { fmtInt, fmtMonto, fmtPct } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "../operaciones/_components/page-header";

const usd = (n: number | null) => fmtMonto(n, "USD");

export default async function EquipoPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.rol !== "admin") redirect("/");
  const period = periodFromParam((await searchParams).periodo);
  const supabase = await createClient();
  const [K, closers] = await Promise.all([
    loadKpis(supabase, period),
    loadRpc(supabase, "dashboard_por_closer", period) as Promise<
      {
        closer: string; llamadas: number; no_show: number; pendientes: number;
        show_rate: number | null; ventas: number; facturacion: number; aov: number | null; close_rate: number | null;
      }[]
    >,
  ]);

  return (
    <div className="tabular-nums">
      <PageHeader title="Equipo" periodo={period.periodo} />
      <Card>
        <CardContent className="overflow-x-auto py-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Closer</TableHead>
                <TableHead className="text-right">Llamadas</TableHead>
                <TableHead className="text-right">Pend.</TableHead>
                <TableHead className="text-right">Show</TableHead>
                <TableHead className="text-right">Close</TableHead>
                <TableHead className="text-right">Ventas</TableHead>
                <TableHead className="text-right">Facturación</TableHead>
                <TableHead className="text-right">Ticket prom.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {closers.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-sm text-muted-foreground">Sin llamadas en el período.</TableCell></TableRow>
              ) : closers.map((c) => (
                <TableRow key={c.closer}>
                  <TableCell className="font-mono text-foreground">{c.closer}</TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">{fmtInt(c.llamadas)}</TableCell>
                  <TableCell className={`text-right font-mono ${Number(c.pendientes) > 0 ? "text-warning" : "text-muted-foreground"}`}>{fmtInt(c.pendientes)}</TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">{c.show_rate == null ? "—" : fmtPct(c.show_rate)}</TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">{c.close_rate == null ? "—" : fmtPct(c.close_rate)}</TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">{fmtInt(c.ventas)}</TableCell>
                  <TableCell className="text-right font-mono text-foreground">{usd(Number(c.facturacion))}</TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">{usd(c.aov == null ? null : Number(c.aov))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-4 flex flex-col gap-1 border-t border-border pt-3 font-mono text-xs text-muted-foreground">
            <span>Setters (global) · Leads {fmtInt(K.leads)} → Agendaron {fmtPct(K.tasa_agenda)}</span>
            <span className="text-[var(--text-muted)]">
              Ticket prom. es por closer; el AOV del embudo es global (incluye ventas sin closer) — por eso pueden diferir.
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
