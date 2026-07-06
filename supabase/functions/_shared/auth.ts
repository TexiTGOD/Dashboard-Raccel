// Validación del secret compartido por header.
// Cada webhook (ManyChat, Calendly/Zapier, Fathom/Zapier) debe mandar el header
//   x-webhook-secret: <WEBHOOK_SECRET>
// para poder escribir. Hotmart usa su propio hottok (ver hotmart-webhook).

import { json } from "./http.ts";

// Comparación en tiempo constante para no filtrar el secret por timing.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

// Devuelve una Response de error si el secret no valida, o null si está OK.
export function checkSecret(req: Request, headerName = "x-webhook-secret", envName = "WEBHOOK_SECRET"): Response | null {
  const expected = Deno.env.get(envName);
  if (!expected) {
    return json({ error: `${envName} no configurado en el servidor` }, 500);
  }
  const got = req.headers.get(headerName) ?? "";
  if (!safeEqual(got, expected)) {
    return json({ error: "no autorizado" }, 401);
  }
  return null;
}
