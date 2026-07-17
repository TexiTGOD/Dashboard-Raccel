// Seed a ESCALA — importa la data real del tracker de Raccel para probar el
// dashboard con volumen real. NO es una migración de producción: los matcheos
// entre tablas son imprecisos y la atribución por pieza es SINTÉTICA a propósito
// (el tracker no la registra). Reemplaza al seed demo (borra Ana/Bea/Eve Demo).
//
// Fuentes (3 CSV exportados del tracker):
//   CRM-IG.csv   → 1.691 leads
//   CRMCALLS.csv → 50 calls
//   PAYMENTS.csv → 1 pago real (Natalia Vargas Canea, $100)
//
// Uso (desde web/):
//   SUPABASE_SERVICE_ROLE_KEY='...' node scripts/seed-import.mjs [DATA_DIR]
// DATA_DIR = carpeta con los 3 CSV (default: ~/Downloads).
// La URL sale de NEXT_PUBLIC_SUPABASE_URL (.env.local) o SUPABASE_URL.
//
// Idempotente: borra lo demo y lo ya importado (prefijos imp_) y reinserta.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

// ---------------------------------------------------------------------------
// Config / entorno
// ---------------------------------------------------------------------------
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
const CLOSER_ID = "closer@raccel.test"; // = bookings.closer + profiles.closer_identifier
const DATA_DIR = process.argv[2] || process.env.DATA_DIR || join(homedir(), "Downloads");
const F_LEADS = join(DATA_DIR, "Tracker - Raccel proyect - CRM-IG.csv");
const F_CALLS = join(DATA_DIR, "Tracker - Raccel proyect - CRMCALLS.csv");
// PAYMENTS.csv: el único pago real (Natalia, $100) va hardcodeado con los
// valores exactos del CSV — ver salesPlan / sección de ventas.

if (!URL || !KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

// ---------------------------------------------------------------------------
// CSV parser (RFC4180: comillas, "" escapadas, saltos de línea dentro de campo)
// ---------------------------------------------------------------------------
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", i = 0, inQ = false;
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// ---------------------------------------------------------------------------
// Helpers de limpieza
// ---------------------------------------------------------------------------
const stripAccents = (s) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

// Nombre para mostrar: saca emojis/símbolos de los bordes, colapsa espacios.
function cleanName(raw) {
  let s = (raw || "").normalize("NFKC");
  // saca todo lo que no sea letra/número/espacio de los extremos (emojis, 💕, etc.)
  s = s.replace(/^[^\p{L}\p{N}]+/u, "").replace(/[^\p{L}\p{N})\.]+$/u, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

// Nombre para guardar/mostrar: limpio, con fallback al raw si la limpieza lo
// vacía (nombres que son puro emoji, ej. "🐨" o "MIRIAM" en emojis-bandera).
function displayName(raw) {
  return cleanName(raw) || (raw || "").trim() || null;
}

// Clave de matcheo por nombre: sin acentos, minúsculas, solo letras y espacios.
function nameKey(raw) {
  return stripAccents(cleanName(raw).toLowerCase())
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ig_username sintético a partir del nombre: "Gimena Stabile" -> "gimena.stabile".
function igSlug(raw) {
  const s = stripAccents(cleanName(raw).toLowerCase())
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return s || null;
}

// Fecha -> ISO (mediodía UTC para no cruzar de día por timezone). Soporta
// "YYYY-MM-DD", "YYYY-MM-DD HH:MM:SS" y "M/D/YYYY".
function toISO(raw) {
  const s = (raw || "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T12:00:00Z`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const mm = String(+m[1]).padStart(2, "0");
    const dd = String(+m[2]).padStart(2, "0");
    return `${m[3]}-${mm}-${dd}T12:00:00Z`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Atribución sintética: pieza por hash del nombre (reproducible), con la
// distribución despareja que pide el spec. REEL_0402 = mucho volumen; los de
// abajo, poco. La "gracia" (poco volumen = mejor cash/lead) se fuerza aparte
// asignando las piezas de los leads que convierten (ver salesPlan).
const PIEZAS = [
  ["REEL_0402", 35],
  ["CARR_1103", 20],
  ["HIST_0510", 15],
  ["REEL_1105", 12],
  ["CARR_0208", 8],
  ["HIST_0722", 6],
  ["REEL_0915", 4],
];
const PIEZA_CUM = (() => {
  let acc = 0;
  return PIEZAS.map(([p, w]) => [(acc += w), p]); // [threshold, pieza]
})();
function hash32(str) {
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
function piezaFor(name) {
  const b = hash32("pieza:" + nameKey(name)) % 100;
  for (const [thr, p] of PIEZA_CUM) if (b < thr) return p;
  return PIEZAS[0][0];
}
// Conciencia sintética 3..6 (rango realista del negocio), determinística.
function concienciaFor(name) {
  return 3 + (hash32("conc:" + nameKey(name)) % 4);
}

// Dolor: primer renglón de "3 sentimientos" -> enum de la base (aproximado).
// Enum válido: no_puedo_soltar, ansiedad_apego, comparacion_otra,
// darlo_todo_no_elegida, hombre_ambiguo, no_disponible.
function dolorFor(sentimientos) {
  const first = stripAccents((sentimientos || "").split("\n")[0].toLowerCase());
  const has = (...ws) => ws.some((w) => first.includes(w));
  if (has("soltar", "apego", "dependencia", "desapego", "aferr")) return "no_puedo_soltar";
  if (has("comparaci", "otra", "celos", "reemplaz")) return "comparacion_otra";
  if (has("abandono", "rechazo", "elegida", "elegir", "no ser elej", "no ser eleg", "humillaci"))
    return "darlo_todo_no_elegida";
  if (has("ambig", "confus", "incertidumbre", "ilusion", "senal", "duda")) return "hombre_ambiguo";
  if (has("distante", "ausente", "no disponible", "indiferen")) return "no_disponible";
  // genérico por defecto: el paquete miedo/ansiedad/tristeza/angustia
  return "ansiedad_apego";
}

// Calificación económica desde "Recursos financieros" + "Calificado" (manda Calificado).
function econFor(recursos, calificado) {
  const r = (recursos || "").toLowerCase();
  const cal = (calificado || "").trim().toLowerCase();
  let base = null;
  if (/no estar[íi]a dispuesta a invertir/.test(r)) base = "no_calificada";
  else if (/\$?\s*(300|750|1250|1750)/.test(r) && /s[íi]/.test(r)) base = "calificada";
  // Calificado explícito manda ante conflicto.
  if (cal === "si" || cal === "sí") return "calificada";
  if (cal === "no") return "no_calificada";
  return base; // puede ser null (no respondió)
}
// Tramo textual (respuesta_econ / campo de detalle).
function tramoFor(recursos) {
  const m = (recursos || "").match(/\$\s*\d+\s*a\s*\$?\s*\d+/i);
  return m ? m[0].replace(/\s+/g, " ").trim() : (recursos || "").trim() || null;
}

// ---------------------------------------------------------------------------
// Estado de la llamada desde "Show" (+ Estado como señal de asistencia).
function estadoBooking(show, estado, fechaISO) {
  const s = (show || "").trim().toLowerCase();
  if (s === "si" || s === "sí") return "atendida";
  if (s === "no") return "no_show";
  // Show vacío: si hay un Estado cargado, la call ocurrió -> atendida.
  if ((estado || "").trim()) return "atendida";
  // Sin señal: no_show si la fecha ya pasó, si no programada.
  return fechaISO && new Date(fechaISO) < new Date() ? "no_show" : "programada";
}
// Resultado de la call (solo si atendida) desde "Estado".
function resultadoCall(estado) {
  const e = (estado || "").trim().toLowerCase();
  if (e === "cerrado") return "vendido";
  if (e === "seguimiento") return "follow_up";
  if (e === "no cerrado") return "perdido";
  return "pendiente";
}

// Ventas inventadas: qué calls cierran y con qué plan de cuotas. La pieza acá
// fuerza la inversión volumen↔cash-por-lead (piezas de POCO volumen se llevan
// el cash). Natalia es venta REAL (Cerrado) con su pago real de $100.
const salesPlan = {
  "natalia vargas canea": { cuotas: 3, pieza: "REEL_0915", pay: "real" },   // seña $100 real
  "izebel roman": { cuotas: 1, pieza: "REEL_0915", pay: "full" },           // pago único saldado
  "laura malpica": { cuotas: 2, pieza: "REEL_0915", pay: "cuota1" },        // 1ª cobrada, 2ª futura
  "dania caceres": { cuotas: 2, pieza: "HIST_0722", pay: "none" },          // 1ª vencida -> MORA
};
const VALOR_CONTRATO = 1500;

// ---------------------------------------------------------------------------
// Usuarios (login admin + closer). Igual que el seed demo.
// ---------------------------------------------------------------------------
async function ensureUser(email, nombre, rol, closer_identifier) {
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = list?.users?.find((u) => u.email === email);
  if (!user) {
    const { data, error } = await sb.auth.admin.createUser({
      email, password: PASSWORD, email_confirm: true, user_metadata: { nombre },
    });
    if (error) throw error;
    user = data.user;
  }
  const { error: pErr } = await sb
    .from("profiles")
    .update({ nombre, rol, closer_identifier, activo: true })
    .eq("id", user.id);
  if (pErr) throw pErr;
  return user;
}

// Insert en chunks (evita payloads gigantes). Devuelve todas las filas .select().
async function insertChunked(table, rows, select, size = 500) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const { data, error } = await sb.from(table).insert(chunk).select(select);
    if (error) throw new Error(`insert ${table} [${i}..]: ${error.message}`);
    out.push(...(data ?? []));
  }
  return out;
}

// ---------------------------------------------------------------------------
async function main() {
  console.log(`Data dir: ${DATA_DIR}`);

  // 1) Usuarios --------------------------------------------------------------
  console.log("1) Usuarios…");
  await ensureUser("admin@raccel.test", "Admin Import", "admin", null);
  await ensureUser(CLOSER_ID, "Closer Import", "closer", CLOSER_ID);

  // 2) Limpiar seed demo + import previo (idempotente) -----------------------
  console.log("2) Limpiando demo + import previo…");
  // 2a. demo (Bea/Ana/Eve): misma lógica que seed-demo.mjs
  {
    const { data: prevB } = await sb.from("bookings").select("id").like("calendly_event_id", "demo_%");
    const ids = (prevB ?? []).map((b) => b.id);
    await sb.from("sales").delete().in("email_comprador", ["bea@demo.com", "otramail@gmail.com"]);
    if (ids.length) await sb.from("sales").delete().in("booking_id", ids);
    if (ids.length) await sb.from("calls").delete().in("booking_id", ids);
    const { data: prevL } = await sb.from("leads").select("id").like("manychat_contact_id", "demo_%");
    const lids = (prevL ?? []).map((l) => l.id);
    if (lids.length) await sb.from("sales").delete().in("lead_id", lids);
    await sb.from("bookings").delete().like("calendly_event_id", "demo_%");
    await sb.from("leads").delete().like("manychat_contact_id", "demo_%");
  }
  // 2b. import previo (prefijo imp_). Borrar sales antes (payments/cuotas caen por cascade).
  {
    const { data: impL } = await sb.from("leads").select("id").like("manychat_contact_id", "imp_%");
    const lids = (impL ?? []).map((l) => l.id);
    const { data: impB } = await sb.from("bookings").select("id").like("calendly_event_id", "imp_%");
    const bids = (impB ?? []).map((b) => b.id);
    if (lids.length) await sb.from("sales").delete().in("lead_id", lids);
    if (bids.length) await sb.from("sales").delete().in("booking_id", bids);
    if (bids.length) await sb.from("calls").delete().in("booking_id", bids);
    await sb.from("bookings").delete().like("calendly_event_id", "imp_%");
    await sb.from("leads").delete().like("manychat_contact_id", "imp_%");
  }

  // 3) Parsear CSVs ----------------------------------------------------------
  console.log("3) Parseando CSVs…");
  const leadsCSV = parseCSV(readFileSync(F_LEADS, "utf8"));
  const callsCSV = parseCSV(readFileSync(F_CALLS, "utf8"));
  // (PAYMENTS.csv: el único pago real está hardcodeado abajo — la fila es una sola.)

  const leadRows = leadsCSV.slice(1).filter((r) => (r[0] || "").trim());
  const callRows = callsCSV.slice(1).filter((r) => (r[0] || "").trim());
  console.log(`   leads CSV: ${leadRows.length} · calls CSV: ${callRows.length}`);

  // 4) LEADS (los 1.691) -----------------------------------------------------
  console.log("4) Insertando leads…");
  // manychat_contact_id sintético único por fila (hay nombres repetidos).
  const leadsSeed = leadRows.map((r, idx) => {
    const nombre = displayName(r[0]);
    const fecha = toISO(r[5]) || toISO(r[3]); // Fecha de contacto | Ultima interaccion
    return {
      manychat_contact_id: `imp_lead_${idx}`,
      ig_username: igSlug(nombre),
      nombre,
      fecha_primer_contacto: fecha,
      pieza_origen: piezaFor(nombre),
      // econ_calificacion null = no respondió (correcto para los del tracker).
      estado_funnel: "lead_fria",
      crisis: false,
    };
  });
  const insertedLeads = await insertChunked(
    "leads", leadsSeed, "id, manychat_contact_id, nombre, ig_username"
  );
  console.log(`   leads insertados: ${insertedLeads.length}`);

  // Índice por clave de nombre -> lead_id (para matchear calls). Si hay dups,
  // se queda el último (imprecisión aceptada).
  const leadByName = new Map();
  for (const l of insertedLeads) leadByName.set(nameKey(l.nombre), l.id);

  // 5) CALLS (las 50) — crear lead si no matchea, booking y call --------------
  console.log("5) Procesando calls (leads faltantes + bookings + calls)…");
  // Columnas: 0 nombre,1 fecha agenda,2 email,3 tel,4 sentimientos,5 sit,6 deseo,
  // 7 recursos,8 pareja,9 (vacía),10 fecha call,11 Show,12 Estado,13 CC,14 tipo pago,
  // 15 fee,16 Calificado,17 obs,18 link record
  const newLeadFromCall = []; // leads a crear desde calls sin match
  const callMeta = []; // metadata por call (para armar bookings después)
  for (let i = 0; i < callRows.length; i++) {
    const r = callRows[i];
    const nombre = displayName(r[0]);
    const key = nameKey(nombre);
    const fechaCall = toISO(r[10]) || toISO(r[1]); // Fecha de la call | Fecha de la agenda
    const plan = salesPlan[key];
    let leadId = leadByName.get(key);
    if (!leadId) {
      // crear lead desde la call
      const seed = {
        manychat_contact_id: `imp_call_lead_${i}`,
        ig_username: igSlug(nombre),
        nombre,
        fecha_primer_contacto: toISO(r[1]) || fechaCall, // fecha de agenda
        pieza_origen: plan ? plan.pieza : piezaFor(nombre),
        dolor: dolorFor(r[4]),
        conciencia: concienciaFor(nombre),
        econ_calificacion: econFor(r[7], r[16]),
        respuesta_econ: tramoFor(r[7]),
        respuesta_lead: (r[4] || "").replace(/\s+/g, " ").trim() || null,
        estado_funnel: "lead_calificado",
        crisis: false,
      };
      newLeadFromCall.push({ seed, i });
    }
    callMeta.push({ r, i, nombre, key, fechaCall, plan, hadLead: !!leadId });
  }

  // Insertar los leads nuevos de calls y completar el índice.
  if (newLeadFromCall.length) {
    const inserted = await insertChunked(
      "leads", newLeadFromCall.map((x) => x.seed), "id, manychat_contact_id, nombre"
    );
    for (const l of inserted) leadByName.set(nameKey(l.nombre), l.id);
    console.log(`   leads creados desde calls: ${inserted.length}`);
  }

  // Para los 4 que convierten y YA existían como lead (no debería pasar, son
  // nuevos) o matchearon: forzar pieza + calificación coherentes con la venta.
  for (const cm of callMeta) {
    if (!cm.plan) continue;
    const leadId = leadByName.get(cm.key);
    if (leadId) {
      await sb.from("leads").update({
        pieza_origen: cm.plan.pieza,
        econ_calificacion: "calificada",
        dolor: dolorFor(cm.r[4]),
        conciencia: concienciaFor(cm.nombre),
      }).eq("id", leadId);
    }
  }
  // Para las calls que matchearon un lead existente: pasarle la calificación de la call.
  for (const cm of callMeta) {
    if (cm.plan || !cm.hadLead) continue;
    const leadId = leadByName.get(cm.key);
    const econ = econFor(cm.r[7], cm.r[16]);
    const patch = { dolor: dolorFor(cm.r[4]), conciencia: concienciaFor(cm.nombre) };
    if (econ) patch.econ_calificacion = econ;
    await sb.from("leads").update(patch).eq("id", leadId);
  }

  // Bookings (uno por call). fecha_llamada NOT NULL -> siempre hay (call|agenda).
  console.log("6) Insertando bookings…");
  const bookingsSeed = callMeta.map((cm) => {
    const estado = estadoBooking(cm.r[11], cm.r[12], cm.fechaCall);
    return {
      calendly_event_id: `imp_call_${cm.i}`,
      ig_username: null, // el tracker de calls no trae IG
      email: (cm.r[2] || "").trim().toLowerCase() || null,
      nombre: cm.nombre,
      closer: CLOSER_ID,
      fecha_llamada: cm.fechaCall,
      estado,
      lead_id: leadByName.get(cm.key), // seteo explícito -> bookings_match no re-matchea
    };
  });
  const insertedBookings = await insertChunked(
    "bookings", bookingsSeed, "id, calendly_event_id, estado"
  );
  const bookingByEvent = new Map(insertedBookings.map((b) => [b.calendly_event_id, b]));

  // Calls (una por booking). resultado solo si atendida.
  console.log("7) Insertando calls…");
  const callsSeed = callMeta.map((cm) => {
    const b = bookingByEvent.get(`imp_call_${cm.i}`);
    const atendida = b?.estado === "atendida";
    // Si la call terminó en venta (salesPlan), su resultado es 'vendido' aunque
    // el tracker la marque Seguimiento (seguimiento que terminó comprando).
    const resultado = cm.plan ? "vendido" : atendida ? resultadoCall(cm.r[12]) : "pendiente";
    return {
      booking_id: b?.id ?? null,
      resultado,
      resumen_fathom: (cm.r[4] || "").replace(/\s+/g, " ").trim() || null,
      transcript_url: (cm.r[18] || "").trim() || null, // Link record (Drive)
      fecha: cm.fechaCall,
    };
  });
  await insertChunked("calls", callsSeed, "id");

  // 8) VENTAS inventadas + pago real -----------------------------------------
  console.log("8) Insertando ventas + payments + cuotas…");
  const saleSummary = [];
  for (const cm of callMeta) {
    if (!cm.plan) continue;
    const b = bookingByEvent.get(`imp_call_${cm.i}`);
    const leadId = leadByName.get(cm.key);
    if (!b) { console.warn(`   ! sin booking para ${cm.nombre}`); continue; }
    const cierre = cm.fechaCall; // = fecha_llamada; cumple fecha_cierre >= fecha_llamada
    const isNatalia = cm.plan.pay === "real";

    const { data: sale, error: sErr } = await sb.from("sales").insert({
      email_comprador: (cm.r[2] || "").trim().toLowerCase() || null,
      nombre_comprador: cm.nombre,
      producto: "Programa",
      valor_contrato: VALOR_CONTRATO,
      monto: VALOR_CONTRATO,
      cuotas_total: cm.plan.cuotas,
      tipo: "nueva",
      moneda: "USD",
      status: "approved",
      metodo_pago: isNatalia ? "hotmart" : "transferencia",
      closer: CLOSER_ID,
      lead_id: leadId,
      booking_id: b.id,
      fecha_cierre: cierre,
    }).select("id").single();
    if (sErr) throw new Error(`sale ${cm.nombre}: ${sErr.message}`);

    // El trigger generate_cuotas ya creó las cuotas esperadas. Las traemos.
    const { data: cuotas } = await sb
      .from("cuotas").select("id, numero_cuota, monto_esperado, fecha_vencimiento")
      .eq("sale_id", sale.id).order("numero_cuota");

    // Marcar cobradas según el plan -> crear payment y linkear cuota.payment_id.
    const cobrar = []; // [numero_cuota, monto, metodo, fecha, hotmart_txid]
    if (cm.plan.pay === "real") {
      cobrar.push([1, 100, "hotmart", cierre, "HP3245321688"]); // seña real
    } else if (cm.plan.pay === "full") {
      cobrar.push([1, VALOR_CONTRATO, "transferencia", cierre, null]);
    } else if (cm.plan.pay === "cuota1") {
      const c1 = (cuotas ?? []).find((c) => c.numero_cuota === 1);
      cobrar.push([1, c1 ? Number(c1.monto_esperado) : VALOR_CONTRATO / cm.plan.cuotas, "transferencia", cierre, null]);
    } // "none" -> nada cobrado (queda en mora)

    for (const [nc, monto, metodo, fecha, txid] of cobrar) {
      const { data: pay, error: pErr } = await sb.from("payments").insert({
        sale_id: sale.id, monto, moneda: "USD", fecha,
        metodo_pago: metodo, numero_cuota: nc, hotmart_transaction_id: txid,
      }).select("id").single();
      if (pErr) throw new Error(`payment ${cm.nombre}: ${pErr.message}`);
      await sb.from("cuotas").update({ payment_id: pay.id })
        .eq("sale_id", sale.id).eq("numero_cuota", nc);
    }
    saleSummary.push({ nombre: cm.nombre, cuotas: cm.plan.cuotas, pieza: cm.plan.pieza, pay: cm.plan.pay, cierre });
  }

  // 9) Metas + gastos (para que la cascada y Cashflow muestren algo) ----------
  console.log("9) Metas + gastos…");
  const now = new Date();
  const periodo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const metasSeed = [
    { metrica: "leads", objetivo: 1500 },
    { metrica: "agendas", objetivo: 60 },
    { metrica: "ventas", objetivo: 10 },
    { metrica: "cash_collected", objetivo: 8000 },
    { metrica: "facturacion", objetivo: 15000 },
    { metrica: "precio", objetivo: VALOR_CONTRATO },
  ].map((m) => ({ periodo, ...m }));
  await sb.from("metas").upsert(metasSeed, { onConflict: "periodo,metrica" });

  await sb.from("gastos").delete().in("concepto", ["Meta Ads (import)", "ManyChat (import)", "Setter (import)"]);
  await sb.from("gastos").insert([
    { categoria: "ads", concepto: "Meta Ads (import)", monto: 2000, fecha: "2026-06-15" },
    { categoria: "ads", concepto: "Meta Ads (import)", monto: 1800, fecha: "2026-07-10" },
    { categoria: "herramientas", concepto: "ManyChat (import)", monto: 120, fecha: "2026-07-01" },
    { categoria: "setter", concepto: "Setter (import)", monto: 600, fecha: "2026-06-30" },
  ]);

  // 10) Resumen de verificación ---------------------------------------------
  console.log("\n──────── RESUMEN ────────");
  const totalLeads = insertedLeads.length + newLeadFromCall.length;
  const estCount = {};
  for (const b of insertedBookings) estCount[b.estado] = (estCount[b.estado] ?? 0) + 1;
  console.log(`Leads totales: ${totalLeads} (${insertedLeads.length} del CRM + ${newLeadFromCall.length} desde calls)`);
  console.log(`Bookings: ${insertedBookings.length} ·`, estCount);
  console.log(`Ventas inventadas/reales: ${saleSummary.length}`);
  for (const s of saleSummary) {
    console.log(`  · ${s.nombre} — ${s.cuotas} cuota(s), pieza ${s.pieza}, pago=${s.pay}, cierre ${String(s.cierre).slice(0, 10)}`);
  }

  // Cobranzas: mora + próximas
  const { data: mora } = await sb.rpc("dashboard_mora");
  console.log(`Cobranzas · cuotas en MORA: ${mora?.length ?? 0}`);

  // Atribución del año (para ver la inversión volumen↔cash/lead)
  const { data: atr } = await sb.rpc("dashboard_atribucion", { p_start: "2026-01-01", p_end: "2027-01-01" });
  console.log("Atribución (año) — pieza · leads · cash · cash/lead:");
  for (const a of atr ?? []) {
    console.log(`  ${a.pieza_origen.padEnd(10)} leads=${String(a.leads).padStart(4)}  cash=$${Number(a.cash_collected).toFixed(0).padStart(5)}  cash/lead=$${Number(a.cash_por_lead).toFixed(2)}`);
  }

  console.log("\n✓ Import completo.");
  console.log("   Login admin :  admin@raccel.test");
  console.log("   Login closer:  closer@raccel.test");
  console.log("   Password    : ", PASSWORD);
  console.log("   Nota: el dashboard abre en 'mes en curso' (julio). Para ver los ~1.700 leads");
  console.log("         elegí 'Este año' o un rango custom jun–jul en el selector.");
}

// Solo corre el import si se ejecuta directo (no cuando se importa para tests).
const isMain = import.meta.url === pathToFileURL(process.argv[1] || "").href;
if (isMain) {
  main().catch((e) => {
    console.error("ERROR:", e.message || e);
    process.exit(1);
  });
}

// Exports para validación (harness de tests). No afectan la ejecución directa.
export {
  parseCSV, cleanName, nameKey, igSlug, toISO,
  piezaFor, concienciaFor, dolorFor, econFor, tramoFor,
  estadoBooking, resultadoCall, salesPlan, PIEZAS,
};
