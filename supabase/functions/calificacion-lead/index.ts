// ManyChat (etiqueta de calificación) -> Supabase
//
// Disparador en ManyChat: se le agrega al contacto una de estas etiquetas
//   Calificado_Dolor / Calificado_Urgencia / Calificado_Economica
// y la automatización manda un external request (POST) acá.
//
// Body esperado:
//   { "manychat_contact_id": "...", "ig_username": "...", "calificacion": "dolor" }
// calificacion ∈ dolor | urgencia | economica (obligatorio; otro valor -> 400).
//
// Solo PRENDE la dimensión correspondiente (idempotente: si ya estaba en true,
// queda en true). Nunca crea un lead: si no matchea, se registra en
// calificaciones_sin_match para revisión manual.
//
// Auth: mismo mecanismo que el webhook de ingesta (header x-webhook-secret contra
// la env WEBHOOK_SECRET). Escribe con service_role, solo del lado servidor.

import { serviceClient } from "../_shared/client.ts";
import { checkSecret } from "../_shared/auth.ts";
import { json, readJson, requirePost } from "../_shared/http.ts";
import { normalizeHandle } from "../_shared/normalize.ts";

// calificacion recibida -> columna que se prende.
const COLUMNA: Record<string, string> = {
  dolor: "calificado_dolor",
  urgencia: "calificado_urgencia",
  economica: "calificado_economica",
};

// Tolerante con lo que mande ManyChat: acentos, mayúsculas y el prefijo de la
// etiqueta ("Calificado_Economica" -> "economica").
function normalizarCalificacion(raw: unknown): string | null {
  if (raw == null) return null;
  const v = String(raw)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/^calificado[_\s-]*/, "");
  return v in COLUMNA ? v : null;
}

Deno.serve(async (req) => {
  const notPost = requirePost(req);
  if (notPost) return notPost;

  const unauth = checkSecret(req);
  if (unauth) return unauth;

  const p = await readJson(req);
  if (!p) return json({ error: "body JSON inválido" }, 400);

  // Validación de shape: sin una calificación válida no se escribe nada.
  const calificacion = normalizarCalificacion(p.calificacion);
  if (!calificacion) {
    return json(
      { error: "calificacion inválida: se espera dolor | urgencia | economica", recibido: p.calificacion ?? null },
      400,
    );
  }
  const columna = COLUMNA[calificacion];

  const contactId = p.manychat_contact_id != null ? String(p.manychat_contact_id).trim() : "";
  const handle = normalizeHandle(p.ig_username);
  if (!contactId && !handle) {
    return json({ error: "falta manychat_contact_id o ig_username" }, 400);
  }

  const sb = serviceClient();

  // --- Match, en orden de confianza -----------------------------------------
  // 1) manychat_contact_id: es UNIQUE, match exacto y sin ambigüedad.
  let lead: { id: string } | null = null;
  let via: "contact_id" | "ig_username" | null = null;

  if (contactId) {
    const { data, error } = await sb
      .from("leads")
      .select("id")
      .eq("manychat_contact_id", contactId)
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (data) {
      lead = data;
      via = "contact_id";
    }
  }

  // 2) Fallback por handle normalizado. ig_username NO es único: si hay varios,
  //    gana el más reciente — mismo desempate que el trigger bookings_match.
  if (!lead && handle) {
    const { data, error } = await sb
      .from("leads")
      .select("id")
      .eq("ig_username", handle)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return json({ error: error.message }, 500);
    if (data && data.length > 0) {
      lead = data[0];
      via = "ig_username";
    }
  }

  // --- Sin match: NO se crea lead. Queda registrado para revisión manual. ----
  if (!lead) {
    console.warn(
      `calificacion sin match: calificacion=${calificacion} contact_id=${contactId || "-"} ig=${handle || "-"} body=${JSON.stringify(p)}`,
    );
    await sb.from("calificaciones_sin_match").insert({
      manychat_contact_id: contactId || null,
      ig_username: handle,
      calificacion,
      payload: p,
    });
    // 200 a propósito: el request era válido y quedó registrado. Un 4xx/5xx haría
    // que ManyChat lo marque como fallido y reintente sobre algo que no se va a
    // resolver solo.
    return json({ ok: true, action: "sin_match", registrado: true, calificacion });
  }

  // --- Prender la dimensión (idempotente) -----------------------------------
  const { error: updErr } = await sb
    .from("leads")
    .update({ [columna]: true })
    .eq("id", lead.id);
  if (updErr) return json({ error: updErr.message }, 500);

  return json({ ok: true, action: "calificado", calificacion, columna, lead_id: lead.id, via });
});
