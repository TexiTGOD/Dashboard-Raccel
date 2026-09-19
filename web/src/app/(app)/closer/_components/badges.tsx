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

function fmtSeguimiento(iso: string): string {
  // Fecha pura (sin hora) — no pasar por Date/timezone del browser: se
  // formatea el string YYYY-MM-DD directo, siempre igual sin importar dónde
  // corra el navegador.
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

// Compartido entre la Lista y el Pipeline (misma fecha, mismo criterio de
// vencido — calculado en SQL con hoy_argentina(), nunca en el cliente).
// La fecha NUNCA hace wrap (whitespace-nowrap); si está vencida, va en rojo
// arriba y "Vencido" como badge aparte debajo — nunca los dos adentro de un
// mismo pill (eso era lo que se cortaba feo).
export function SeguimientoBadge({ fecha, vencido }: { fecha: string | null; vencido: boolean }) {
  if (!fecha) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col items-start gap-1">
      <span className={`whitespace-nowrap font-mono text-xs ${vencido ? "text-danger" : "text-foreground"}`}>
        {fmtSeguimiento(fecha)}
      </span>
      {vencido && (
        <span className="whitespace-nowrap rounded-full border border-danger px-2 py-0.5 font-mono text-[10px] text-danger">
          Vencido
        </span>
      )}
    </div>
  );
}
