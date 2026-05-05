import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

function toQueryString(searchParams: SearchParams): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const v of value) qs.append(key, v);
      continue;
    }
    if (typeof value === "string") qs.set(key, value);
  }
  const str = qs.toString();
  return str ? `?${str}` : "";
}

export default async function AudioCompatPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = toQueryString(await searchParams);
  redirect(`/dashboard/voices${query}`);
}
