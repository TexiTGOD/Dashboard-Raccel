"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { guardarMetas } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtInt, fmtMonto, fmtPct, fmtDec } from "@/lib/format";
import type { TasasHistoricas } from "@/lib/dashboard";

// La cascada corre hacia atrás desde el cash:
//   facturación = cash / %cobrado
//   ventas      = facturación / AOV
//   atendidas   = ventas / close
//   agendas     = atendidas / show
//   leads       = agendas / tasa_agenda
// Cada eslabón: count = upstream / rate. Si se pinea el count, se deriva el rate.
type LinkKey = "cobrado" | "aov" | "close" | "show" | "agenda";
interface LinkMeta {
  key: LinkKey;
  rateLabel: string;
  countLabel: string;
  isRatio: boolean; // rate debe estar en (0,1]
  rateMoney?: boolean; // aov es monto, no %
  countMoney?: boolean; // facturación es monto
  histKey: keyof TasasHistoricas;
  saveRate?: string; // metrica del rate
  saveCount?: string; // metrica del count
}

const LINKS: LinkMeta[] = [
  { key: "cobrado", rateLabel: "% cobrado al cierre", countLabel: "Facturación", isRatio: true, countMoney: true, histKey: "pct_cobrado", saveCount: "facturacion" },
  { key: "aov", rateLabel: "AOV (ticket)", countLabel: "Ventas", isRatio: false, rateMoney: true, histKey: "aov", saveRate: "aov", saveCount: "ventas" },
  { key: "close", rateLabel: "Close rate", countLabel: "Atendidas", isRatio: true, histKey: "close_rate", saveRate: "close_rate" },
  { key: "show", rateLabel: "Show rate", countLabel: "Agendas", isRatio: true, histKey: "show_rate", saveRate: "show_rate", saveCount: "agendas" },
  { key: "agenda", rateLabel: "Tasa de agenda", countLabel: "Leads", isRatio: true, histKey: "tasa_agenda", saveRate: "tasa_agenda", saveCount: "leads" },
];

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
  cashActual,
  leadsActual,
  daysLeft,
  isCurrent,
}: {
  periodo: string;
  historico: TasasHistoricas;
  actuales: Record<string, number>;
  cashActual: number;
  leadsActual: number;
  daysLeft: number;
  isCurrent: boolean;
}) {
  const [cash, setCash] = useState(actuales.cash_collected != null ? String(actuales.cash_collected) : "");
  const [links, setLinks] = useState<Record<LinkKey, LinkState>>(() => {
    const init = (l: LinkMeta): LinkState => {
      const saved = l.saveRate ? actuales[l.saveRate] : undefined;
      const hist = historico[l.histKey];
      const rate = saved != null ? saved : hist;
      return { rate: rate != null ? String(rate) : "", count: "", pinned: false };
    };
    return Object.fromEntries(LINKS.map((l) => [l.key, init(l)])) as Record<LinkKey, LinkState>;
  });
  const [pending, start] = useTransition();

  const casc = useMemo(() => {
    let upstream = Number(cash);
    const rows = LINKS.map((L) => {
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
      return { L, rate, count, bad };
    });
    const impossible = rows.some((r) => r.bad) || !(Number(cash) > 0);
    return { rows, leads: upstream, impossible };
  }, [cash, links]);

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

      {/* Cascada */}
      <div className="rounded-md border border-border">
        {casc.rows.map(({ L, rate, count, bad }) => {
          const st = links[L.key];
          const hist = historico[L.histKey];
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
                  histórico 90d: {hist == null ? "sin datos" : fmtRate(hist, L.rateMoney)}
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
          <p className="font-mono text-sm text-foreground">
            Para cobrar {fmtMonto(Number(cash), "USD")} necesitás{" "}
            <span className="text-primary">{fmtInt(Math.round(leadsNecesarios))} leads</span>. Vas {fmtInt(leadsActual)}.
            {leadsPorDia != null && <> Quedan {daysLeft} días → {fmtDec(leadsPorDia)} leads/día.</>}
          </p>
        )}
      </div>

      <Button onClick={guardar} disabled={pending || casc.impossible}>
        {pending ? "Guardando…" : "Guardar metas"}
      </Button>
    </div>
  );
}
