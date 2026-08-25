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

export interface Pieza {
  /** null si no se reconoce el formato (o si es un bucket especial). */
  categoria: CategoriaPieza | null;
  /** Texto para mostrar en pantalla. */
  label: string;
}

/** Parsea un pieza_origen (o un bucket de atribución) a categoría + texto legible. */
export function leerPieza(raw: unknown): Pieza {
  const s = String(raw ?? "").trim();
  if (!s) return { categoria: null, label: "—" };
  if (BUCKETS_ESPECIALES.has(s)) return { categoria: null, label: s };

  if (s.toLowerCase() === "welcome") {
    return { categoria: "seguimientos", label: CATEGORIA_LABEL.seguimientos };
  }

  // Formato viejo: DDMM pegado. REEL_ y CARR_ son ambos Posteo (los REEL_ viejos
  // eran carruseles mal etiquetados).
  const v = s.match(VIEJO);
  if (v) {
    const [, tipo, dd, mm] = v;
    const esHist = tipo.toUpperCase() === "HIST";
    return esHist
      ? { categoria: "historias", label: `Secuencia de Historias del ${dd}/${mm}` }
      : { categoria: "posteo", label: `Posteo del ${dd}/${mm}` };
  }

  // Formato nuevo: acá "Reel" SÍ es un reel real.
  const n = s.match(NUEVO);
  if (n) {
    const [, tipo, dd, mm] = n;
    switch (tipo.toLowerCase()) {
      case "reel":
        return { categoria: "reel", label: `Reel del ${dd}/${mm}` };
      case "historia":
        return { categoria: "historias", label: `Secuencia de Historias del ${dd}/${mm}` };
      default:
        return { categoria: "posteo", label: `Posteo del ${dd}/${mm}` };
    }
  }

  // No reconocida: se muestra tal cual (no se inventa una etiqueta).
  return { categoria: null, label: s };
}

/** Texto legible de una pieza. "—" si está vacía. */
export function piezaLabel(raw: unknown): string {
  return leerPieza(raw).label;
}

/** Categoría de display, para filtrar. null si no se reconoce. */
export function piezaCategoria(raw: unknown): CategoriaPieza | null {
  return leerPieza(raw).categoria;
}
