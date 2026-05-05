import { getUpstream, maskKey } from "@/lib/upstream";
import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const u = await getUpstream();
  return (
    <SettingsClient
      initial={{
        configured: !!u,
        baseUrl: u?.baseUrl || process.env.UPSTREAM_BASE_URL || "https://api.ai6700.com",
        maskedKey: u ? maskKey(u.apiKey) : "",
        enabled: u?.enabled ?? false,
      }}
    />
  );
}
