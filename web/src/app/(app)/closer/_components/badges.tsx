import { Badge } from "@/components/ui/badge";
import type { EstadoBooking, ResultadoCall } from "@/lib/types";

const estadoCls: Record<string, string> = {
  programada: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300",
  atendida: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300",
  no_show: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300",
  reprogramada: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950 dark:text-purple-300",
  cancelada: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-300",
};

const resultadoCls: Record<string, string> = {
  vendido: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300",
  perdido: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-300",
  follow_up: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300",
  pendiente: "bg-muted text-muted-foreground",
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
    <Badge variant="outline" className={estadoCls[estado] ?? ""}>
      {estado.replace("_", " ")}
    </Badge>
  );
}

export function ResultadoBadge({ resultado }: { resultado: ResultadoCall | null }) {
  if (!resultado) return null;
  return (
    <Badge variant="outline" className={resultadoCls[resultado] ?? ""}>
      {resultadoLabel[resultado] ?? resultado}
    </Badge>
  );
}
