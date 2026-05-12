import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

const limiter =
  url && token
    ? new Ratelimit({
        redis: new Redis({ url, token }),
        limiter: Ratelimit.slidingWindow(3, "24 h"),
        analytics: false,
        prefix: "wlr:trial",
      })
    : null;

export async function checkAnonRateLimit(ipKey: string): Promise<{
  success: boolean;
  remaining: number;
  limit: number;
  reset: number;
}> {
  if (!limiter) {
    return { success: true, remaining: 99, limit: 99, reset: 0 };
  }
  const r = await limiter.limit(ipKey);
  return { success: r.success, remaining: r.remaining, limit: r.limit, reset: r.reset };
}

export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}
