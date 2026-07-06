// Fathom -> Supabase (vía Zapier, trigger "New AI Summary")
// Inserta una call y resuelve booking_id por calendly_event_id o, si no, por email
// del asistente. Este es el matcheo booking↔call (no se hace en trigger porque el
// dato de matcheo vive en el payload de Fathom, no en la fila de calls).

import { serviceClient } from "../_shared/client.ts";
import { checkSecret } from "../_shared/auth.ts";
import { json, readJson, requirePost } from "../_shared/http.ts";
import { normalizeEmail } from "../_shared/normalize.ts";

Deno.serve(async (req) => {
  const notPost = requirePost(req);
  if (notPost) return notPost;

  const unauth = checkSecret(req);
  if (unauth) return unauth;

  const p = await readJson(req);
  if (!p) return json({ error: "body JSON inválido" }, 400);

  const sb = serviceClient();

  // 1) por calendly_event_id (más confiable)
  let bookingId: string | null = null;
  if (p.calendly_event_id) {
    const { data } = await sb
      .from("bookings")
      .select("id")
      .eq("calendly_event_id", String(p.calendly_event_id))
      .maybeSingle();
    bookingId = data?.id ?? null;
  }

  // 2) fallback: por email del asistente
  if (!bookingId) {
    const email = normalizeEmail(p.email);
    if (email) {
      const { data } = await sb
        .from("bookings")
        .select("id")
        .eq("email", email)
        .order("fecha_llamada", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      bookingId = data?.id ?? null;
    }
  }

  if (!bookingId) {
    console.log(`call sin booking matcheado: calendly_event_id=${p.calendly_event_id} email=${p.email}`);
  }

  const record = {
    booking_id: bookingId,
    resumen_fathom: p.resumen_fathom ?? null,
    transcript_url: p.transcript_url ?? null,
    resultado: p.resultado ?? "pendiente",
    fecha: p.fecha ?? null,
  };

  const { data, error } = await sb.from("calls").insert(record).select("id").single();
  if (error) return json({ error: error.message }, 500);

  return json({
    ok: true,
    call_id: data.id,
    booking_id: bookingId,
    booking_matcheado: bookingId != null,
  });
});
