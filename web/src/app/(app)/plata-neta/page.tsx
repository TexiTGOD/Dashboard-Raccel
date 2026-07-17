import { redirect } from "next/navigation";

// "Plata neta" se renombró a "Cashflow". Redirect para links/bookmarks viejos.
export default async function PlataNetaRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams(sp).toString();
  redirect(`/cashflow${qs ? `?${qs}` : ""}`);
}
