// Clasificación de pieza_origen para la ALARMA de calidad de dato del webhook.
//
// Es un port literal de public.pieza_bucket() / pieza_nueva_canonica() (SQL) y
// espejo de web/src/lib/pieza.ts: si cambia un formato, se tocan los tres. Hay una
// tabla de casos que corre contra los tres (web/scripts/test-pieza.mjs).
//
// Vive en su propio archivo (sin imports de Deno) para poder correrlo desde Node en
// esa tabla de casos.
//
//   viejo (case-sensitive): REEL_DDMM / CARR_DDMM / HIST_DDMM
//   nuevo (case-insens.):   "<Reel|Posteo|Historia> - D/M/AAAA" + texto opcional
//   seguimientos:           welcome
//
// El webhook NO rechaza ni modifica el valor: se guarda crudo igual. Esto solo decide
// si se loguea la alarma.

// Igual que el btrim de SQL: espacio, tab, saltos de línea y NBSP.
const RECORTE = /^[ \t\r\n ]+|[ \t\r\n ]+$/g;

const VIEJO = /^(REEL|CARR|HIST)_[0-9]{4}$/;
// Después del año (4 dígitos exactos) puede venir texto pero no otro dígito.
const NUEVO = /^(reel|posteo|historia)[\s]*-[\s]*([0-9]{1,2})\/([0-9]{1,2})\/([0-9]{4})(?:[^0-9][\s\S]*)?$/i;

const dos = (s: string) => s.padStart(2, "0");

/** "Posteo - 08/09/2026" o null si no se reconoce / la fecha no existe. */
export function piezaNuevaCanonica(pieza: string): string | null {
  const m = pieza.replace(RECORTE, "").match(NUEVO);
  if (!m) return null;
  const dia = Number(m[2]), mes = Number(m[3]), anio = Number(m[4]);
  if (mes < 1 || mes > 12) return null;
  if (anio < 2000 || anio > 2100) return null;
  if (dia < 1 || dia > new Date(Date.UTC(anio, mes, 0)).getUTCDate()) return null;
  const tipo = m[1].toLowerCase();
  return `${tipo[0].toUpperCase()}${tipo.slice(1)} - ${dos(m[2])}/${dos(m[3])}/${m[4]}`;
}

/** Mismo resultado que public.pieza_bucket(pieza). */
export function piezaBucket(pieza: string | null | undefined): string {
  if (pieza == null) return "Sin atribuir";
  if (VIEJO.test(pieza)) return pieza;
  const nueva = piezaNuevaCanonica(pieza);
  if (nueva) return nueva;
  // trim() de SQL solo saca espacios.
  const sinEspacios = pieza.replace(/^ +| +$/g, "");
  if (sinEspacios.toLowerCase() === "welcome") return "welcome";
  if (sinEspacios === "") return "Sin atribuir";
  return "Pieza inválida";
}

export function piezaEsInvalida(pieza: string | null | undefined): boolean {
  return piezaBucket(pieza) === "Pieza inválida";
}
