import { Badge } from "@/components/ui/badge";
import type { EstadoBooking, ResultadoCall } from "@/lib/types";

// Badge del sistema: 1px borde semántico + texto semántico + fill transparente.
// Nunca sólido. El estado siempre lleva su palabra (nunca solo color).
const badgeBase =
  "rounded-full border bg-transparent px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em]";

const semantic: Record<string, string> = {
  success: "border-success text-success",
  warning: "border-warning text-warning",
  danger: "border-danger text-danger",
  info: "border-info text-info",
  neutral: "border-border text-muted-foreground",
};

const estadoColor: Record<string, keyof typeof semantic> = {
  programada: "info",
  atendida: "info",
  reprogramada: "warning",
  no_show: "danger",
  cancelada: "danger",
};

const resultadoColor: Record<string, keyof typeof semantic> = {
  vendido: "success",
  follow_up: "warning",
  perdido: "danger",
  pendiente: "neutral",
};

const resultadoLabel: Record<string, string> = {
  vendido: "Vendido",
  perdido: "Perdido",
  follow_up: "Follow up",
  pendiente: "Pendiente",
};

export function EstadoBadge({ estado }: { estado: EstadoBooking | null }) {
  if (!estado) return null;
  return (
    <Badge variant="outline" className={`${badgeBase} ${semantic[estadoColor[estado] ?? "neutral"]}`}>
      {estado.replace("_", " ")}
    </Badge>
  );
}

export function ResultadoBadge({ resultado }: { resultado: ResultadoCall | null }) {
  if (!resultado) return null;
  return (
    <Badge variant="outline" className={`${badgeBase} ${semantic[resultadoColor[resultado] ?? "neutral"]}`}>
      {resultadoLabel[resultado] ?? resultado}
    </Badge>
  );
}
