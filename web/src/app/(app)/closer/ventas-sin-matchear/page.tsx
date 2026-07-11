import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { fmtMonto } from "@/lib/format";
import { ReconcileForm } from "./reconcile-form";
import { fmtFecha } from "@/lib/format";

interface SaleRow {
  id: string;
  email_comprador: string | null;
  nombre_comprador: string | null;
  monto: number | null;
  moneda: string | null;
  status: string | null;
}
interface BookingRow {
  id: string;
  nombre: string | null;
  ig_username: string | null;
  fecha_llamada: string | null;
  lead: { nombre: string | null; ig_username: string | null } | null;
}

export default async function VentasSinMatchearPage() {
  await requireProfile();
  const supabase = await createClient();

  const [{ data: salesData }, { data: bookingsData }] = await Promise.all([
    supabase
      .from("sales")
      .select("id, email_comprador, nombre_comprador, monto, moneda, status")
      .eq("matcheada", false)
      .order("created_at", { ascending: false }),
    supabase
      .from("bookings")
      .select("id, nombre, ig_username, fecha_llamada, lead:leads(nombre, ig_username)")
      .order("fecha_llamada", { ascending: false }),
  ]);

  const sales = (salesData ?? []) as unknown as SaleRow[];
  const bookings = (bookingsData ?? []) as unknown as BookingRow[];

  const options = bookings.map((b) => ({
    value: b.id,
    label: `${b.lead?.nombre ?? b.nombre ?? "Sin nombre"}${
      b.lead?.ig_username ?? b.ig_username ? ` · @${b.lead?.ig_username ?? b.ig_username}` : ""
    } · ${fmtFecha(b.fecha_llamada)}`,
  }));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-bold">Ventas sin matchear</h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          Ventas cuyo email de compra no coincidió con el de la agenda. Vinculalas a la llamada
          correcta.
        </p>
      </div>

      {sales.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay ventas sin matchear.</p>
      ) : (
        <div className="space-y-3">
          {sales.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex flex-col gap-5 px-6 py-5 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <div className="micro-label">Comprador</div>
                  <div className="mt-1 text-sm text-foreground">{s.nombre_comprador ?? "—"}</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {s.email_comprador ?? "sin email"}
                  </div>
                </div>
                <div className="md:w-40">
                  <div className="micro-label">Monto</div>
                  <div className="mt-1 font-mono text-base text-foreground">
                    {fmtMonto(s.monto, s.moneda)}
                  </div>
                  {s.status && (
                    <div className="font-mono text-xs text-muted-foreground">{s.status}</div>
                  )}
                </div>
                <div className="md:w-[340px]">
                  <ReconcileForm saleId={s.id} options={options} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
