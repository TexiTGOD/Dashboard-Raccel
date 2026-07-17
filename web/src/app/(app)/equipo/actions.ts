"use server";

import { createClient } from "@/lib/supabase/server";
import { getUserAndProfile } from "@/lib/auth";
import { revalidatePath } from "next/cache";

type Result = { ok: true } | { error: string };
const ROLES = ["admin", "closer", "setter"] as const;

// Cambia el rol de un miembro. Solo admin (RLS profiles_admin_all + guard). No se
// puede cambiar el propio rol: evita que un admin se quede sin acceso sin querer.
export async function updateRole(input: { profileId: string; rol: string }): Promise<Result> {
  const { user, profile } = await getUserAndProfile();
  if (!user || !profile || profile.rol !== "admin") return { error: "No autorizado" };
  if (!ROLES.includes(input.rol as (typeof ROLES)[number])) return { error: "Rol inválido" };
  if (input.profileId === user.id) return { error: "No podés cambiar tu propio rol (evita quedar sin acceso)." };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ rol: input.rol }).eq("id", input.profileId);
  if (error) return { error: error.message };
  revalidatePath("/equipo");
  return { ok: true };
}
