import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

// Usuario + su profile (o nulls si no hay sesión).
export async function getUserAndProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null as Profile | null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, nombre, rol, closer_identifier, activo")
    .eq("id", user.id)
    .single();

  return { user, profile: (profile as Profile | null) ?? null };
}

// Exige sesión con profile ACTIVO. Sin sesión -> /login. Sin profile o inactivo
// -> /sin-acceso (evita loop con el middleware).
export async function requireProfile(): Promise<Profile> {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login");
  if (!profile || !profile.activo) redirect("/sin-acceso");
  return profile;
}
