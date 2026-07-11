"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { linkSale } from "../actions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ReconcileForm({
  saleId,
  options,
}: {
  saleId: string;
  options: { value: string; label: string }[];
}) {
  const [bookingId, setBookingId] = useState<string>("");
  const [pending, start] = useTransition();

  function submit() {
    if (!bookingId) {
      toast.error("Elegí una llamada.");
      return;
    }
    start(async () => {
      const res = await linkSale({ saleId, bookingId });
      if ("error" in res) toast.error("No se pudo vincular: " + res.error);
      else toast.success("Venta vinculada");
    });
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Select value={bookingId} onValueChange={(v) => setBookingId(v ?? "")}>
        <SelectTrigger className="w-full sm:flex-1">
          <SelectValue placeholder="Vincular a una llamada…" />
        </SelectTrigger>
        <SelectContent>
          {options.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">No tenés llamadas.</div>
          ) : (
            options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      <Button variant="outline" onClick={submit} disabled={pending}>
        {pending ? "Vinculando…" : "Vincular"}
      </Button>
    </div>
  );
}
