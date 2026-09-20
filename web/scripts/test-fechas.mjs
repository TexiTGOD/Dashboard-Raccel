// Helpers de fecha/hora de lib/format.ts: tienen que dar EXACTAMENTE lo mismo sin
// importar la zona horaria del proceso (Vercel = UTC, la Mac de Bruno = Argentina,
// un browser en cualquier lado). Se corre el mismo chequeo en varias zonas:
//
//   node scripts/test-fechas.mjs
//
// Caso real que motivó esto: booking 2026-09-21 18:00+00 (= 15:00 Argentina) se
// mostraba "06:00 p. m." en prod porque el servidor formateaba en UTC.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const ZONAS = ["UTC", "America/Argentina/Buenos_Aires", "Asia/Tokyo", "America/Los_Angeles"];

// Proceso padre: relanza este mismo script una vez por zona.
if (!process.env.TZ_HIJO) {
  let fallo = false;
  for (const tz of ZONAS) {
    try {
      const out = execFileSync(process.execPath, [fileURLToPath(import.meta.url)], {
        env: { ...process.env, TZ: tz, TZ_HIJO: "1" },
        encoding: "utf8",
      });
      process.stdout.write(out);
    } catch (e) {
      fallo = true;
      process.stdout.write((e.stdout ?? "") + (e.stderr ?? ""));
    }
  }
  console.log(fallo ? "\n✗ hay fallas" : `\n✓ OK en ${ZONAS.length} zonas horarias (${ZONAS.join(", ")})`);
  process.exit(fallo ? 1 : 0);
}

const aca = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ts = require("typescript");
const js = ts.transpileModule(readFileSync(join(aca, "../src/lib/format.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const f = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

// Intl mete espacios finos/no separables según la versión de ICU: se normalizan.
const n = (s) => s.replace(/[  ]/g, " ");

let fallas = 0;
const t = (nombre, obtenido, esperado) => {
  if (obtenido !== esperado) {
    fallas++;
    console.log(`✗ [${process.env.TZ}] ${nombre}\n    esperado: ${JSON.stringify(esperado)}\n    obtenido: ${JSON.stringify(obtenido)}`);
  }
};

// El caso de Melissa Paredes.
t("fmtFecha 18:00Z = 15:00 AR", n(f.fmtFecha("2026-09-21T18:00:00+00:00")), "21-sept, 03:00 p. m.");
t("fmtFecha formato ISO de PostgREST", n(f.fmtFecha("2026-09-21T18:00:00.000Z")), "21-sept, 03:00 p. m.");
// Borde de día: 02:30Z ya es la noche anterior en Argentina.
t("fmtFecha cruza medianoche UTC", n(f.fmtFecha("2026-09-21T02:30:00Z")), "20-sept, 11:30 p. m.");
t("fmtFecha mediodía AR", n(f.fmtFecha("2026-09-21T15:00:00Z")), "21-sept, 12:00 p. m.");
t("fmtFecha null", f.fmtFecha(null), "Sin fecha");
t("fmtFecha basura", f.fmtFecha("no-es-fecha"), "—");

// `date` puro (gastos.fecha, proximo_seguimiento): no es un instante, no se corre.
t("fmtDia date puro", n(f.fmtDia("2026-09-21")), "21-sept");
t("fmtFecha date puro", n(f.fmtFecha("2026-09-21")), "21-sept");
t("fmtDia instante cruza medianoche", n(f.fmtDia("2026-09-21T02:30:00Z")), "20-sept");
t("fmtDia null", f.fmtDia(null), "—");

t("diaArg 02:30Z -> día anterior", f.diaArg("2026-09-21T02:30:00Z"), "2026-09-20");
t("diaArg 03:00Z -> mismo día", f.diaArg("2026-09-21T03:00:00Z"), "2026-09-21");
t("diaArg date puro", f.diaArg("2026-09-21"), "2026-09-21");
t("diaArg vacío", f.diaArg(""), "");
t("diaArg basura", f.diaArg("xx"), "");

// "Hoy" Argentina: a las 01:00Z (22:00 AR) el servidor UTC ya está en el día siguiente.
t("hoyArg 01:00Z", f.hoyArg(new Date("2026-09-21T01:00:00Z")), "2026-09-20");
t("hoyArg 03:00Z", f.hoyArg(new Date("2026-09-21T03:00:00Z")), "2026-09-21");
t("hoyArg fin de mes", f.hoyArg(new Date("2026-10-01T02:00:00Z")), "2026-09-30");

// Día elegido en un input date -> instante a guardar.
const ahora = new Date("2026-09-20T15:00:00Z"); // 12:00 AR del 20/9
t("instanteDeDiaArg hoy = ahora", f.instanteDeDiaArg("2026-09-20", ahora), ahora.toISOString());
t("instanteDeDiaArg día pasado = 23:59 AR", f.instanteDeDiaArg("2026-09-19", ahora), "2026-09-20T02:59:00.000Z");
for (const dia of ["2026-09-19", "2026-08-31", "2026-01-01"]) {
  t(`ida y vuelta ${dia}`, f.diaArg(f.instanteDeDiaArg(dia, ahora)), dia);
}

if (fallas) process.exit(1);
console.log(`ok [${process.env.TZ}]`);
