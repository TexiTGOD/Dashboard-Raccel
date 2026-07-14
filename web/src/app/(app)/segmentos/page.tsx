import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { periodFromParam } from "@/lib/period";
import { loadRpc } from "@/lib/dashboard";
import { DOLOR_LABEL, CONCIENCIA_LABEL } from "@/lib/types";
import { fmtInt, fmtPct } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "../operaciones/_components/page-header";

const MIN_N = 5;

export default async function SegmentosPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const profile = await requireProfile();
  if (profile.rol !== "admin") redirect("/");
  const period = periodFromParam((await searchParams).periodo);
  const supabase = await createClient();
  const [dolores, conciencias] = await Promise.all([
    loadRpc(supabase, "dashboard_por_dolor", period) as Promise<
      { dolor: string; leads: number; agendas: number; n: number; ventas: number; close_rate: number | null }[]
    >,
    loadRpc(supabase, "dashboard_por_conciencia", period) as Promise<
      { conciencia: number; leads: number; agendas: number; n: number; ventas: number; close_rate: number | null }[]
    >,
  ]);

  return (
    <div className="tabular-nums">
      <PageHeader title="Segmentos" periodo={period.periodo} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h2 className="section-title mb-3 border-b border-border pb-2">Por dolor</h2>
          <Card>
            <CardContent className="overflow-x-auto py-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dolor</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Agendas</TableHead>
                    <TableHead className="text-right">n</TableHead>
                    <TableHead className="text-right">Ventas</TableHead>
                    <TableHead className="text-right">Close</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dolores.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground">Sin datos.</TableCell></TableRow>
                  ) : dolores.map((d) => (
                    <TableRow key={d.dolor}>
                      <TableCell className="text-foreground">{DOLOR_LABEL[d.dolor] ?? d.dolor}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">{fmtInt(d.leads)}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">{fmtInt(d.agendas)}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">{fmtInt(d.n)}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">{fmtInt(d.ventas)}</TableCell>
                      <TableCell className="text-right font-mono text-foreground">{Number(d.n) < MIN_N ? "—" : fmtPct(d.close_rate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-2 font-mono text-[11px] text-[var(--text-muted)]">n = atendidas. Close solo con n ≥ {MIN_N}.</p>
            </CardContent>
          </Card>
        </div>
        <div>
          <h2 className="section-title mb-3 border-b border-border pb-2">Por nivel de conciencia</h2>
          <Card>
            <CardContent className="overflow-x-auto py-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Conciencia</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Agendas</TableHead>
                    <TableHead className="text-right">n</TableHead>
                    <TableHead className="text-right">Ventas</TableHead>
                    <TableHead className="text-right">Close</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conciencias.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground">Sin datos.</TableCell></TableRow>
                  ) : conciencias.map((c) => (
                    <TableRow key={c.conciencia}>
                      <TableCell className="font-mono text-foreground">{CONCIENCIA_LABEL[c.conciencia] ?? c.conciencia}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">{fmtInt(c.leads)}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">{fmtInt(c.agendas)}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">{fmtInt(c.n)}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">{fmtInt(c.ventas)}</TableCell>
                      <TableCell className="text-right font-mono text-foreground">{Number(c.n) < MIN_N ? "—" : fmtPct(c.close_rate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-2 font-mono text-[11px] text-[var(--text-muted)]">n = atendidas. Close solo con n ≥ {MIN_N}.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
