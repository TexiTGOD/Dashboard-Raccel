import { createBrowserClient } from "@supabase/ssr";

// Cliente para componentes de browser (usa la sesión del usuario, RLS aplica).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
