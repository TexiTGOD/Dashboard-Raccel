// Opciones fijas del desenlace de la llamada (panel "Desenlace" en
// /closer/[id]). Único lugar para agregar una opción nueva — el value tiene
// que coincidir con el constraint CHECK de la columna en `calls`. Bruno
// revisa los campos "*_extra" semanalmente y promueve acá lo que se repita.

export const PRODUCTO_OFRECIDO_OPTIONS = [
  { value: "Volver a Sentir-Me", label: "Volver a Sentir-Me" },
  { value: "Volver a Sentir-Me | Autoguiado", label: "Volver a Sentir-Me | Autoguiado (USD 500)" },
] as const;

export const DOLOR_PRINCIPAL_OPTIONS = [
  { value: "intimidad_sin_eleccion", label: "Intimidad sin elección" },
  { value: "comparacion_otra", label: "Comparación con otra" },
  { value: "darlo_todo_no_elegida", label: "Darlo todo y no ser elegida" },
] as const;

export const OBJECIONES_OPTIONS = [
  { value: "plata", label: "No tengo la plata / es caro" },
  { value: "hablar_pareja", label: "Lo tengo que hablar con mi pareja" },
  { value: "no_es_momento", label: "No es el momento" },
  { value: "lo_voy_a_pensar", label: "Lo voy a pensar" },
  { value: "no_tengo_tiempo", label: "No tengo tiempo para el proceso" },
] as const;

export function productoOfrecidoLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return PRODUCTO_OFRECIDO_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function dolorPrincipalLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return DOLOR_PRINCIPAL_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function objecionLabel(v: string): string {
  return OBJECIONES_OPTIONS.find((o) => o.value === v)?.label ?? v;
}
