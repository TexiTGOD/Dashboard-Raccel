import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";

export default async function Home() {
  const profile = await requireProfile();
  if (profile.rol === "admin") redirect("/operaciones");
  if (profile.rol === "setter") redirect("/setter");
  redirect("/closer");
}
