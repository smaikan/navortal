import { redirect } from "next/navigation";
/** Plan raporu artık analiz içinde. Eski bağlantının tarih aralığını koruyoruz. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[]>> }) {
  const params = await searchParams,
    next = new URLSearchParams();
  for (const key of ["fromDate", "toDate"]) if (typeof params[key] === "string") next.set(key, params[key]);
  redirect(next.size ? `/analytics?period=custom&${next}#plan` : "/analytics#plan");
}
