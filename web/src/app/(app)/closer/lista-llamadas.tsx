"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { fmtFecha, fmtInt, fmtMonto } from "@/lib/format";
import { RESULTADOS_CALL, type LlamadaListaRow, type ResultadoCall, type VistaLlamadas } from "@/lib/types";
import { CLOSER_OPTIONS, closerLabel } from "@/lib/closers";
import { OBJECIONES_OPTIONS, objecionLabel, PRODUCTO_OFRECIDO_OPTIONS, productoOfrecidoLabel } from "@/lib/desenlace";
import { SeguimientoBadge } from "./_components/badges";

const resultadoLabel: Record<ResultadoCall, string> = {
  pendiente: "Pendiente",
  vendido: "Vendido",
  perdido: "Perdido",
  follow_up: "Follow up",
};

const VISTAS: { key: VistaLlamadas; label: string }[] = [
  { key: "seguimientos", label: "Seguimientos pendientes" },
  { key: "sin_desenlace", label: "Sin desenlace" },
  { key: "venta_sin_registrar", label: "Venta sin registrar" },
  { key: "todas", label: "Todas" },
];

function EstadoResultado({ r }: { r: LlamadaListaRow }) {
  return (
    <div className="space-y-0.5">
      <div className="text-sm capitalize text-foreground">{r.estado?.replace("_", " ") ?? "—"}</div>
      <div className="font-mono text-xs text-muted-foreground">
        {r.resultado ? resultadoLabel[r.resultado] : "—"}
      </div>
    </div>
  );
}

function Objeciones({ objeciones }: { objeciones: string[] | null }) {
  if (!objeciones || objeciones.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {objeciones.map((o) => (
        <Badge key={o} variant="secondary">
          {objecionLabel(o)}
        </Badge>
      ))}
    </div>
  );
}

export function ListaLlamadas({
  rows,
  chips,
  isAdmin,
  vista,
  resultado,
  producto,
  objecion,
  closerFiltro,
}: {
  rows: LlamadaListaRow[];
  chips: { seguimientos_pendientes: number; sin_desenlace: number; venta_sin_registrar: number };
  isAdmin: boolean;
  vista: VistaLlamadas;
  resultado: string;
  producto: string;
  objecion: string;
  closerFiltro: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Cambiar de acceso rápido limpia los filtros de CONTENIDO (resultado,
  // producto, objeción): si quedaban de "Todas" y no matcheaban nada en
  // "Sin desenlace", el chip decía uno y la tabla decía "sin llamadas" — muy
  // confuso. El filtro de closer (admin) es de IDENTIDAD, no de contenido:
  // ese sí tiene sentido que persista entre pestañas.
  function hrefVista(v: VistaLlamadas): string {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("resultado");
    params.delete("producto");
    params.delete("objecion");
    params.set("vista", v);
    return `${pathname}?${params.toString()}`;
  }

  function setFiltro(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  const countDe = (v: VistaLlamadas) =>
    v === "seguimientos"
      ? chips.seguimientos_pendientes
      : v === "sin_desenlace"
        ? chips.sin_desenlace
        : v === "venta_sin_registrar"
          ? chips.venta_sin_registrar
          : null;

  const inputCls =
    "rounded border border-input bg-[var(--surface-elevated)] px-2 py-1.5 font-mono text-xs text-foreground outline-none focus:border-primary";

  // Qué filtros de contenido tienen sentido en cada acceso rápido:
  // - "Sin desenlace" / "Venta sin registrar": ninguno — nada de eso se
  //   completó todavía (o ya se sabe que es "vendido"), no hay nada que
  //   filtrar por producto/objeción/resultado.
  // - "Seguimientos pendientes": ya fija resultado=follow_up (el selector de
  //   Resultado sobra) y no tiene producto, pero sí objeción (la razón del
  //   follow up).
  // - "Todas": los 4 filtros, más el rango de fechas (period picker de arriba).
  const mostrarResultado = vista === "todas";
  const mostrarProducto = vista === "todas";
  const mostrarObjecion = vista === "todas" || vista === "seguimientos";

  return (
    <div className="space-y-4">
      {/* Accesos rápidos */}
      <div className="flex flex-wrap gap-2">
        {VISTAS.map((v) => {
          const activo = vista === v.key;
          const count = countDe(v.key);
          return (
            <Link
              key={v.key}
              href={hrefVista(v.key)}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                activo
                  ? "border-primary bg-[var(--neon-active)] text-primary"
                  : "border-border text-muted-foreground hover:bg-[var(--surface-elevated)]"
              }`}
            >
              {v.label}
              {count != null && (
                <span
                  className={`rounded-full px-1.5 font-mono text-xs ${
                    activo ? "bg-primary/20" : "bg-[var(--surface-elevated)]"
                  }`}
                >
                  {fmtInt(count)}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Filtros: solo se muestran los que tienen sentido en cada acceso. El
          rango de fechas (period picker de arriba) solo aplica en "Todas". */}
      <div className="flex flex-wrap items-center gap-2">
        {mostrarResultado && (
          <select
            value={resultado}
            onChange={(e) => setFiltro("resultado", e.target.value)}
            className={inputCls}
          >
            <option value="">Resultado (todos)</option>
            {RESULTADOS_CALL.map((r) => (
              <option key={r} value={r}>
                {resultadoLabel[r]}
              </option>
            ))}
          </select>
        )}
        {mostrarProducto && (
          <select value={producto} onChange={(e) => setFiltro("producto", e.target.value)} className={inputCls}>
            <option value="">Producto (todos)</option>
            {PRODUCTO_OFRECIDO_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        {mostrarObjecion && (
          <select value={objecion} onChange={(e) => setFiltro("objecion", e.target.value)} className={inputCls}>
            <option value="">Objeción (todas)</option>
            {OBJECIONES_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        {isAdmin && (
          <select
            value={closerFiltro}
            onChange={(e) => setFiltro("closer", e.target.value)}
            className={inputCls}
          >
            <option value="">Closer (todos)</option>
            {CLOSER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">Sin llamadas para este filtro.</p>
      ) : (
        <>
          {/* Desktop: tabla. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="micro-label px-2 py-2">Fecha</th>
                  <th className="micro-label px-2 py-2">Lead</th>
                  {isAdmin && <th className="micro-label px-2 py-2">Closer</th>}
                  <th className="micro-label px-2 py-2">Estado / resultado</th>
                  <th className="micro-label px-2 py-2">Producto</th>
                  <th className="micro-label px-2 py-2 text-right">Precio</th>
                  <th className="micro-label px-2 py-2">Objeciones</th>
                  <th className="micro-label px-2 py-2">Seguimiento</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.booking_id}
                    onClick={() => router.push(`/closer/${r.booking_id}`)}
                    className="cursor-pointer border-b border-border hover:bg-[var(--surface-elevated)]"
                  >
                    <td className="px-2 py-3 font-mono text-xs text-muted-foreground">{fmtFecha(r.fecha)}</td>
                    <td className="px-2 py-3 text-foreground">{r.lead_nombre ?? "Sin nombre"}</td>
                    {isAdmin && (
                      <td className="px-2 py-3 font-mono text-xs text-muted-foreground">{closerLabel(r.closer)}</td>
                    )}
                    <td className="px-2 py-3">
                      <EstadoResultado r={r} />
                    </td>
                    <td className="px-2 py-3 text-xs text-muted-foreground">
                      {productoOfrecidoLabel(r.producto_ofrecido)}
                    </td>
                    <td className="px-2 py-3 text-right font-mono text-xs text-muted-foreground">
                      {r.precio_ofrecido != null ? fmtMonto(r.precio_ofrecido, "USD") : "—"}
                    </td>
                    <td className="px-2 py-3">
                      <Objeciones objeciones={r.objeciones} />
                    </td>
                    <td className="px-2 py-3">
                      <SeguimientoBadge fecha={r.proximo_seguimiento} vencido={r.es_vencido} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards apiladas (mismo patrón visual que el Pipeline). */}
          <div className="space-y-3 md:hidden">
            {rows.map((r) => (
              <Link
                key={r.booking_id}
                href={`/closer/${r.booking_id}`}
                className="block rounded-lg border border-border bg-card p-4 hover:bg-[var(--surface-elevated)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {r.lead_nombre ?? "Sin nombre"}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {fmtFecha(r.fecha)}
                      {isAdmin && r.closer ? ` · ${closerLabel(r.closer)}` : ""}
                    </div>
                  </div>
                  <SeguimientoBadge fecha={r.proximo_seguimiento} vencido={r.es_vencido} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="capitalize text-foreground">{r.estado?.replace("_", " ") ?? "—"}</span>
                  <span className="text-muted-foreground">
                    {r.resultado ? resultadoLabel[r.resultado] : "—"}
                  </span>
                  {r.producto_ofrecido && (
                    <span className="text-muted-foreground">· {productoOfrecidoLabel(r.producto_ofrecido)}</span>
                  )}
                  {r.precio_ofrecido != null && (
                    <span className="text-muted-foreground">· {fmtMonto(r.precio_ofrecido, "USD")}</span>
                  )}
                </div>
                {r.objeciones && r.objeciones.length > 0 && (
                  <div className="mt-2">
                    <Objeciones objeciones={r.objeciones} />
                  </div>
                )}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
