import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { signOut } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { SidebarNav } from "./sidebar-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();

  return (
    <div className="flex-1 md:flex">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border md:flex">
        <div className="flex h-full flex-col p-4">
          <Link
            href="/"
            className="mb-6 px-3 font-heading text-lg font-bold uppercase tracking-[0.14em] text-primary"
          >
            Raccel
          </Link>
          <SidebarNav rol={profile.rol} />
          <div className="mt-auto border-t border-border px-3 pt-4">
            <div className="text-sm text-foreground">{profile.nombre}</div>
            <div className="micro-label mb-2">{profile.rol}</div>
            <form action={signOut}>
              <Button variant="ghost" size="sm" className="px-0">
                Salir
              </Button>
            </form>
          </div>
        </div>
      </aside>

      {/* Top bar (mobile) */}
      <header className="border-b border-border md:hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/" className="font-heading text-lg font-bold uppercase tracking-[0.14em] text-primary">
            Raccel
          </Link>
          <form action={signOut} className="ml-auto">
            <Button variant="ghost" size="sm">
              Salir
            </Button>
          </form>
        </div>
        <div className="px-2 pb-2">
          <SidebarNav rol={profile.rol} horizontal />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1100px] flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
