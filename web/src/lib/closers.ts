// Lista de closers y su display. Único lugar para agregar/cambiar closers.
// El value es el identificador interno (matchea bookings.closer / sales.closer
// / profiles.closer_identifier); el label es lo que se muestra en pantalla —
// nunca el mail.
export const CLOSER_OPTIONS = [
  { value: "lindameneghelli@hotmail.com", label: "Linda" },
  { value: "mariabetinabeinatborde@gmail.com", label: "Betina" },
] as const;

// Nombre a mostrar para un closer. Si el valor no está en la lista (closer
// nuevo sin agregar todavía), muestra el valor crudo en vez de ocultarlo.
export function closerLabel(identifier: string | null | undefined): string {
  if (!identifier) return "—";
  return CLOSER_OPTIONS.find((o) => o.value === identifier)?.label ?? identifier;
}
