import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function TtsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const qs = new URLSearchParams();
  const sp = await searchParams;
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) v.forEach((item) => qs.append(k, item));
    else if (typeof v === "string") qs.set(k, v);
  }
  const suffix = qs.toString();
  redirect(`/dashboard/voices${suffix ? `?${suffix}` : ""}`);
}
