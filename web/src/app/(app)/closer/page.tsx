import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { EstadoBadge, ResultadoBadge } from "./_components/badges";
import { fmtFecha } from "@/lib/format";
import type { EstadoBooking, ResultadoCall } from "@/lib/types";

interface Row {
  id: string;
  nombre: string | null;
  ig_username: string | null;
  fecha_llamada: string | null;
  estado: EstadoBooking | null;
  lead: { nombre: string | null; ig_username: string | null; pieza_origen: string | null } | null;
  calls: { resultado: ResultadoCall }[] | null;
}

function BookingCard({ b }: { b: Row }) {
  const nombre = b.lead?.nombre ?? b.nombre ?? "Sin nombre";
  const ig = b.lead?.ig_username ?? b.ig_username;
  const resultado = b.calls?.[0]?.resultado ?? null;
  return (
    <Link href={`/closer/${b.id}`} className="block">
      <Card className="gap-0 py-0 transition-colors duration-150 hover:border-primary/40 hover:bg-[var(--neon-wash)]">
        <CardContent className="flex items-start gap-4 px-5 py-4">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="truncate font-medium text-foreground">{nombre}</div>
            <div className="truncate font-mono text-[13px] text-muted-foreground">
              {ig ? `@${ig}` : "—"}
              {b.lead?.pieza_origen ? `  ·  ${b.lead.pieza_origen}` : ""}
            </div>
            <div className="font-mono text-xs text-[var(--text-muted)]">{fmtFecha(b.fecha_llamada)}</div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <EstadoBadge estado={b.estado} />
            {resultado && resultado !== "pendiente" && <ResultadoBadge resultado={resultado} />}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="section-title mb-3 border-b border-border pb-2">{children}</h2>;
}

export default async function CloserPage() {
  await requireProfile();
  const supabase = await createClient();

  const { data } = await supabase
    .from("bookings")
    .select(
      "id, nombre, ig_username, fecha_llamada, estado, lead:leads(nombre, ig_username, pieza_origen), calls(resultado)",
    )
    .order("fecha_llamada", { ascending: true });

  const bookings = (data ?? []) as unknown as Row[];
  const now = Date.now();
  const t = (b: Row) => (b.fecha_llamada ? new Date(b.fecha_llamada).getTime() : 0);
  const proximas = bookings.filter((b) => t(b) >= now);
  const pasadas = bookings.filter((b) => t(b) < now).reverse();

  return (
    <div className="space-y-10">
      <section>
        <SectionTitle>Próximas</SectionTitle>
        {proximas.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tenés llamadas próximas.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {proximas.map((b) => (
              <BookingCard key={b.id} b={b} />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle>Recientes</SectionTitle>
        {pasadas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay llamadas pasadas.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {pasadas.map((b) => (
              <BookingCard key={b.id} b={b} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
