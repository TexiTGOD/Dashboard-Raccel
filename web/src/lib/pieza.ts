// Lectura de leads.pieza_origen: display y categoría, en un solo lugar.
//
// Conviven DOS formatos y hay que distinguirlos por la FORMA del string, no por la
// palabra:
//
//   VIEJO (guion bajo, sin año)      NUEVO ("<Tipo> - dd/mm/aaaa")
//   REEL_DDMM  -> Posteo             "Reel - 04/08/2026"     -> Reel (reel real)
//   CARR_DDMM  -> Posteo             "Posteo - 04/08/2026"   -> Posteo
//   HIST_DDMM  -> Historias          "Historia - 04/08/2026" -> Historias
//   welcome    -> Seguimientos
//
// La trampa: los REEL_ viejos estaban mal etiquetados (eran carruseles), así que
// "Reel" en formato viejo NO es un reel. Un REEL_0408 y un "Reel - 04/08/2026" son
// cosas distintas. Por eso el tipo se decide por el formato, nunca por la palabra.
//
// Espejo del clasificador SQL public.pieza_bucket(): si cambia un formato, se tocan
// los dos. Acá vive el texto legible; el SQL solo clasifica válida/inválida.

/** Categorías de display (las que ofrece el filtro de Registros). */
export type CategoriaPieza = "seguimientos" | "posteo" | "reel" | "historias";

export const CATEGORIA_LABEL: Record<CategoriaPieza, string> = {
  seguimientos: "Seguimientos",
  posteo: "Posteo",
  reel: "Reel",
  historias: "Historias",
};

// Buckets que ya vienen resueltos desde dashboard_atribucion: son texto de display,
// se dejan pasar tal cual.
const BUCKETS_ESPECIALES = new Set(["Sin atribuir", "Pieza inválida"]);

// El formato viejo es case-SENSITIVE, igual que en pieza_bucket (los valores
// históricos siempre vinieron en mayúscula). Si acá fuera tolerante y el SQL no,
// un mismo lead se vería "Posteo del 04/02" en Registros y "Pieza inválida" en
// Atribución. El formato nuevo sí es case-insensitive en ambos lados.
const VIEJO = /^(REEL|CARR|HIST)_(\d{2})(\d{2})$/;
const NUEVO = /^(reel|posteo|historia)\s*-\s*(\d{2})\/(\d{2})\/(\d{4})$/i;

/**
 * Fecha de la pieza. OJO con `anio`: el formato viejo (REEL_DDMM) NO lo trae, así
 * que viene null y hay que inferirlo con resolverAnio(). El nuevo sí lo trae.
 */
export interface FechaPieza {
  dia: number;
  mes: number; // 1..12
  anio: number | null; // null = el formato no lo incluye
}

export interface Pieza {
  /** null si no se reconoce el formato (o si es un bucket especial). */
  categoria: CategoriaPieza | null;
  /** Texto para mostrar en pantalla. */
  label: string;
  /** null si la pieza no tiene fecha (Seguimientos, o formato no reconocido). */
  fecha: FechaPieza | null;
}

/**
 * Año de una pieza para ubicarla en un timeline. El formato viejo no lo trae: se
 * infiere el más reciente que caiga EN O ANTES de `ref` (ej. con ref = agosto 2026,
 * "04/02" es feb 2026, pero "12/11" es nov 2025 porque nov 2026 todavía no pasó).
 * `inferido` viaja para que la UI pueda marcar que ese año es un supuesto, no un dato.
 */
export function resolverAnio(f: FechaPieza, ref: Date): { anio: number; inferido: boolean } {
  if (f.anio != null) return { anio: f.anio, inferido: false };
  const candidato = ref.getUTCFullYear();
  const enCandidato = Date.UTC(candidato, f.mes - 1, f.dia);
  return enCandidato > ref.getTime()
    ? { anio: candidato - 1, inferido: true }
    : { anio: candidato, inferido: true };
}

/** Clave de agrupación por mes: "2026-08". */
export function claveMes(anio: number, mes: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

/**
 * El regex del formato viejo acepta cualquier grupo de 4 dígitos, así que un
 * REEL_0814 (mes 14) pasa la validación de pieza_bucket. Se conserva su etiqueta
 * (no cambiar el display de datos basura ya existentes), pero NO se le da fecha:
 * si no, abriría un grupo de mes inexistente en el timeline.
 */
function fechaReal(dia: number, mes: number): boolean {
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31;
}

/** Parsea un pieza_origen (o un bucket de atribución) a categoría + texto legible. */
export function leerPieza(raw: unknown): Pieza {
  const s = String(raw ?? "").trim();
  if (!s) return { categoria: null, label: "—", fecha: null };
  if (BUCKETS_ESPECIALES.has(s)) return { categoria: null, label: s, fecha: null };

  if (s.toLowerCase() === "welcome") {
    // Seguimientos no tiene fecha: queda fuera del timeline.
    return { categoria: "seguimientos", label: CATEGORIA_LABEL.seguimientos, fecha: null };
  }

  // Formato viejo: DDMM pegado. REEL_ y CARR_ son ambos Posteo (los REEL_ viejos
  // eran carruseles mal etiquetados).
  const v = s.match(VIEJO);
  if (v) {
    const [, tipo, dd, mm] = v;
    // Formato viejo: sin año (se infiere después con resolverAnio).
    const d = Number(dd), m = Number(mm);
    const fecha: FechaPieza | null = fechaReal(d, m) ? { dia: d, mes: m, anio: null } : null;
    const esHist = tipo.toUpperCase() === "HIST";
    return esHist
      ? { categoria: "historias", label: `Secuencia de Historias del ${dd}/${mm}`, fecha }
      : { categoria: "posteo", label: `Posteo del ${dd}/${mm}`, fecha };
  }

  // Formato nuevo: acá "Reel" SÍ es un reel real.
  const n = s.match(NUEVO);
  if (n) {
    const [, tipo, dd, mm, aaaa] = n;
    // Formato nuevo: el año viene en el dato, no se infiere nada.
    const d = Number(dd), m = Number(mm);
    const fecha: FechaPieza | null = fechaReal(d, m) ? { dia: d, mes: m, anio: Number(aaaa) } : null;
    switch (tipo.toLowerCase()) {
      case "reel":
        return { categoria: "reel", label: `Reel del ${dd}/${mm}`, fecha };
      case "historia":
        return { categoria: "historias", label: `Secuencia de Historias del ${dd}/${mm}`, fecha };
      default:
        return { categoria: "posteo", label: `Posteo del ${dd}/${mm}`, fecha };
    }
  }

  // No reconocida: se muestra tal cual (no se inventa una etiqueta).
  return { categoria: null, label: s, fecha: null };
}

/** Texto legible de una pieza. "—" si está vacía. */
export function piezaLabel(raw: unknown): string {
  return leerPieza(raw).label;
}

/** Categoría de display, para filtrar. null si no se reconoce. */
export function piezaCategoria(raw: unknown): CategoriaPieza | null {
  return leerPieza(raw).categoria;
}
