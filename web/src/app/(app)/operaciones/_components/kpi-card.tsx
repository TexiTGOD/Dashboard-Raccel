import { Card, CardContent } from "@/components/ui/card";
import { MetricLabel } from "./metric-label";
import { fmtPct, fmtDec } from "@/lib/format";
import type { MetricDef } from "@/lib/metric-defs";

export function KpiCard({
  label,
  def,
  value,
  meta,
  fmt,
  ritmoUnit,
  isCurrent,
  daysLeft,
}: {
  label: string;
  def?: MetricDef;
  value: number;
  meta: number | null;
  fmt: (n: number) => string;
  ritmoUnit: string;
  isCurrent: boolean;
  daysLeft: number;
}) {
  const pct = meta && meta > 0 ? Math.min(value / meta, 1) : null;
  const falta = meta ? Math.max(meta - value, 0) : 0;
  const ritmo = meta && isCurrent && daysLeft > 0 && falta > 0 ? falta / daysLeft : null;

  return (
    <Card>
      <CardContent className="space-y-3 py-5">
        <MetricLabel label={label} def={def} />
        <div className="font-mono text-3xl leading-none text-foreground">{fmt(value)}</div>
        {meta != null ? (
          <div className="space-y-1.5">
            <div className="h-1 w-full bg-[var(--surface-elevated)]">
              <div className="h-1 bg-primary" style={{ width: `${(pct ?? 0) * 100}%` }} />
            </div>
            <div className="flex justify-between font-mono text-xs text-muted-foreground">
              <span>Meta {fmt(meta)}</span>
              <span>{fmtPct(pct)}</span>
            </div>
            {ritmo != null && (
              <div className="font-mono text-xs text-[var(--text-muted)]">
                Necesitás {fmtDec(ritmo)} {ritmoUnit}/día · quedan {daysLeft} días
              </div>
            )}
          </div>
        ) : (
          <div className="micro-label">Sin meta cargada</div>
        )}
      </CardContent>
    </Card>
  );
}
