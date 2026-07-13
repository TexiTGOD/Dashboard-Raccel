// Calendly (webhook NATIVO) -> Supabase
// Eventos: invitee.created / invitee.canceled, scope organización.
//
// Auth: Calendly no permite headers custom, así que en vez del x-webhook-secret
// validamos la firma nativa (header Calendly-Webhook-Signature) con el signing_key
// de la suscripción (env CALENDLY_SIGNING_KEY).
//
// Parseo del payload nativo (anidado): saca los mismos campos que antes mapeaba
// Zapier, pero desde payload.scheduled_event / payload.questions_and_answers / etc.
// El matcheo del lead por ig_username (trigger de DB) queda intacto: sólo cambia
// de dónde se LEE el handle.

import { serviceClient } from "../_shared/client.ts";
import { json, requirePost } from "../_shared/http.ts";
import { normalizeHandle, normalizeEmail } from "../_shared/normalize.ts";

const enc = new TextEncoder();

// ---- Validación de firma nativa de Calendly -------------------------------
// Header: "t=<unix_ts>,v1=<hmac_sha256_hex>", firma sobre `${t}.${rawBody}`.
async function hmacHex(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function validSignature(
  header: string | null,
  rawBody: string,
  signingKey: string,
  toleranceSec = 300,
): Promise<boolean> {
  if (!header) return false;
  const parts: Record<string, string> = {};
  for (const piece of header.split(",")) {
    const i = piece.indexOf("=");
    if (i > 0) parts[piece.slice(0, i).trim()] = piece.slice(i + 1).trim();
  }
  const t = parts["t"], v1 = parts["v1"];
  if (!t || !v1) return false;

  // Anti-replay: descartar timestamps demasiado viejos o futuros.
  const ts = Number(t);
  if (Number.isFinite(ts) && toleranceSec > 0) {
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - ts) > toleranceSec) return false;
  }

  const expected = await hmacHex(signingKey, `${t}.${rawBody}`);
  return timingSafeEqual(expected, v1);
}

// ---- Helpers de extracción del payload nativo -----------------------------
function lastSegment(uri: unknown): string | null {
  if (typeof uri !== "string" || uri === "") return null;
  const parts = uri.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

// Email del host (closer). Cada closer tiene su event type; el host viene en
// event_memberships. Fallback: nombre del event type.
function extractCloser(sched: Record<string, unknown>): string | null {
  const m = sched?.["event_memberships"] as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(m) && m.length > 0) {
    return (m[0]?.["user_email"] as string) ?? (m[0]?.["user_name"] as string) ?? null;
  }
  return (sched?.["name"] as string) ?? null;
}

// ig_username: viene de una pregunta custom del formulario (prefillado por ?a1=).
// 1) pregunta exacta configurada (env CALENDLY_IG_QUESTION), 2) match por texto
// (instagram/ig/usuario/handle/arroba), 3) fallback: primera respuesta (posición 0).
function extractInstagram(qa: unknown): string | null {
  if (!Array.isArray(qa)) return null;
  const items = qa as Array<Record<string, unknown>>;

  const configured = Deno.env.get("CALENDLY_IG_QUESTION");
  if (configured) {
    const target = configured.trim().toLowerCase();
    for (const it of items) {
      if (String(it?.["question"] ?? "").trim().toLowerCase() === target && it?.["answer"]) {
        return String(it["answer"]);
      }
    }
  }

  const rx = /instagram|(^|\W)ig(\W|$)|usuario|handle|arroba|@/i;
  for (const it of items) {
    if (rx.test(String(it?.["question"] ?? "")) && it?.["answer"]) return String(it["answer"]);
  }

  const sorted = [...items].sort(
    (a, b) => (Number(a?.["position"] ?? 0)) - (Number(b?.["position"] ?? 0)),
  );
  for (const it of sorted) {
    if (it?.["answer"]) return String(it["answer"]);
  }
  return null;
}

// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  const notPost = requirePost(req);
  if (notPost) return notPost;

  const signingKey = Deno.env.get("CALENDLY_SIGNING_KEY");
  if (!signingKey) return json({ error: "CALENDLY_SIGNING_KEY no configurado en el servidor" }, 500);

  // Necesitamos el body CRUDO para validar la firma (no se puede re-serializar).
  const rawBody = await req.text();
  const okSig = await validSignature(req.headers.get("Calendly-Webhook-Signature"), rawBody, signingKey);
  if (!okSig) return json({ error: "firma inválida" }, 401);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: "body JSON inválido" }, 400);
  }

  const event = String(body?.["event"] ?? "");
  const p = (body?.["payload"] ?? {}) as Record<string, unknown>;
  const sched = (p?.["scheduled_event"] ?? {}) as Record<string, unknown>;

  // Llave estable del booking = UUID del scheduled_event (misma para created y
  // canceled -> la cancelación actualiza el mismo booking, no duplica).
  const eventUuid = lastSegment(sched?.["uri"]) ?? lastSegment(p?.["uri"]);
  if (!eventUuid) return json({ error: "no se pudo extraer el id del evento de Calendly" }, 400);

  const sb = serviceClient();

  // --- Cancelación: SOLO actualiza el booking existente. Nunca inserta una fila
  // nueva (eso duplicaba agendas). Si no existe, se loguea y termina. ---
  if (event === "invitee.canceled") {
    const { data: upd, error: updErr } = await sb
      .from("bookings")
      .update({ estado: "cancelada" })
      .eq("calendly_event_id", eventUuid)
      .select("id, lead_id");
    if (updErr) return json({ error: updErr.message }, 500);

    if (upd && upd.length > 0) {
      return json({ ok: true, action: "canceled", booking_id: upd[0].id, lead_id: upd[0].lead_id });
    }
    console.log(`cancel de un evento que no teníamos: ${eventUuid} (no se inserta)`);
    return json({ ok: true, action: "canceled_noop" });
  }

  // Un booking sin fecha de llamada no puede existir (rompe todo cálculo temporal).
  if (!sched?.["start_time"]) {
    console.log(`payload de Calendly sin start_time: ${eventUuid}`);
    return json({ error: "falta la fecha de la llamada (scheduled_event.start_time)" }, 400);
  }

  const record = {
    calendly_event_id: eventUuid,
    ig_username: normalizeHandle(extractInstagram(p?.["questions_and_answers"])),
    email: normalizeEmail(p?.["email"]),
    nombre: (p?.["name"] as string) ?? null,
    closer: extractCloser(sched),
    fecha_llamada: (sched?.["start_time"] as string) ?? null,
    estado: event === "invitee.canceled" ? "cancelada" : "programada",
  };

  const { data, error } = await sb
    .from("bookings")
    .upsert(record, { onConflict: "calendly_event_id" })
    .select("id, lead_id")
    .single();
  if (error) return json({ error: error.message }, 500);

  return json({
    ok: true,
    action: event === "invitee.canceled" ? "canceled_insert" : "created",
    booking_id: data.id,
    lead_id: data.lead_id,
    lead_matcheado: data.lead_id != null,
  });
});
