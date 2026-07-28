// Lectura de bookings.calendly_respuestas (el array questions_and_answers que
// guarda el webhook, crudo). El texto de las preguntas puede cambiar en Calendly,
// así que el matcheo es TOLERANTE: primero por palabra clave de la pregunta y,
// si eso falla, por la FORMA de la respuesta (las de opción múltiple tienen textos
// muy distintivos). No se matchea por posición: si el formulario cambia de orden,
// mostrar el dato equivocado con la etiqueta correcta es peor que no mostrarlo.
//
// Solo presentación (la convención del proyecto: cálculo en la base, formateo acá).

export interface QA {
  pregunta: string;
  respuesta: string;
}

export interface RespuestasProspecto {
  telefono: string | null;
  sentimientos: string | null;
  trabajo: string | null;
  objetivo: string | null;
  recursos: string | null;
  decisor: string | null;
  /** Pares que no matchearon ningún campo conocido (fallback de la vista). */
  sinClasificar: QA[];
}

// --- helpers de texto -------------------------------------------------------

/** Colapsa saltos de línea (respuestas multilínea, ej. los 3 sentimientos) y espacios. */
function aplanar(s: string): string {
  return s
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" · ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Recorta texto libre largo, cortando en el último espacio para no partir palabras. */
export function recortar(s: string, max = 90): string {
  if (s.length <= max) return s;
  const corte = s.slice(0, max);
  const esp = corte.lastIndexOf(" ");
  return (esp > max * 0.6 ? corte.slice(0, esp) : corte).trimEnd() + "…";
}

const sinAcentos = (s: string) =>
  s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// --- etiquetas cortas para las de opción múltiple ---------------------------
// Los textos salen de las opciones reales del formulario. Sin emojis.

/** "Sí, cuento con $750 a $1250 UDS" → "$750–1250" · "No estaría dispuesta…" → "No invertiría" */
export function etiquetaRecursos(a: string): string {
  const s = sinAcentos(a);
  if (/no estaria dispuesta|no es mi prioridad/.test(s)) return "No invertiría";
  // Cualquier tramo "$X a $Y" (sirve para tramos nuevos sin tocar el código).
  const m = a.match(/\$\s*([\d.,]+)\s*a\s*\$?\s*([\d.,]+)/);
  if (m) return `$${m[1]}–${m[2]}`;
  return recortar(a, 40);
}

/** "No necesito a nadie…" → "Decide sola" · "Necesito a mi pareja…" → "Necesita a otra persona" */
export function etiquetaDecisor(a: string): string {
  const s = sinAcentos(a);
  if (/no necesito a nadie/.test(s)) return "Decide sola";
  if (/necesito a (mi pareja|alguien)/.test(s)) return "Necesita a otra persona";
  return recortar(a, 40);
}

const OBJETIVOS: [RegExp, string][] = [
  [/todos los resultados/, "Todos los resultados"],
  [/recuperar la confianza/, "Confianza y vínculos sanos"],
  [/priorizarme/, "Priorizarse, sin ansiedad"],
  [/sanar mis heridas/, "Sanar heridas y autoestima"],
  [/elegir y construir una pareja/, "Elegir pareja consciente"],
];

export function etiquetaObjetivo(a: string): string {
  const s = sinAcentos(a);
  for (const [rx, label] of OBJETIVOS) if (rx.test(s)) return label;
  return recortar(a, 40);
}

// --- matcheo ----------------------------------------------------------------
// Orden = prioridad. `pregunta` matchea por palabra clave; `respuesta` es el
// fallback por forma del texto (solo donde es inequívoco).

type Campo = keyof Omit<RespuestasProspecto, "sinClasificar">;

// Preguntas que NO van a la ficha (se descartan antes de matchear, así tampoco
// aparecen en "Otras respuestas"):
//  - el compromiso de asistencia: texto larguísimo, no aporta contexto de venta.
//  - el usuario de Instagram: ya se muestra en el encabezado de la ficha (y es lo
//    que el webhook usa para matchear el lead).
const IGNORAR: RegExp[] = [
  /vamos a reservar \d+ minutos|reservar \d+ minutos de nuestro tiempo/,
  /instagram|usuario de ig|(^|\W)ig(\W|$)|arroba|handle/,
];

// Tres niveles de señal, de más a menos confiable:
//   frase     = el texto REAL de la pregunta del formulario (marcador inequívoco)
//   respuesta = la forma de la respuesta (las de opción múltiple son distintivas)
//   pregunta  = palabra clave genérica (frágil: es la que se cruza entre campos)
// `excluye` SOLO frena el nivel `pregunta`. No puede frenar `frase` ni `respuesta`:
// si la respuesta tiene la forma inequívoca del campo, es de ese campo aunque la
// pregunta mencione palabras de otro (esto es lo que rompía Decisor, cuya pregunta
// real dice "heridas emocionales" y quedaba excluida por la palabra "emocion").
const CAMPOS: {
  key: Campo;
  frase: RegExp;
  pregunta: RegExp;
  respuesta?: RegExp;
  excluye?: RegExp;
  etiqueta?: (a: string) => string;
}[] = [
  {
    key: "recursos",
    frase: /recursos financieros|cuentas con los recursos/,
    pregunta: /recurso|invertir|inversion|economic|presupuesto|dispuesta/,
    respuesta: /^s[ií],?\s*cuento con|^no estaria dispuesta/,
    excluye: /involucrad|pareja\/persona|quien decide/,
    etiqueta: etiquetaRecursos,
  },
  {
    key: "decisor",
    frase: /pareja\/persona|involucrada en la toma de decisiones/,
    pregunta: /involucrad|decidir|toma de decision|quien decide|necesitas a (alguien|tu pareja)/,
    respuesta: /^no necesito a nadie|^necesito a (mi pareja|alguien)/,
    etiqueta: etiquetaDecisor,
  },
  {
    key: "objetivo",
    frase: /te gustaria conseguir|proximos 60 dias/,
    pregunta: /60 dias|deseo|lograr|objetivo|meta/,
    respuesta: new RegExp(OBJETIVOS.map(([rx]) => rx.source).join("|")),
    excluye: /involucrad|pareja\/persona|recursos financieros/,
    etiqueta: etiquetaObjetivo,
  },
  {
    key: "sentimientos",
    frase: /sentimientos?\/emocion|3 sentimientos/,
    pregunta: /sentimiento|emocion|sientes/,
    excluye: /involucrad|pareja\/persona/,
  },
  {
    key: "telefono",
    frase: /telefono de contacto|numero de whatsapp/,
    pregunta: /telefono|whats|celular|numero|movil|contacto/,
    // Fallback: una respuesta casi toda dígitos (mín. 6) es un teléfono.
    respuesta: /^[\d\s()+.-]{6,}$/,
  },
  {
    key: "trabajo",
    frase: /de que trabajas|trabajas actualmente/,
    pregunta: /trabaj|situacion actual|ocupacion|dedic|profesion|empleo/,
    excluye: /sentimiento|emocion|involucrad/,
  },
];

/**
 * Normaliza el jsonb crudo a pares {pregunta, respuesta} con contenido, y
 * descarta las preguntas que no van a la ficha (ver IGNORAR).
 */
function aPares(raw: unknown): QA[] {
  if (!Array.isArray(raw)) return [];
  const out: QA[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const pregunta = typeof o.question === "string" ? o.question : "";
    const respuesta = typeof o.answer === "string" ? aplanar(o.answer) : "";
    if (!respuesta) continue;
    const preg = sinAcentos(pregunta);
    if (preg && IGNORAR.some((rx) => rx.test(preg))) continue;
    out.push({ pregunta, respuesta });
  }
  return out;
}

/**
 * Extrae los campos conocidos del array de Calendly. Cada par se consume una sola
 * vez (no puede alimentar dos campos). Lo que no matchea queda en `sinClasificar`
 * para que la vista igual pueda mostrarlo en vez de dejar la ficha vacía.
 */
export function leerRespuestasCalendly(raw: unknown): RespuestasProspecto {
  const pares = aPares(raw);
  const out: RespuestasProspecto = {
    telefono: null, sentimientos: null, trabajo: null,
    objetivo: null, recursos: null, decisor: null, sinClasificar: [],
  };

  // Se puntúa cada combinación (campo, par) y después se asigna de mayor a menor.
  // Con "primero gana" un cruce de palabras clave arruinaba dos campos a la vez.
  const FRASE = 4; // texto real de la pregunta
  const RESPUESTA = 3; // forma inequívoca de la respuesta
  const PREGUNTA = 2; // palabra clave genérica (la única que `excluye` puede frenar)
  const candidatos: { campo: Campo; par: number; orden: number; puntos: number }[] = [];

  pares.forEach((par, idx) => {
    const preg = sinAcentos(par.pregunta);
    const resp = sinAcentos(par.respuesta);
    CAMPOS.forEach((c, orden) => {
      let puntos = 0;
      if (preg && c.frase.test(preg)) puntos = FRASE;
      else if (c.respuesta && c.respuesta.test(resp)) puntos = RESPUESTA;
      // El nivel débil sí puede quedar bloqueado por una marca de otro campo.
      else if (preg && c.pregunta.test(preg) && !(c.excluye && c.excluye.test(preg))) puntos = PREGUNTA;
      if (puntos) candidatos.push({ campo: c.key, par: idx, orden, puntos });
    });
  });

  // Desempate estable: puntaje, después orden de CAMPOS, después posición.
  candidatos.sort((a, b) => b.puntos - a.puntos || a.orden - b.orden || a.par - b.par);

  const usados = new Set<number>();
  for (const c of candidatos) {
    if (out[c.campo] !== null || usados.has(c.par)) continue;
    const par = pares[c.par];
    const etiqueta = CAMPOS[c.orden].etiqueta;
    out[c.campo] = etiqueta ? etiqueta(par.respuesta) : par.respuesta;
    usados.add(c.par);
  }

  out.sinClasificar = pares.filter((_, i) => !usados.has(i));
  return out;
}
