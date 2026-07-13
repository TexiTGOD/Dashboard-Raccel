"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Rol } from "@/lib/types";

const byRol: Record<Rol, { href: string; label: string }[]> = {
  admin: [
    { href: "/operaciones", label: "Operaciones" },
    { href: "/operaciones/registros", label: "Registros" },
    { href: "/closer", label: "Llamadas" },
    { href: "/closer/ventas-sin-matchear", label: "Ventas s/ matchear" },
  ],
  closer: [
    { href: "/closer", label: "Llamadas" },
    { href: "/closer/ventas-sin-matchear", label: "Ventas s/ matchear" },
  ],
  setter: [{ href: "/setter", label: "Pipeline" }],
};

// Un item está activo si la ruta actual arranca con su href, pero elegimos el
// match MÁS LARGO para que /operaciones/registros no prenda también "Operaciones".
function activeHref(pathname: string, hrefs: string[]): string | null {
  const matches = hrefs.filter((h) => pathname === h || pathname.startsWith(h + "/"));
  if (matches.length === 0) return null;
  return matches.sort((a, b) => b.length - a.length)[0];
}

export function NavLinks({ rol }: { rol: Rol }) {
  const pathname = usePathname();
  const items = byRol[rol] ?? [];
  const active = activeHref(
    pathname,
    items.map((i) => i.href),
  );

  return (
    <nav className="flex items-center gap-5 text-sm">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className={
            it.href === active
              ? "border-b border-primary pb-1 text-primary transition-colors"
              : "border-b border-transparent pb-1 text-muted-foreground transition-colors hover:text-foreground"
          }
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
