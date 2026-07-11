import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtFecha, fmtMonto } from "@/lib/format";
import { ReconcileForm } from "./reconcile-form";

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
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Ventas sin matchear</h1>
        <p className="text-sm text-muted-foreground">
          Ventas cuyo email de compra no coincidió con el de la agenda. Vinculalas a la llamada
          correcta.
        </p>
      </div>

      {sales.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay ventas sin matchear. 🎉</p>
      ) : (
        <div className="space-y-3">
          {sales.map((s) => (
            <Card key={s.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  {fmtMonto(s.monto, s.moneda)}
                  {s.status ? ` · ${s.status}` : ""}
                </CardTitle>
                <div className="text-sm text-muted-foreground">
                  {s.nombre_comprador ? `${s.nombre_comprador} · ` : ""}
                  {s.email_comprador ?? "sin email"}
                </div>
              </CardHeader>
              <CardContent>
                <ReconcileForm saleId={s.id} options={options} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
