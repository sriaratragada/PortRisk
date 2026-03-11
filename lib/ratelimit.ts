import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type RateWindow = `${number} ${"ms" | "s" | "m" | "h" | "d"}` | `${number}${"ms" | "s" | "m" | "h" | "d"}`;

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN
      })
    : null;

function createLimiter(limit: number, window: RateWindow = "1 m") {
  if (!redis) {
    return null;
  }

  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, window),
    analytics: true,
    prefix: "portfolio-risk-engine"
  });
}

const limiters = {
  risk: createLimiter(20),
  stress: createLimiter(10),
  default: createLimiter(60)
};

export async function enforceRateLimit(key: string, scope: keyof typeof limiters) {
  const limiter = limiters[scope];
  if (!limiter) {
    return null;
  }

  const result = await limiter.limit(`${scope}:${key}`);
  if (result.success) {
    return null;
  }

  return new Response(
    JSON.stringify({
      error: "Rate limit exceeded",
      retryAfter: Math.ceil((result.reset - Date.now()) / 1000)
    }),
    {
      status: 429,
      headers: {
        "content-type": "application/json"
      }
    }
  );
}
