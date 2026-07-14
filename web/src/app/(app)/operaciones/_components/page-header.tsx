import { PeriodSelector } from "./period-selector";

export function PageHeader({ title, periodo }: { title: string; periodo: string }) {
  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-heading text-2xl font-bold">{title}</h1>
      <PeriodSelector value={periodo} />
    </div>
  );
}
