// Cliente Supabase con service_role (hace bypass de RLS).
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY se inyectan solos en las Edge Functions
// deployadas; en local se pasan vía --env-file.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
