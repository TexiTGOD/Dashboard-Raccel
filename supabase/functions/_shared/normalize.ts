// Normalización espejo de las funciones SQL (defensa en profundidad).
// La DB igual re-normaliza en los triggers; esto mantiene consistencia y logs limpios.

export function normalizeHandle(raw: unknown): string | null {
  if (raw == null) return null;
  const v = String(raw).trim().toLowerCase().replace(/^@+/, "");
  return v === "" ? null : v;
}

export function normalizeEmail(raw: unknown): string | null {
  if (raw == null) return null;
  const v = String(raw).trim().toLowerCase();
  return v === "" ? null : v;
}
