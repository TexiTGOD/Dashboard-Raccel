// Helpers HTTP comunes a todas las Edge Functions.

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Parsea el body como JSON; devuelve null si falla (no revienta).
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

// Sólo aceptamos POST en los webhooks. Devuelve una Response si el método no sirve.
export function requirePost(req: Request): Response | null {
  if (req.method !== "POST") {
    return json({ error: "método no permitido, usar POST" }, 405);
  }
  return null;
}

// Interpreta valores tipo boolean que pueden venir como string ("true"/"1"/"si").
export function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "true" || s === "1" || s === "si" || s === "sí" || s === "yes";
}
