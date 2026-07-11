"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/closer", label: "Llamadas" },
  { href: "/closer/ventas-sin-matchear", label: "Ventas s/ matchear" },
];

export function NavLinks() {
  const pathname = usePathname();
  const isVentas = pathname.startsWith("/closer/ventas-sin-matchear");

  return (
    <nav className="flex items-center gap-5 text-sm">
      {items.map((it) => {
        const active =
          it.href === "/closer" ? pathname.startsWith("/closer") && !isVentas : isVentas;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={
              active
                ? "border-b border-primary pb-1 text-primary transition-colors"
                : "border-b border-transparent pb-1 text-muted-foreground transition-colors hover:text-foreground"
            }
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
