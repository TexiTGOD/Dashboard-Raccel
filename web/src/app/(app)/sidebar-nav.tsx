"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Rol } from "@/lib/types";

const byRol: Record<Rol, { href: string; label: string }[]> = {
  admin: [
    { href: "/hoy", label: "Hoy" },
    { href: "/operaciones", label: "Operaciones" },
    { href: "/atribucion", label: "Atribución" },
    { href: "/segmentos", label: "Segmentos" },
    { href: "/equipo", label: "Equipo" },
    { href: "/cobranzas", label: "Cobranzas" },
    { href: "/metas", label: "Metas" },
    { href: "/plata-neta", label: "Plata neta" },
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

function activeHref(pathname: string, hrefs: string[]): string | null {
  const matches = hrefs.filter((h) => pathname === h || pathname.startsWith(h + "/"));
  if (matches.length === 0) return null;
  return matches.sort((a, b) => b.length - a.length)[0];
}

export function SidebarNav({ rol, horizontal }: { rol: Rol; horizontal?: boolean }) {
  const pathname = usePathname();
  const items = byRol[rol] ?? [];
  const active = activeHref(pathname, items.map((i) => i.href));

  return (
    <nav
      className={
        horizontal
          ? "flex gap-1 overflow-x-auto text-sm"
          : "flex flex-col gap-0.5 text-sm"
      }
    >
      {items.map((it) => {
        const on = it.href === active;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`whitespace-nowrap rounded-md px-3 py-2 transition-colors ${
              on
                ? "bg-[var(--neon-active)] text-primary"
                : "text-muted-foreground hover:bg-[var(--surface-elevated)] hover:text-foreground"
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
