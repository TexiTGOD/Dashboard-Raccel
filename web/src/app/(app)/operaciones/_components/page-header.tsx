import { RangePicker } from "./period-selector";
import type { Period } from "@/lib/period";

export function PageHeader({ title, period }: { title: string; period: Period }) {
  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-heading text-2xl font-bold">{title}</h1>
      <RangePicker period={period} />
    </div>
  );
}
