// Definición + fórmula de cada métrica. Vive en la interfaz (tooltip), no en la
// cabeza de nadie: así el dueño y el operador no discuten qué es "show-up rate".
export interface MetricDef {
  definicion: string;
  formula: string;
}

export const DEFS: Record<string, MetricDef> = {
  cash_collected: {
    definicion: "La plata que efectivamente entró en el período.",
    formula: "SUM(payments.monto) con fecha en el período",
  },
  facturacion: {
    definicion: "El valor total de los contratos cerrados en el período.",
    formula: "SUM(sales.valor_contrato) de ventas cerradas en el período",
  },
  ventas: {
    definicion: "Cantidad de tratos cerrados en el período.",
    formula: "COUNT(sales) cerradas en el período",
  },
  agendas: {
    definicion: "Llamadas agendadas en el período (absoluto). Las canceladas no cuentan.",
    formula: "COUNT(bookings) con fecha_llamada en el período, clase ≠ cancelada",
  },
  leads: {
    definicion: "Personas nuevas que escribieron por DM.",
    formula: "COUNT(leads) con fecha_primer_contacto en el período",
  },
  calificados: {
    definicion: "Los que pueden pagar el ticket.",
    formula: "COUNT(leads) con econ_calificacion = 'calificada'",
  },
  tasa_calificacion: {
    definicion: "De los que escriben, cuántos pasan el filtro económico.",
    formula: "calificados / leads",
  },
  tasa_agenda: {
    definicion: "De los leads del período, qué fracción generó al menos una agenda (cohorte).",
    formula: "leads del período que agendaron / leads del período",
  },
  show_pendientes: {
    definicion: "Llamadas que ya pasaron y todavía no tienen desenlace cargado. No entran en ningún ratio, pero hay que cargarlas.",
    formula: "bookings con fecha_llamada < now() y estado = programada",
  },
  atendidas: {
    definicion: "Llamadas donde el lead se presentó.",
    formula: "COUNT(bookings) con estado = 'atendida'",
  },
  show_rate: {
    definicion: "De las que agendaron y ya pasó la fecha, cuántas aparecieron.",
    formula: "atendidas / (atendidas + no_show), solo llamadas ya pasadas",
  },
  close_rate_atendidas: {
    definicion: "De las que se presentaron, cuántas compraron.",
    formula: "ventas / atendidas",
  },
  close_rate_agendadas: {
    definicion: "De las que agendaron, cuántas compraron.",
    formula: "ventas / agendas",
  },
  aov: {
    definicion: "Ticket promedio del período.",
    formula: "facturación / ventas",
  },
  cash_por_lead: {
    definicion: "Cuánta plata trajo cada lead de esa pieza. La única que importa para decidir qué contenido hacer.",
    formula: "cash_collected / leads (por pieza)",
  },
};
