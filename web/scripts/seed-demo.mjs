// Seed de datos demo para construir/probar el dashboard.
// Crea usuarios (admin + closer) y datos realistas: leads con distintos
// dolores/conciencias/piezas (uno en crisis), bookings, calls, y sales
// matcheadas + una sin matchear. Idempotente: limpia lo demo y reinserta.
//
// Uso (desde web/):
//   SUPABASE_SERVICE_ROLE_KEY='...' node scripts/seed-demo.mjs
// La URL sale de NEXT_PUBLIC_SUPABASE_URL (.env.local) o SUPABASE_URL.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnvLocal() {
  try {
    for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}
loadEnvLocal();

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = process.env.DEMO_PASSWORD || "Raccel.demo.2026";
const CLOSER_ID = "closer@raccel.test"; // = bookings.closer de los demos

if (!URL || !KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

async function ensureUser(email, nombre, rol, closer_identifier) {
  // buscar si ya existe
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = list?.users?.find((u) => u.email === email);
  if (!user) {
    const { data, error } = await sb.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { nombre },
    });
    if (error) throw error;
    user = data.user;
  }
  // el trigger crea el profile; fijamos rol/identifier/activo
  const { error: pErr } = await sb
    .from("profiles")
    .update({ nombre, rol, closer_identifier, activo: true })
    .eq("id", user.id);
  if (pErr) throw pErr;
  return user;
}

async function main() {
  console.log("1) Usuarios…");
  await ensureUser("admin@raccel.test", "Admin Demo", "admin", null);
  await ensureUser(CLOSER_ID, "Closer Demo", "closer", CLOSER_ID);

  console.log("2) Limpiando datos demo previos…");
  const { data: prevBookings } = await sb
    .from("bookings")
    .select("id")
    .like("calendly_event_id", "demo_%");
  const prevIds = (prevBookings ?? []).map((b) => b.id);
  await sb.from("sales").delete().in("email_comprador", ["bea@demo.com", "otramail@gmail.com"]);
  if (prevIds.length) await sb.from("calls").delete().in("booking_id", prevIds);
  await sb.from("bookings").delete().like("calendly_event_id", "demo_%");
  await sb.from("leads").delete().like("manychat_contact_id", "demo_%");

  const dias = (n) => new Date(Date.now() + n * 86400000).toISOString();

  console.log("3) Leads…");
  const leadsSeed = [
    { manychat_contact_id: "demo_ana", ig_username: "ana.demo", nombre: "Ana Demo", pieza_origen: "REEL_0402", dolor: "ansiedad_apego", conciencia: 4, crisis: false, econ_calificacion: "calificada", respuesta_lead: "Hace meses que no puedo dejar de pensar en él aunque sé que me hace mal.", respuesta_econ: "Argentina, diseñadora freelance", estado_funnel: "calificado", fecha_primer_contacto: dias(-6) },
    { manychat_contact_id: "demo_bea", ig_username: "bea.demo", nombre: "Bea Demo", pieza_origen: "CARR_1103", dolor: "comparacion_otra", conciencia: 3, crisis: false, econ_calificacion: "calificada", respuesta_lead: "Siento que siempre elijo a quien no me elige.", respuesta_econ: "España, enfermera", estado_funnel: "calificado", fecha_primer_contacto: dias(-5) },
    { manychat_contact_id: "demo_caro", ig_username: "caro.demo", nombre: "Caro Demo", pieza_origen: "REEL_0402", dolor: "no_puedo_soltar", conciencia: 5, crisis: false, econ_calificacion: "zona_gris", respuesta_lead: "Sé lo que tengo que hacer pero no puedo soltar.", estado_funnel: "zona_gris", fecha_primer_contacto: dias(-4) },
    { manychat_contact_id: "demo_eve", ig_username: "eve.demo", nombre: "Eve Demo", pieza_origen: "HIST_0510", dolor: "darlo_todo_no_elegida", conciencia: 6, crisis: false, econ_calificacion: "calificada", respuesta_lead: "Quiero empezar un proceso, ya me cansé de este patrón.", estado_funnel: "calificado", fecha_primer_contacto: dias(-3) },
    { manychat_contact_id: "demo_dai", ig_username: "dai.demo", nombre: "Dai Demo", crisis: true, estado_funnel: "crisis", respuesta_lead: "[LEAD EN CRISIS — no debe aparecer en vistas comerciales]", fecha_primer_contacto: dias(-2) },
  ];
  const { data: leads, error: lErr } = await sb.from("leads").insert(leadsSeed).select("id, manychat_contact_id");
  if (lErr) throw lErr;
  const L = Object.fromEntries(leads.map((l) => [l.manychat_contact_id, l.id]));

  console.log("4) Bookings…");
  const bookingsSeed = [
    { calendly_event_id: "demo_b1", ig_username: "ana.demo", email: "ana@demo.com", nombre: "Ana Demo", closer: CLOSER_ID, fecha_llamada: dias(2), estado: "programada", lead_id: L["demo_ana"] },
    { calendly_event_id: "demo_b2", ig_username: "bea.demo", email: "bea@demo.com", nombre: "Bea Demo", closer: CLOSER_ID, fecha_llamada: dias(-1), estado: "atendida", lead_id: L["demo_bea"] },
    { calendly_event_id: "demo_b3", ig_username: "caro.demo", email: "caro@demo.com", nombre: "Caro Demo", closer: CLOSER_ID, fecha_llamada: dias(-3), estado: "atendida", lead_id: L["demo_caro"] },
    { calendly_event_id: "demo_b4", ig_username: "eve.demo", email: "eve@demo.com", nombre: "Eve Demo", closer: CLOSER_ID, fecha_llamada: dias(5), estado: "programada", lead_id: L["demo_eve"] },
  ];
  const { data: bookings, error: bErr } = await sb.from("bookings").insert(bookingsSeed).select("id, calendly_event_id");
  if (bErr) throw bErr;
  const B = Object.fromEntries(bookings.map((b) => [b.calendly_event_id, b.id]));

  console.log("5) Calls…");
  await sb.from("calls").insert([
    { booking_id: B["demo_b2"], resultado: "vendido", notas_closer: "Cerró en la llamada, paga por transferencia.", resumen_fathom: "La lead reconoció el patrón y decidió avanzar. Objeción de precio resuelta con plan de pago.", fecha: dias(-1) },
    { booking_id: B["demo_b3"], resultado: "follow_up", notas_closer: "Quedó en pensarlo, re-agendar en 3 días.", fecha: dias(-3) },
  ]);

  console.log("6) Sales + payments…");
  // Matcheada: mismo email que el booking demo_b2 -> el trigger la vincula sola.
  // Contrato de 1497 en 2 cuotas; primer pago hecho (cash collected parcial).
  const { data: saleBea } = await sb
    .from("sales")
    .insert({
      email_comprador: "bea@demo.com", nombre_comprador: "Bea Demo",
      producto: "Programa Claridad", valor_contrato: 1497, monto: 1497,
      cuotas_total: 2, tipo: "nueva", closer: CLOSER_ID,
      moneda: "USD", status: "approved", metodo_pago: "transferencia",
    })
    .select("id")
    .single();
  await sb.from("payments").insert({
    sale_id: saleBea.id, monto: 750, moneda: "USD", fecha: dias(-1),
    metodo_pago: "transferencia", numero_cuota: 1,
  });
  // Sin matchear: email que no coincide con ninguna agenda (queda para conciliar).
  await sb.from("sales").insert({
    email_comprador: "otramail@gmail.com", nombre_comprador: "Compradora Anónima",
    producto: "Programa Claridad", valor_contrato: 1497, monto: 1497,
    cuotas_total: 1, tipo: "nueva",
    moneda: "USD", status: "approved", metodo_pago: "hotmart",
  });

  console.log("7) Metas + gastos del mes actual…");
  const now = new Date();
  const periodo = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const metasSeed = [
    { metrica: "cash_collected", objetivo: 6000 },
    { metrica: "facturacion", objetivo: 12000 },
    { metrica: "ventas", objetivo: 5 },
    { metrica: "agendas", objetivo: 12 },
    { metrica: "leads", objetivo: 40 },
  ].map((m) => ({ periodo, ...m }));
  await sb.from("metas").upsert(metasSeed, { onConflict: "periodo,metrica" });

  await sb.from("gastos").delete().eq("periodo", periodo).in("concepto", ["Meta Ads (demo)", "ManyChat (demo)"]);
  await sb.from("gastos").insert([
    { periodo, categoria: "ads", concepto: "Meta Ads (demo)", monto: 1500 },
    { periodo, categoria: "herramientas", concepto: "ManyChat (demo)", monto: 120 },
  ]);

  console.log("\n✓ Seed completo.");
  console.log("   Login admin :  admin@raccel.test");
  console.log("   Login closer:  closer@raccel.test");
  console.log("   Password    : ", PASSWORD);
}

main().catch((e) => {
  console.error("ERROR:", e.message || e);
  process.exit(1);
});
