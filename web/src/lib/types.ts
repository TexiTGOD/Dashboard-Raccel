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
  lead_id: string | null;
}

export interface Call {
  id: string;
  booking_id: string | null;
  resumen_fathom: string | null;
  transcript_url: string | null;
  notas_closer: string | null;
  resultado: ResultadoCall;
  fecha: string | null;
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
