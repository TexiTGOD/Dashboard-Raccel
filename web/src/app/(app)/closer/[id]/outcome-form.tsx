"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckIcon, ChevronDownIcon, XIcon } from "lucide-react";
import { saveCallOutcome } from "../actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ESTADOS_BOOKING,
  RESULTADOS_CALL,
  type DolorPrincipal,
  type EstadoBooking,
  type Objecion,
  type ProductoOfrecido,
  type ResultadoCall,
} from "@/lib/types";
import { DOLOR_PRINCIPAL_OPTIONS, OBJECIONES_OPTIONS, objecionLabel, PRODUCTO_OFRECIDO_OPTIONS } from "@/lib/desenlace";

const resultadoLabel: Record<ResultadoCall, string> = {
  pendiente: "Pendiente",
  vendido: "Vendido",
  perdido: "Perdido",
  follow_up: "Follow up",
};

// El selector de calificado es tri-estado: "" = sin marcar (null en la base),
// distinto de "No". Se serializa a boolean|null al guardar.
// Fuente de etiquetas para el trigger cerrado de cada Select (prop `items`).
const ESTADO_OPTS = ESTADOS_BOOKING.map((s) => ({ value: s, label: s.replace("_", " ") }));
const RESULTADO_OPTS = RESULTADOS_CALL.map((r) => ({ value: r, label: resultadoLabel[r] }));

const CALIFICADO_OPTS = [
  { value: "sin", label: "Sin marcar" },
  { value: "si", label: "Sí" },
  { value: "no", label: "No" },
];
const aCalificado = (v: string): boolean | null => (v === "sin" ? null : v === "si");
const deCalificado = (b: boolean | null): string => (b == null ? "sin" : b ? "si" : "no");

// "" en el Select de producto/dolor = sin elegir (value null). SelectItem no
// admite value="", por eso se mapea a/desde un sentinel al entrar/salir.
const SIN_ELEGIR = "__sin_elegir__";

// Un bloque temático del formulario: título chico + separador arriba (menos el
// primero). Es lo que le da jerarquía visual a los 10 campos — de un vistazo se
// ve "esto va junto", en vez de una sola lista pareja de inputs.
function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 border-t border-border pt-5 first:border-t-0 first:pt-0">
      <div className="micro-label text-primary">{titulo}</div>
      {children}
    </div>
  );
}

export function OutcomeForm({
  bookingId,
  estado: e0,
  resultado: r0,
  notas: n0,
  calificado: c0,
  productoOfrecido: po0,
  precioOfrecido: pr0,
  dolorPrincipal: dp0,
  dolorExtra: de0,
  objeciones: ob0,
  objecionesExtra: oe0,
  proximoSeguimiento: ps0,
}: {
  bookingId: string;
  estado: EstadoBooking;
  resultado: ResultadoCall;
  notas: string;
  calificado: boolean | null;
  productoOfrecido: ProductoOfrecido | null;
  precioOfrecido: number | null;
  dolorPrincipal: DolorPrincipal | null;
  dolorExtra: string;
  objeciones: Objecion[];
  objecionesExtra: string;
  proximoSeguimiento: string | null;
}) {
  const [estado, setEstado] = useState<EstadoBooking>(e0);
  const [resultado, setResultado] = useState<ResultadoCall>(r0);
  const [notas, setNotas] = useState(n0);
  const [calificado, setCalificado] = useState(deCalificado(c0));
  const [productoOfrecido, setProductoOfrecido] = useState(po0 ?? "");
  const [precioOfrecido, setPrecioOfrecido] = useState(pr0 != null ? String(pr0) : "");
  const [dolorPrincipal, setDolorPrincipal] = useState(dp0 ?? "");
  const [dolorExtra, setDolorExtra] = useState(de0);
  const [objeciones, setObjeciones] = useState<Objecion[]>(ob0);
  const [objecionesExtra, setObjecionesExtra] = useState(oe0);
  const [proximoSeguimiento, setProximoSeguimiento] = useState(ps0 ?? "");
  const [pending, start] = useTransition();

  const esFollowUp = resultado === "follow_up";

  // Sin fechas fantasma: al salir de follow_up se limpia en el mismo evento que
  // cambia el resultado (no en un efecto aparte) para que la pantalla no
  // muestre una fecha vieja grisada que ya no se va a guardar.
  function cambiarResultado(r: ResultadoCall) {
    setResultado(r);
    if (r !== "follow_up") setProximoSeguimiento("");
  }

  function toggleObjecion(v: Objecion) {
    setObjeciones((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));
  }

  function save() {
    start(async () => {
      const res = await saveCallOutcome({
        bookingId,
        estado,
        resultado,
        notas,
        calificado: aCalificado(calificado),
        productoOfrecido: (productoOfrecido || null) as ProductoOfrecido | null,
        precioOfrecido: precioOfrecido === "" ? null : Number(precioOfrecido),
        dolorPrincipal: (dolorPrincipal || null) as DolorPrincipal | null,
        dolorExtra,
        objeciones,
        objecionesExtra,
        proximoSeguimiento: proximoSeguimiento || null,
      });
      if ("error" in res) toast.error("No se pudo guardar: " + res.error);
      else toast.success("Guardado");
    });
  }

  return (
    <div className="space-y-5">
      <Bloque titulo="Resultado">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Estado de la call</Label>
            {/* `items` es lo que usa SelectValue para resolver la etiqueta del trigger
                cerrado; sin él muestra el value crudo (ej. "no_show"). */}
            <Select items={ESTADO_OPTS} value={estado} onValueChange={(v) => setEstado(v as EstadoBooking)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ESTADOS_BOOKING.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Resultado</Label>
            <Select items={RESULTADO_OPTS} value={resultado} onValueChange={(v) => cambiarResultado(v as ResultadoCall)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESULTADOS_CALL.map((r) => (
                  <SelectItem key={r} value={r}>
                    {resultadoLabel[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Bloque>

      <Bloque titulo="Producto y precio">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Producto ofrecido</Label>
            <Select
              items={[{ value: SIN_ELEGIR, label: "Sin elegir" }, ...PRODUCTO_OFRECIDO_OPTIONS]}
              value={productoOfrecido || SIN_ELEGIR}
              onValueChange={(v) => setProductoOfrecido(v === SIN_ELEGIR ? "" : v ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_ELEGIR}>Sin elegir</SelectItem>
                {PRODUCTO_OFRECIDO_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="precio-ofrecido">Precio ofrecido</Label>
            <Input
              id="precio-ofrecido"
              type="number"
              inputMode="decimal"
              placeholder="1350"
              value={precioOfrecido}
              onChange={(e) => setPrecioOfrecido(e.target.value)}
            />
          </div>
        </div>
      </Bloque>

      <Bloque titulo="Diagnóstico">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Dolor principal + Otro dolor apilados: "otro" siempre queda pegado
              justo debajo de su campo principal, igual que Objeciones abajo. */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Dolor principal</Label>
              <Select
                items={[{ value: SIN_ELEGIR, label: "Sin elegir" }, ...DOLOR_PRINCIPAL_OPTIONS]}
                value={dolorPrincipal || SIN_ELEGIR}
                onValueChange={(v) => setDolorPrincipal(v === SIN_ELEGIR ? "" : v ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_ELEGIR}>Sin elegir</SelectItem>
                  {DOLOR_PRINCIPAL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-[var(--text-muted)]">
                Tu criterio, distinto de la calificación de dolor de ManyChat.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dolor-extra">Otro dolor</Label>
              <Input
                id="dolor-extra"
                placeholder="Si no entra en las opciones de arriba…"
                value={dolorExtra}
                onChange={(e) => setDolorExtra(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>¿Calificado?</Label>
            <Select items={CALIFICADO_OPTS} value={calificado} onValueChange={(v) => setCalificado(v ?? "sin")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CALIFICADO_OPTS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-[var(--text-muted)]">
              Tu criterio después de la llamada. Independiente de lo que haya respondido en Calendly.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Objeciones</Label>
          {/* Popover (base-ui, ya usado en el proyecto vía shadcn) + lista de
              toggles — no Command/cmdk: son 5 opciones fijas, no hace falta
              buscador y así no se suma una dependencia nueva. Con el popover
              cerrado, las elegidas se ven como tags con su "x" en el trigger. */}
          <Popover>
            <PopoverTrigger
              render={<div />}
              nativeButton={false}
              className="flex min-h-10 w-full cursor-pointer flex-wrap items-center gap-1.5 rounded-md border border-input bg-[var(--surface-elevated)] px-3 py-2 text-sm outline-none transition-colors duration-150 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {objeciones.length === 0 ? (
                <span className="text-[var(--text-muted)]">Sin elegir</span>
              ) : (
                objeciones.map((v) => (
                  <Badge key={v} variant="secondary" className="gap-1 pr-1">
                    {objecionLabel(v)}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleObjecion(v);
                      }}
                      aria-label={`Sacar ${objecionLabel(v)}`}
                      className="rounded-full hover:bg-foreground/15"
                    >
                      <XIcon className="size-3" />
                    </button>
                  </Badge>
                ))
              )}
              <ChevronDownIcon className="ml-auto size-4 shrink-0 text-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-(--anchor-width) min-w-56 p-1.5">
              {OBJECIONES_OPTIONS.map((o) => {
                const checked = objeciones.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggleObjecion(o.value)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    <span
                      className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                        checked ? "border-primary bg-primary text-primary-foreground" : "border-input"
                      }`}
                    >
                      {checked && <CheckIcon className="size-3" />}
                    </span>
                    {o.label}
                  </button>
                );
              })}
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="objeciones-extra">Otras objeciones</Label>
          <Input
            id="objeciones-extra"
            placeholder="Si no están en la lista de arriba…"
            value={objecionesExtra}
            onChange={(e) => setObjecionesExtra(e.target.value)}
          />
        </div>
      </Bloque>

      <Bloque titulo="Seguimiento">
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="proximo-seguimiento">Próximo seguimiento</Label>
          <Input
            id="proximo-seguimiento"
            type="date"
            disabled={!esFollowUp}
            value={proximoSeguimiento}
            onChange={(e) => setProximoSeguimiento(e.target.value)}
          />
          <p className="text-[11px] text-[var(--text-muted)]">
            {esFollowUp ? "Se guarda con el desenlace." : 'Solo aplica con resultado "Follow up".'}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notas">Notas</Label>
          <Textarea
            id="notas"
            rows={4}
            placeholder="Contexto, qué pasó…"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
          />
        </div>
      </Bloque>

      <div className="flex justify-end border-t border-border pt-4">
        <Button onClick={save} disabled={pending}>
          {pending ? "Guardando…" : "Guardar desenlace"}
        </Button>
      </div>
    </div>
  );
}
