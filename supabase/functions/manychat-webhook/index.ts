// ManyChat -> Supabase
// External Request de ManyChat, disparado al final de la calificación.
// Upsert por manychat_contact_id. Si el contacto ya existe (recalificación por otro
// reel), se CONSERVAN conciencia y pieza_origen originales; si los nuevos difieren,
// se loguea.

import { serviceClient } from "../_shared/client.ts";
import { checkSecret } from "../_shared/auth.ts";
import { json, readJson, requirePost, toBool } from "../_shared/http.ts";
import { normalizeHandle } from "../_shared/normalize.ts";

Deno.serve(async (req) => {
  const notPost = requirePost(req);
  if (notPost) return notPost;

  const unauth = checkSecret(req);
  if (unauth) return unauth;

  const p = await readJson(req);
  if (!p) return json({ error: "body JSON inválido" }, 400);

  const contactId = p.manychat_contact_id;
  if (!contactId) return json({ error: "falta manychat_contact_id" }, 400);

  const sb = serviceClient();

  // Campos mapeados desde el payload de ManyChat.
  const record = {
    manychat_contact_id: String(contactId),
    ig_username: normalizeHandle(p.ig_username),
    nombre: p.nombre ?? null,
    // fecha_primer_contacto NO se manda: la deriva la base desde created_at
    // (trigger trg_leads_fecha_primer_contacto). ManyChat mandaba el placeholder
    // crudo {{cuf_...}} → cast a timestamptz fallaba (500, lead perdido), o fecha
    // sin hora (00:00). Además, al no mandarla, el 2º request (UPDATE) no la pisa.
    pieza_origen: p.pieza_origen ?? null,
    respuesta_lead: p.respuesta_lead ?? p.respuesta_primer_contacto ?? null,
    respuesta_lead_2: p.respuesta_lead_2 ?? null,
    dolor: p.dolor ?? null,
    conciencia: p.conciencia ?? null,
    crisis: toBool(p.crisis),
    econ_declarada: p.econ_declarada ?? null,
    respuesta_econ: p.respuesta_econ ?? null,
    econ_calificacion: p.econ_calificacion ?? null,
    estado_funnel: p.estado_funnel ?? null,
    feedback_descalificada: p.feedback_descalificada ?? null,
  };

  // ALARMA de calidad de dato: pieza que no matchea REEL/CARR/HIST_DDMM (ej. el
  // literal 'REEL_DDMM' sin reemplazar en la plantilla). Se guarda igual (el
  // dashboard la muestra en el bucket 'Pieza inválida'), pero se loguea la alarma.
  if (record.pieza_origen && !/^(REEL|CARR|HIST)_\d{4}$/.test(String(record.pieza_origen))) {
    console.warn(
      `ALARMA pieza_origen inválida: "${record.pieza_origen}" (contacto ${record.manychat_contact_id})`,
    );
  }

  const { data: existing, error: selErr } = await sb
    .from("leads")
    .select("id, conciencia, pieza_origen")
    .eq("manychat_contact_id", record.manychat_contact_id)
    .maybeSingle();
  if (selErr) return json({ error: selErr.message }, 500);

  if (existing) {
    // Loguear si la recalificación trae valores distintos (se conservan los originales).
    if (record.conciencia != null && existing.conciencia != null && Number(record.conciencia) !== existing.conciencia) {
      console.log(`recalificacion conciencia distinta lead=${existing.id} original=${existing.conciencia} nueva=${record.conciencia} (se conserva la original)`);
    }
    if (record.pieza_origen && existing.pieza_origen && record.pieza_origen !== existing.pieza_origen) {
      console.log(`recalificacion pieza_origen distinta lead=${existing.id} original=${existing.pieza_origen} nueva=${record.pieza_origen} (se conserva la original)`);
    }

    // No pisar conciencia ni pieza_origen.
    const { conciencia: _c, pieza_origen: _p, ...updatable } = record;
    const { error } = await sb.from("leads").update(updatable).eq("id", existing.id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, action: "updated", lead_id: existing.id });
  }

  const { data, error } = await sb.from("leads").insert(record).select("id").single();
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, action: "inserted", lead_id: data.id });
});
