import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { signOut } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { NavLinks } from "./nav-links";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const comercial = profile.rol === "closer" || profile.rol === "admin";

  return (
    <div className="flex-1 flex flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-[1200px] items-center gap-8 px-6 py-4">
          <Link
            href="/"
            className="font-heading text-lg font-bold uppercase tracking-[0.14em] text-primary"
          >
            Raccel
          </Link>
          {comercial && <NavLinks />}
          <div className="ml-auto flex items-center gap-5">
            <div className="text-right leading-tight">
              <div className="text-sm text-foreground">{profile.nombre}</div>
              <div className="micro-label">{profile.rol}</div>
            </div>
            <form action={signOut}>
              <Button variant="ghost" size="sm">
                Salir
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
