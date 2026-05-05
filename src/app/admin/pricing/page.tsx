import PricingClient from "./PricingClient";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

async function getRate(key: string, fallback = 0.2): Promise<number> {
  const r = await prisma.setting.findUnique({ where: { key } });
  if (!r) return fallback;
  const v = parseFloat(r.value);
  return Number.isFinite(v) ? v : fallback;
}

export default async function PricingPage() {
  const [chat, image, video, channelCount, todoCount] = await Promise.all([
    getRate("min_profit_rate_chat"),
    getRate("min_profit_rate_image"),
    getRate("min_profit_rate_video"),
    prisma.channel.count(),
    prisma.channel.count({ where: { notes: { contains: "待核对" } } }),
  ]);
  return (
    <PricingClient
      initial={{
        minProfitRateChat: chat,
        minProfitRateImage: image,
        minProfitRateVideo: video,
        channelCount,
        pendingReviewCount: todoCount,
      }}
    />
  );
}
