"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { upsertMeta } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const METRICAS: { key: string; label: string }[] = [
  { key: "leads", label: "Leads" },
  { key: "tasa_agenda", label: "Tasa de agenda (0-1)" },
  { key: "agendas", label: "Agendas" },
  { key: "show_rate", label: "Show rate (0-1)" },
  { key: "close_rate", label: "Close rate (0-1)" },
  { key: "ventas", label: "Ventas" },
  { key: "aov", label: "AOV" },
  { key: "facturacion", label: "Facturación" },
  { key: "cash_collected", label: "Cash collected" },
];

export function MetasEditor({
  periodo,
  actuales,
}: {
  periodo: string; // YYYY-MM-01
  actuales: Record<string, number>;
}) {
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(METRICAS.map((m) => [m.key, actuales[m.key] != null ? String(actuales[m.key]) : ""])),
  );
  const [pending, start] = useTransition();

  function guardar() {
    start(async () => {
      let ok = 0;
      for (const m of METRICAS) {
        const raw = vals[m.key];
        if (raw === "" || raw == null) continue;
        const num = Number(raw);
        if (Number.isNaN(num)) continue;
        if (actuales[m.key] === num) continue; // sin cambios
        const res = await upsertMeta({ periodo, metrica: m.key, objetivo: num });
        if ("error" in res) {
          toast.error(`Error en ${m.label}: ${res.error}`);
          return;
        }
        ok++;
      }
      toast.success(ok > 0 ? `Metas actualizadas (${ok})` : "Sin cambios");
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {METRICAS.map((m) => (
          <div key={m.key} className="space-y-1.5">
            <label className="micro-label">{m.label}</label>
            <Input
              inputMode="decimal"
              className="font-mono"
              value={vals[m.key]}
              onChange={(e) => setVals((s) => ({ ...s, [m.key]: e.target.value }))}
              placeholder="—"
            />
          </div>
        ))}
      </div>
      <Button variant="outline" onClick={guardar} disabled={pending}>
        {pending ? "Guardando…" : "Guardar metas"}
      </Button>
    </div>
  );
}
