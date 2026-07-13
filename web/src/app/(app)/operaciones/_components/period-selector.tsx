"use client";

import { useRouter, usePathname } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { monthOptions } from "@/lib/period";

export function PeriodSelector({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const options = monthOptions(12);

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v) router.push(`${pathname}?periodo=${v}`);
      }}
    >
      <SelectTrigger className="w-56 font-mono capitalize">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="capitalize">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
