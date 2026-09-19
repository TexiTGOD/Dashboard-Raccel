// Tabla de casos de pieza_origen contra los TRES parsers:
//   1. SQL   public.pieza_bucket()                        (base LOCAL, vía docker exec psql)
//   2. TS    web/src/lib/pieza.ts  leerPieza()/resolverAnio()
//   3. Edge  supabase/functions/manychat-webhook/pieza-valida.ts  piezaBucket()
//
// Los casos viven en scripts/pieza-casos.json. Si cambia un formato, se agrega el
// caso ahí y se corre:   node scripts/test-pieza.mjs
//
// Requiere la base local levantada (supabase start). No toca datos: solo SELECT.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const aca = dirname(fileURLToPath(import.meta.url));
const raiz = join(aca, "..", "..");
const require = createRequire(import.meta.url);
const ts = require("typescript");

const casos = JSON.parse(readFileSync(join(aca, "pieza-casos.json"), "utf8"));

// --- Carga de los módulos TS (se transpilan en memoria, sin build) ---------
async function cargarTs(ruta) {
  const src = readFileSync(ruta, "utf8");
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
}
const front = await cargarTs(join(raiz, "web/src/lib/pieza.ts"));
const edge = await cargarTs(join(raiz, "supabase/functions/manychat-webhook/pieza-valida.ts"));

// --- SQL: una sola consulta con todos los casos ----------------------------
function bucketsSql() {
  const json = JSON.stringify(casos.map((c) => c.raw));
  const sql =
    `select ord - 1, public.pieza_bucket(v) from jsonb_array_elements_text($j$${json}$j$::jsonb) with ordinality as t(v, ord) order by ord;`;
  let out;
  try {
    out = execFileSync(
      "docker",
      ["exec", "-i", "supabase_db_Dashboard-Raccel", "psql", "-U", "postgres", "-d", "postgres", "-At", "-F", "\t", "-v", "ON_ERROR_STOP=1"],
      { input: sql, encoding: "utf8" },
    );
  } catch (e) {
    console.error("No pude correr el SQL contra la base local (¿está levantada `supabase start`?)\n" + e.message);
    process.exit(2);
  }
  // Un valor con salto de línea rompe el parseo por líneas: se usa el índice como ancla.
  const res = new Array(casos.length).fill(null);
  let actual = -1;
  for (const linea of out.split("\n")) {
    const m = linea.match(/^(\d+)\t([\s\S]*)$/);
    if (m && Number(m[1]) === actual + 1) {
      actual = Number(m[1]);
      res[actual] = m[2];
    } else if (actual >= 0 && linea !== "") {
      res[actual] += "\n" + linea;
    }
  }
  return res;
}
const sql = bucketsSql();

// --- Comparación ------------------------------------------------------------
let fallas = 0;
const falla = (i, quien, esperado, obtenido) => {
  fallas++;
  console.log(`✗ [${quien}] ${JSON.stringify(casos[i].raw)}\n    esperado: ${JSON.stringify(esperado)}\n    obtenido: ${JSON.stringify(obtenido)}`);
};
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

casos.forEach((c, i) => {
  // 1. SQL y 3. Edge: mismo bucket exacto.
  if (sql[i] !== c.bucket) falla(i, "SQL", c.bucket, sql[i]);
  const b = edge.piezaBucket(c.raw);
  if (b !== c.bucket) falla(i, "Edge", c.bucket, b);

  // 2. TS: categoría, texto y fecha. Lo inválido/vacío no tiene categoría ni fecha
  //    y se muestra el valor crudo (o "—" si está vacío).
  const p = front.leerPieza(c.raw);
  const especial = c.bucket === "Pieza inválida" || c.bucket === "Sin atribuir";
  const esp = especial
    ? {
        categoria: null,
        label: c.bucket === "Sin atribuir" ? "—" : String(c.raw).trim(),
        fecha: null,
      }
    : { categoria: c.categoria, label: c.label, fecha: c.fecha == null ? null : { dia: c.fecha[0], mes: c.fecha[1], anio: c.fecha[2] } };
  if (!igual(p, esp)) falla(i, "TS", esp, p);
});

// Prioridad del año explícito sobre el inferido (resolverAnio).
const ref = new Date(Date.UTC(2026, 7, 1)); // 1/ago/2026
const prio = [
  ["explícito 2026 (mes futuro a ref)", { dia: 14, mes: 9, anio: 2026 }, { anio: 2026, inferido: false }],
  ["explícito pasado (2024)", { dia: 14, mes: 9, anio: 2024 }, { anio: 2024, inferido: false }],
  ["explícito futuro (2027)", { dia: 14, mes: 9, anio: 2027 }, { anio: 2027, inferido: false }],
  ["viejo sin año: 14/9 con ref ago-2026 → 2025 inferido", { dia: 14, mes: 9, anio: null }, { anio: 2025, inferido: true }],
  ["viejo sin año: 4/2 con ref ago-2026 → 2026 inferido", { dia: 4, mes: 2, anio: null }, { anio: 2026, inferido: true }],
];
for (const [nombre, f, esperado] of prio) {
  const r = front.resolverAnio(f, ref);
  if (!igual(r, esperado)) {
    fallas++;
    console.log(`✗ [resolverAnio] ${nombre}\n    esperado: ${JSON.stringify(esperado)}\n    obtenido: ${JSON.stringify(r)}`);
  }
}

const total = casos.length * 3 + prio.length;
console.log(
  fallas === 0
    ? `✓ ${casos.length} casos × 3 parsers (SQL, TS, Edge) + ${prio.length} de prioridad de año: todo coincide.`
    : `\n${fallas} falla(s) de ${total} chequeos.`,
);
process.exit(fallas === 0 ? 0 : 1);
