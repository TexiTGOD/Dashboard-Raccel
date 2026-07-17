"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateRole } from "./actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Profile } from "@/lib/types";

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "closer", label: "Closer" },
  { value: "setter", label: "Setter" },
];

export function EquipoRoster({
  miembros,
  currentUserId,
}: {
  miembros: Profile[];
  currentUserId: string;
}) {
  const [pending, start] = useTransition();
  const [savingId, setSavingId] = useState<string | null>(null);

  function cambiar(id: string, rol: string) {
    setSavingId(id);
    start(async () => {
      const res = await updateRole({ profileId: id, rol });
      setSavingId(null);
      if ("error" in res) toast.error(res.error);
      else toast.success("Rol actualizado");
    });
  }

  if (miembros.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin miembros.</p>;
  }

  return (
    <div className="space-y-2">
      {miembros.map((m) => {
        const esYo = m.id === currentUserId;
        return (
          <div
            key={m.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-5 py-3"
          >
            <div className="min-w-0">
              <div className="truncate text-sm text-foreground">{m.nombre ?? m.closer_identifier ?? "Sin nombre"}</div>
              <div className="truncate font-mono text-xs text-muted-foreground">
                {m.closer_identifier ?? m.id.slice(0, 8)}
                {!m.activo && " · inactivo"}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {esYo && <span className="micro-label">vos</span>}
              <Select
                value={m.rol}
                onValueChange={(v) => v && v !== m.rol && cambiar(m.id, v)}
                disabled={esYo || (pending && savingId === m.id)}
              >
                <SelectTrigger className="w-32 capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      })}
    </div>
  );
}
