import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { signOut } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const comercial = profile.rol === "closer" || profile.rol === "admin";

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link href="/" className="font-semibold">
            Raccel
          </Link>
          {comercial && (
            <nav className="flex items-center gap-1 text-sm">
              <Link href="/closer" className="rounded px-2 py-1 hover:bg-muted">
                Llamadas
              </Link>
              <Link href="/closer/ventas-sin-matchear" className="rounded px-2 py-1 hover:bg-muted">
                Ventas s/ matchear
              </Link>
            </nav>
          )}
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <div className="text-sm leading-tight">{profile.nombre}</div>
            </div>
            <Badge variant="secondary" className="capitalize">
              {profile.rol}
            </Badge>
            <form action={signOut}>
              <Button variant="ghost" size="sm">
                Salir
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">{children}</main>
    </div>
  );
}
