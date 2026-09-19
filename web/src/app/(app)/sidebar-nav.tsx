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
    { href: "/cashflow", label: "Cashflow" },
    { href: "/operaciones/registros", label: "Registros" },
    { href: "/closer", label: "Llamadas" },
  ],
  closer: [
    { href: "/closer", label: "Llamadas" },
    { href: "/panel", label: "Panel" },
  ],
  setter: [{ href: "/setter", label: "Métricas" }],
};

function activeHref(pathname: string, hrefs: string[]): string | null {
  const matches = hrefs.filter((h) => pathname === h || pathname.startsWith(h + "/"));
  if (matches.length === 0) return null;
  return matches.sort((a, b) => b.length - a.length)[0];
}

export function SidebarNav({
  rol,
  horizontal,
  llamadasPendientes = 0,
}: {
  rol: Rol;
  horizontal?: boolean;
  /** Seguimientos pendientes — badge junto a "Llamadas" (admin/closer). */
  llamadasPendientes?: number;
}) {
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
        const badge = it.href === "/closer" && llamadasPendientes > 0 ? llamadasPendientes : null;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`flex items-center justify-between gap-2 whitespace-nowrap rounded-md px-3 py-2 transition-colors ${
              on
                ? "bg-[var(--neon-active)] text-primary"
                : "text-muted-foreground hover:bg-[var(--surface-elevated)] hover:text-foreground"
            }`}
          >
            <span>{it.label}</span>
            {badge != null && (
              <span className="rounded-full bg-danger/20 px-1.5 font-mono text-[11px] text-danger">
                {badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
