// Tipos que reflejan el schema de la DB (fuente de verdad: supabase/migrations).

export type Rol = "admin" | "closer" | "setter";

export type Dolor =
  | "no_puedo_soltar"
  | "ansiedad_apego"
  | "comparacion_otra"
  | "darlo_todo_no_elegida"
  | "hombre_ambiguo"
  | "no_disponible";

export type EconCalificacion = "calificada" | "zona_gris" | "no_calificada";
export type EstadoBooking = "programada" | "atendida" | "no_show" | "reprogramada" | "cancelada";
export type ResultadoCall = "vendido" | "perdido" | "follow_up" | "pendiente";
export type MetodoPago = "hotmart" | "transferencia";

export const ESTADOS_BOOKING: EstadoBooking[] = [
  "programada", "atendida", "no_show", "reprogramada", "cancelada",
];
export const RESULTADOS_CALL: ResultadoCall[] = [
  "pendiente", "vendido", "perdido", "follow_up",
];

// Etiquetas legibles.
export const DOLOR_LABEL: Record<string, string> = {
  no_puedo_soltar: "No puedo soltar",
  ansiedad_apego: "Ansiedad / apego",
  comparacion_otra: "Comparación con otra",
  darlo_todo_no_elegida: "Darlo todo y no ser elegida",
  hombre_ambiguo: "Hombre ambiguo",
  no_disponible: "No disponible",
};

export const CONCIENCIA_LABEL: Record<number, string> = {
  1: "1 · Externaliza",
  2: "2 · Confusión",
  3: "3 · Reconoce patrón",
  4: "4 · Herida",
  5: "5 · Sabe pero no cambia",
  6: "6 · Intención de proceso",
};

export interface Profile {
  id: string;
  nombre: string | null;
  rol: Rol;
  closer_identifier: string | null;
  activo: boolean;
}

export interface Lead {
  id: string;
  manychat_contact_id: string;
  ig_username: string | null;
  nombre: string | null;
  pieza_origen: string | null;
  respuesta_lead: string | null;
  respuesta_lead_2: string | null;
  dolor: Dolor | null;
  conciencia: number | null;
  crisis: boolean;
  econ_declarada: string | null;
  respuesta_econ: string | null;
  econ_calificacion: EconCalificacion | null;
  estado_funnel: string | null;
  // Calificación nueva (3 dimensiones). La prende el webhook calificacion-lead
  // desde las etiquetas de ManyChat; el dashboard solo las lee. OJO: distinto de
  // econ_calificacion (sistema viejo, text).
  calificado_dolor: boolean;
  calificado_urgencia: boolean;
  calificado_economica: boolean;
}

export interface Booking {
  id: string;
  calendly_event_id: string;
  ig_username: string | null;
  email: string | null;
  nombre: string | null;
  closer: string | null;
  fecha_llamada: string | null;
  estado: EstadoBooking | null;
  grabacion_url: string | null;
  /** Criterio del closer. null = todavía no lo marcó (≠ "no calificada"). */
  calificado: boolean | null;
  /** jsonb crudo de Calendly (questions_and_answers). Se lee con leerRespuestasCalendly. */
  calendly_respuestas: unknown;
  lead_id: string | null;
}

export type ProductoOfrecido = "Volver a Sentir-Me" | "Volver a Sentir-Me | Autoguiado";
export type DolorPrincipal = "intimidad_sin_eleccion" | "comparacion_otra" | "darlo_todo_no_elegida";
export type Objecion = "plata" | "hablar_pareja" | "no_es_momento" | "lo_voy_a_pensar" | "no_tengo_tiempo";

export interface Call {
  id: string;
  booking_id: string | null;
  resumen_fathom: string | null;
  // Muerto por ahora (queda para cuando se integre Fathom): no se lee ni se
  // escribe desde ningún lado del frontend todavía. No borrar.
  transcript_url: string | null;
  notas_closer: string | null;
  resultado: ResultadoCall;
  fecha: string | null;
  producto_ofrecido: ProductoOfrecido | null;
  precio_ofrecido: number | null;
  dolor_principal: DolorPrincipal | null;
  dolor_extra: string | null;
  objeciones: Objecion[] | null;
  objeciones_extra: string | null;
  /** Solo tiene sentido (y la base solo lo permite) con resultado = "follow_up". */
  proximo_seguimiento: string | null;
}

// Vista Lista de /closer: 3 accesos rápidos (dashboard_llamadas_lista/_chips).
// "seguimientos"/"sin_desenlace" son listas de pendientes, absolutas — NO
// respetan el rango de fechas de la página (uno vencido de hace 2 meses tiene
// que seguir viéndose). Solo "todas" respeta desde/hasta.
export type VistaLlamadas = "seguimientos" | "sin_desenlace" | "venta_sin_registrar" | "todas";

// Fila de dashboard_llamadas_lista. es_vencido ya viene calculado en SQL con
// hoy_argentina() — nunca se recalcula "hoy" en el cliente (evita el bug de
// timezone: el server de Next puede correr en UTC).
export interface LlamadaListaRow {
  booking_id: string;
  fecha: string | null;
  lead_nombre: string | null;
  closer: string | null;
  estado: EstadoBooking | null;
  resultado: ResultadoCall | null;
  producto_ofrecido: ProductoOfrecido | null;
  precio_ofrecido: number | null;
  objeciones: Objecion[] | null;
  proximo_seguimiento: string | null;
  es_vencido: boolean;
}

export type TipoVenta = "nueva" | "recompra" | "upsell" | "backend";

export interface Sale {
  id: string;
  hotmart_transaction_id: string | null;
  email_comprador: string | null;
  nombre_comprador: string | null;
  monto: number | null;
  valor_contrato: number | null; // facturación
  tipo: TipoVenta;
  producto: string | null;
  cuotas_total: number | null;
  closer: string | null;
  moneda: string | null;
  status: string | null;
  metodo_pago: MetodoPago;
  lead_id: string | null;
  booking_id: string | null;
  matcheada: boolean;
}

export interface Payment {
  id: string;
  sale_id: string;
  monto: number | null;
  moneda: string | null;
  fecha: string | null;
  metodo_pago: MetodoPago;
  hotmart_transaction_id: string | null;
  numero_cuota: number | null;
}

export interface Cuota {
  id: string;
  sale_id: string;
  numero_cuota: number;
  monto_esperado: number | null;
  fecha_vencimiento: string | null;
  payment_id: string | null; // null = pendiente
}
