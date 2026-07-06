// Calendly -> Supabase (vía Zapier: invitee.created / invitee.canceled)
// Upsert por calendly_event_id. El trigger de DB normaliza ig_username/email y
// matchea el lead por handle.

import { serviceClient } from "../_shared/client.ts";
import { checkSecret } from "../_shared/auth.ts";
import { json, readJson, requirePost, toBool } from "../_shared/http.ts";
import { normalizeHandle, normalizeEmail } from "../_shared/normalize.ts";

Deno.serve(async (req) => {
  const notPost = requirePost(req);
  if (notPost) return notPost;

  const unauth = checkSecret(req);
  if (unauth) return unauth;

  const p = await readJson(req);
  if (!p) return json({ error: "body JSON inválido" }, 400);

  const eventId = p.calendly_event_id;
  if (!eventId) return json({ error: "falta calendly_event_id" }, 400);

  // estado: si Zapier marca la cancelación, o si viene explícito.
  const estado = p.estado ?? (toBool(p.canceled) ? "cancelada" : "programada");

  const record = {
    calendly_event_id: String(eventId),
    ig_username: normalizeHandle(p.ig_username),
    email: normalizeEmail(p.email),
    nombre: p.nombre ?? null,
    closer: p.closer ?? null,
    fecha_llamada: p.fecha_llamada ?? null,
    estado,
  };

  const sb = serviceClient();
  const { data, error } = await sb
    .from("bookings")
    .upsert(record, { onConflict: "calendly_event_id" })
    .select("id, lead_id")
    .single();
  if (error) return json({ error: error.message }, 500);

  return json({
    ok: true,
    booking_id: data.id,
    lead_id: data.lead_id,
    lead_matcheado: data.lead_id != null,
  });
});
