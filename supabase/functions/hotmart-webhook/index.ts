// Hotmart -> Supabase (webhook nativo de Hotmart, formato 2.0)
// Eventos: PURCHASE_APPROVED / _REFUNDED / _CHARGEBACK / _CANCELED / _PROTEST.
// Upsert por hotmart_transaction_id. El trigger de DB matchea por email al booking
// (hereda lead_id) y setea `matcheada`.
//
// Auth: Hotmart no manda headers custom, manda su hottok. Validamos el header
// x-hotmart-hottok contra HOTMART_HOTTOK. Como fallback (carga manual / tests) se
// acepta x-webhook-secret contra WEBHOOK_SECRET.

import { serviceClient } from "../_shared/client.ts";
import { checkSecret } from "../_shared/auth.ts";
import { json, readJson, requirePost } from "../_shared/http.ts";
import { normalizeEmail } from "../_shared/normalize.ts";

const STATUS_MAP: Record<string, string> = {
  PURCHASE_APPROVED: "approved",
  PURCHASE_COMPLETE: "approved",
  PURCHASE_REFUNDED: "refunded",
  PURCHASE_CHARGEBACK: "chargeback",
  PURCHASE_PROTEST: "chargeback",
  PURCHASE_CANCELED: "cancelled",
};

Deno.serve(async (req) => {
  const notPost = requirePost(req);
  if (notPost) return notPost;

  // Preferimos el hottok de Hotmart si está configurado; si no, el secret genérico.
  const unauth = Deno.env.get("HOTMART_HOTTOK")
    ? checkSecret(req, "x-hotmart-hottok", "HOTMART_HOTTOK")
    : checkSecret(req);
  if (unauth) return unauth;

  const p = await readJson(req);
  if (!p) return json({ error: "body JSON inválido" }, 400);

  // Formato 2.0: { event, data: { purchase, buyer } }. Tolerante a payloads planos.
  const data = (p.data ?? {}) as Record<string, any>;
  const purchase = (data.purchase ?? {}) as Record<string, any>;
  const buyer = (data.buyer ?? {}) as Record<string, any>;

  const txId = purchase.transaction ?? p.transaction ?? null;
  const event = p.event ? String(p.event) : null;
  const status = (event && STATUS_MAP[event]) ??
    (purchase.status ? String(purchase.status).toLowerCase() : null);

  const record = {
    hotmart_transaction_id: txId ? String(txId) : null,
    email_comprador: normalizeEmail(buyer.email ?? p.email),
    nombre_comprador: buyer.name ?? p.nombre_comprador ?? null,
    monto: purchase.price?.value ?? purchase.full_price?.value ?? p.monto ?? null,
    moneda: purchase.price?.currency_value ?? purchase.price?.currency_code ?? "USD",
    status,
    metodo_pago: "hotmart",
  };

  const sb = serviceClient();

  // Con transaction_id: upsert idempotente. Sin él: insert (no debería pasar en Hotmart).
  const q = record.hotmart_transaction_id
    ? sb.from("sales").upsert(record, { onConflict: "hotmart_transaction_id" })
    : sb.from("sales").insert(record);

  const { data: row, error } = await q.select("id, lead_id, booking_id, matcheada").single();
  if (error) return json({ error: error.message }, 500);

  return json({
    ok: true,
    sale_id: row.id,
    lead_id: row.lead_id,
    booking_id: row.booking_id,
    matcheada: row.matcheada,
  });
});
