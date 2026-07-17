"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { guardarMetas, getTasasHistoricas } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtInt, fmtMonto, fmtPct, fmtDec } from "@/lib/format";
import type { TasasHistoricas } from "@/lib/dashboard";

// La cascada corre hacia atrás desde el cash. Un solo eslabón de plata (AOV cash):
//   ventas    = cash / AOV cash   (AOV cash = plata real que entra por venta)
//   atendidas = ventas / close
//   agendas   = atendidas / show
//   leads     = agendas / tasa_agenda
// Cada eslabón: count = upstream / rate. Si se pinea el count, se deriva el rate.
type LinkKey = "aov" | "close" | "show" | "agenda";
interface LinkMeta {
  key: LinkKey;
  rateLabel: string;
  countLabel: string;
  isRatio: boolean; // rate debe estar en (0,1]
  rateMoney?: boolean; // aov cash es monto, no %
  countMoney?: boolean;
  histKey: keyof TasasHistoricas;
  saveRate?: string; // metrica del rate
  saveCount?: string; // metrica del count
}

const LINKS: LinkMeta[] = [
  { key: "aov", rateLabel: "AOV cash (plata real / venta)", countLabel: "Ventas", isRatio: false, rateMoney: true, histKey: "aov_cash", saveRate: "aov", saveCount: "ventas" },
  { key: "close", rateLabel: "Close rate", countLabel: "Atendidas", isRatio: true, histKey: "close_rate", saveRate: "close_rate" },
  { key: "show", rateLabel: "Show rate", countLabel: "Agendas", isRatio: true, histKey: "show_rate", saveRate: "show_rate", saveCount: "agendas" },
  { key: "agenda", rateLabel: "Tasa de agenda", countLabel: "Leads", isRatio: true, histKey: "tasa_agenda", saveRate: "tasa_agenda", saveCount: "leads" },
];

const VENTANAS = [30, 60, 90] as const;

type LinkState = { rate: string; count: string; pinned: boolean };

function fmtRate(v: number, money?: boolean) {
  if (!isFinite(v)) return "—";
  return money ? fmtMonto(v, "USD") : fmtPct(v);
}
function fmtCount(v: number, money?: boolean) {
  if (!isFinite(v)) return "—";
  return money ? fmtMonto(v, "USD") : fmtInt(Math.round(v));
}

export function MetasCascade({
  periodo,
  historico,
  actuales,
  leadsActual,
  daysLeft,
  isCurrent,
}: {
  periodo: string;
  historico: TasasHistoricas;
  actuales: Record<string, number>;
  leadsActual: number;
  daysLeft: number;
  isCurrent: boolean;
}) {
  const [cash, setCash] = useState(actuales.cash_collected != null ? String(actuales.cash_collected) : "");
  const [dias, setDias] = useState<number>(90);
  const [hist, setHist] = useState<TasasHistoricas>(historico);
  // Precio del programa (neto/venta): supuesto editable, prellenado del histórico.
  // Facturación meta = ventas × precio (no es un eslabón de la cascada de leads).
  const [precio, setPrecio] = useState(
    actuales.precio != null ? String(actuales.precio) : historico.precio_prom != null ? String(historico.precio_prom) : "",
  );
  const [links, setLinks] = useState<Record<LinkKey, LinkState>>(() => {
    const init = (l: LinkMeta): LinkState => {
      const saved = l.saveRate ? actuales[l.saveRate] : undefined;
      const h = historico[l.histKey];
      const rate = saved != null ? saved : h;
      return { rate: rate != null ? String(rate) : "", count: "", pinned: false };
    };
    return Object.fromEntries(LINKS.map((l) => [l.key, init(l)])) as Record<LinkKey, LinkState>;
  });
  const [pending, start] = useTransition();
  const [pendingHist, startHist] = useTransition();

  // Cambiar la ventana recalcula el histórico en la base y reprellena los
  // supuestos NO fijados (los pineados a mano se respetan).
  function aplicarVentana(nd: number) {
    setDias(nd);
    startHist(async () => {
      const t = await getTasasHistoricas(nd);
      setHist(t);
      if (t.precio_prom != null) setPrecio(String(t.precio_prom));
      setLinks((s) => {
        const next = { ...s };
        for (const L of LINKS) {
          if (!next[L.key].pinned) {
            const h = t[L.histKey];
            next[L.key] = { ...next[L.key], rate: h != null ? String(h) : "" };
          }
        }
        return next;
      });
    });
  }

  const casc = useMemo(() => {
    const rows: { L: LinkMeta; rate: number; count: number; bad: boolean }[] = [];
    let upstream = Number(cash);
    for (const L of LINKS) {
      const st = links[L.key];
      let rate: number, count: number;
      if (st.pinned) {
        count = Number(st.count);
        rate = count > 0 ? upstream / count : NaN;
      } else {
        rate = Number(st.rate);
        count = rate > 0 ? upstream / rate : NaN;
      }
      const bad = !isFinite(count) || !isFinite(rate) || rate <= 0 || (L.isRatio && rate > 1);
      upstream = count;
      rows.push({ L, rate, count, bad });
    }
    const impossible = rows.some((r) => r.bad) || !(Number(cash) > 0);
    return { rows, leads: upstream, impossible };
  }, [cash, links]);

  // Ventas de la meta (count del eslabón AOV) → facturación = ventas × precio.
  const ventasMeta = casc.rows.find((r) => r.L.key === "aov")?.count ?? NaN;
  const precioNum = Number(precio);
  const facturacionMeta = isFinite(ventasMeta) && precioNum > 0 ? ventasMeta * precioNum : NaN;

  function togglePin(L: LinkMeta, derivedCount: number) {
    setLinks((s) => {
      const cur = s[L.key];
      const nextPinned = !cur.pinned;
      return {
        ...s,
        [L.key]: {
          ...cur,
          pinned: nextPinned,
          // al pinear, sembrar el count con el derivado actual
          count: nextPinned && isFinite(derivedCount) ? String(Math.round(derivedCount)) : cur.count,
        },
      };
    });
  }

  function guardar() {
    if (casc.impossible) {
      toast.error("La meta es imposible o incompleta. Ajustá lo marcado en rojo.");
      return;
    }
    const values: Record<string, number> = { cash_collected: Number(cash) };
    casc.rows.forEach(({ L, rate, count }) => {
      if (L.saveRate && isFinite(rate)) values[L.saveRate] = Number(rate.toFixed(4));
      if (L.saveCount && isFinite(count)) values[L.saveCount] = Math.round(count);
    });
    // Precio del programa + facturación derivada (ventas × precio).
    if (precioNum > 0) values.precio = precioNum;
    if (isFinite(facturacionMeta)) values.facturacion = Math.round(facturacionMeta);
    start(async () => {
      const res = await guardarMetas({ periodo, values });
      if ("error" in res) toast.error("No se pudo guardar: " + res.error);
      else toast.success("Metas guardadas");
    });
  }

  const leadsNecesarios = casc.leads;
  const leadsPorDia = isCurrent && daysLeft > 0 && isFinite(leadsNecesarios) ? leadsNecesarios / daysLeft : null;

  return (
    <div className="space-y-5">
      {/* Ancla */}
      <div className="max-w-xs space-y-1.5">
        <label className="micro-label">Meta de Cash Collected (ancla)</label>
        <Input inputMode="decimal" className="font-mono" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="6000" />
      </div>

      {/* Ventana del histórico para prellenar los supuestos */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="micro-label">Histórico para prellenar</span>
        <div className="flex gap-1">
          {VENTANAS.map((d) => (
            <Button
              key={d}
              size="sm"
              variant={d === dias ? "secondary" : "ghost"}
              disabled={pendingHist}
              onClick={() => aplicarVentana(d)}
            >
              {d}d
            </Button>
          ))}
        </div>
        {pendingHist && <span className="font-mono text-[11px] text-[var(--text-muted)]">recalculando…</span>}
      </div>

      {/* Precio del programa — supuesto de plata para la facturación (no afecta la cascada de leads) */}
      <div className="max-w-xs space-y-1.5">
        <label className="micro-label">Precio del programa (neto / venta)</label>
        <Input inputMode="decimal" className="font-mono" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="1350" />
        <div className="font-mono text-[11px] text-[var(--text-muted)]">
          histórico {dias}d: {hist.precio_prom == null ? "sin datos" : fmtMonto(hist.precio_prom, "USD")}
        </div>
      </div>

      {/* Cascada */}
      <div className="rounded-md border border-border">
        {casc.rows.map(({ L, rate, count, bad }) => {
          const st = links[L.key];
          const h = hist[L.histKey];
          return (
            <div
              key={L.key}
              className={`grid grid-cols-1 gap-3 border-b border-border p-4 last:border-0 sm:grid-cols-[1.2fr_auto_1fr] sm:items-center ${bad ? "bg-danger/5" : ""}`}
            >
              {/* Rate */}
              <div className="space-y-1">
                <div className="micro-label">{L.rateLabel}</div>
                {st.pinned ? (
                  <div className={`font-mono text-sm ${bad ? "text-danger" : "text-muted-foreground"}`}>{fmtRate(rate, L.rateMoney)} (derivado)</div>
                ) : (
                  <Input
                    inputMode="decimal"
                    className="h-8 max-w-[8rem] font-mono"
                    value={st.rate}
                    onChange={(e) => setLinks((s) => ({ ...s, [L.key]: { ...s[L.key], rate: e.target.value } }))}
                  />
                )}
                <div className="font-mono text-[11px] text-[var(--text-muted)]">
                  histórico {dias}d: {h == null ? "sin datos" : fmtRate(h, L.rateMoney)}
                </div>
              </div>

              {/* Candado */}
              <div className="flex sm:justify-center">
                <Button variant={st.pinned ? "outline" : "ghost"} size="sm" onClick={() => togglePin(L, count)}>
                  {st.pinned ? "🔒 fijado" : "🔓 fijar"}
                </Button>
              </div>

              {/* Count */}
              <div className="space-y-1">
                <div className="micro-label">{L.countLabel}</div>
                {st.pinned ? (
                  <Input
                    inputMode="decimal"
                    className="h-8 max-w-[8rem] font-mono"
                    value={st.count}
                    onChange={(e) => setLinks((s) => ({ ...s, [L.key]: { ...s[L.key], count: e.target.value } }))}
                  />
                ) : (
                  <div className="font-mono text-sm text-foreground">{fmtCount(count, L.countMoney)}</div>
                )}
                {bad && <div className="font-mono text-[11px] text-danger">imposible — soltá un candado</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Output */}
      <div className="rounded-md border border-border bg-[var(--neon-wash)] p-4">
        {casc.impossible ? (
          <p className="font-mono text-sm text-danger">Meta incompleta o imposible. Ajustá lo marcado.</p>
        ) : (
          <div className="space-y-1 font-mono text-sm text-foreground">
            <p>
              Para cobrar {fmtMonto(Number(cash), "USD")} necesitás{" "}
              <span className="text-primary">{fmtInt(Math.round(leadsNecesarios))} leads</span>. Vas {fmtInt(leadsActual)}.
              {leadsPorDia != null && <> Quedan {daysLeft} días → {fmtDec(leadsPorDia)} leads/día.</>}
            </p>
            {isFinite(facturacionMeta) && (
              <p className="text-muted-foreground">
                Facturación meta: <span className="text-foreground">{fmtMonto(facturacionMeta, "USD")}</span>{" "}
                ({fmtInt(Math.round(ventasMeta))} ventas × {fmtMonto(precioNum, "USD")}).
              </p>
            )}
          </div>
        )}
      </div>

      <Button onClick={guardar} disabled={pending || casc.impossible}>
        {pending ? "Guardando…" : "Guardar metas"}
      </Button>
    </div>
  );
}
