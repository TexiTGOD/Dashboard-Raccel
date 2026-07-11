import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";

export default async function Home() {
  const profile = await requireProfile();
  if (profile.rol === "setter") redirect("/setter");
  // admin y closer arrancan en la vista de llamadas.
  redirect("/closer");
}
