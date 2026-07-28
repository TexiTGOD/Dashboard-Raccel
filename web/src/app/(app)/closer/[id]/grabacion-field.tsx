"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { guardarGrabacionUrl } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// href seguro: si el link viene sin protocolo (ej. "zoom.us/…"), prependemos
// https:// para que el <a> abra bien en vez de tratarlo como ruta relativa.
function toHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

// Campo manual del link de la grabación (provisorio, hasta Fathom). Si hay link
// guardado se muestra clickeable (pestaña nueva); siempre editable con placeholder.
export function GrabacionField({ bookingId, url: url0 }: { bookingId: string; url: string | null }) {
  const saved = (url0 ?? "").trim();
  const [url, setUrl] = useState(url0 ?? "");
  const [pending, start] = useTransition();
  const dirty = url.trim() !== saved;

  function save() {
    if (!dirty) return;
    start(async () => {
      const res = await guardarGrabacionUrl({ bookingId, url });
      if ("error" in res) toast.error("No se pudo guardar: " + res.error);
      else toast.success("Link guardado");
    });
  }

  return (
    <div className="space-y-1.5">
      <div className="micro-label">Grabación</div>
      {saved && (
        <a
          href={toHref(saved)}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate font-mono text-sm text-primary underline decoration-dotted underline-offset-2 hover:text-primary/80"
        >
          {saved}
        </a>
      )}
      <div className="flex gap-2">
        <Input
          type="url"
          inputMode="url"
          placeholder="Pegá el link de la grabación"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
        />
        <Button onClick={save} disabled={pending || !dirty} variant="secondary">
          {pending ? "…" : "Guardar"}
        </Button>
      </div>
    </div>
  );
}
