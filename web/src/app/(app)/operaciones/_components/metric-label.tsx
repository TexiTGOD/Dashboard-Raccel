import type { MetricDef } from "@/lib/metric-defs";

// Micro-label con tooltip on hover (definición + fórmula). Puro CSS, sin JS.
export function MetricLabel({ label, def }: { label: string; def?: MetricDef }) {
  if (!def) return <span className="micro-label">{label}</span>;
  return (
    <span className="group/tt relative inline-flex cursor-help items-center">
      <span className="micro-label border-b border-dotted border-[var(--text-muted)]">{label}</span>
      <span className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 hidden w-64 rounded-md border border-border bg-popover p-3 text-left normal-case group-hover/tt:block">
        <span className="block text-xs leading-snug text-foreground">{def.definicion}</span>
        <span className="mt-2 block font-mono text-[11px] leading-snug text-muted-foreground">
          {def.formula}
        </span>
      </span>
    </span>
  );
}
