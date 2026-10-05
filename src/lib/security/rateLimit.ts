const MEMORY_BUCKETS = new Map<string, { count: number; expiresAt: number }>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
  total: number;
}

interface RateLimitOptions {
  bucket: string;
  identifier: string;
  limit: number;
  windowSec: number;
}

function sanitizeKeyPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9:_-]/g, "_");
}

function getIpFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const realIp = request.headers.get("x-real-ip") ?? "";
  const candidate = forwarded.split(",")[0]?.trim() || realIp.trim();
  return candidate || "unknown";
}

function readRetryAfter(expiresAt: number): number {
  const remainingMs = Math.max(0, expiresAt - Date.now());
  return Math.ceil(remainingMs / 1000);
}

function fallbackMemoryRateLimit(options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const windowMs = options.windowSec * 1000;
  const key = `${sanitizeKeyPart(options.bucket)}:${sanitizeKeyPart(options.identifier)}`;
  const current = MEMORY_BUCKETS.get(key);

  if (!current || current.expiresAt <= now) {
    MEMORY_BUCKETS.set(key, { count: 1, expiresAt: now + windowMs });
    return {
      allowed: true,
      remaining: Math.max(0, options.limit - 1),
      retryAfterSec: options.windowSec,
      total: options.limit,
    };
  }

  const nextCount = current.count + 1;
  current.count = nextCount;

  const allowed = nextCount <= options.limit;
  return {
    allowed,
    remaining: Math.max(0, options.limit - nextCount),
    retryAfterSec: readRetryAfter(current.expiresAt),
    total: options.limit,
  };
}

async function upstashRateLimit(options: RateLimitOptions): Promise<RateLimitResult | null> {
  const restUrl = process.env.UPSTASH_REDIS_REST_URL;
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!restUrl || !restToken) return null;

  const window = Math.floor(Date.now() / (options.windowSec * 1000));
  const key = `rl:${sanitizeKeyPart(options.bucket)}:${sanitizeKeyPart(options.identifier)}:${window}`;

  const pipelineUrl = `${restUrl.replace(/\/$/, "")}/pipeline`;
  const response = await fetch(pipelineUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${restToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", key],
      ["EXPIRE", key, options.windowSec],
    ]),
    cache: "no-store",
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as Array<{ result?: number }>;
  const count = Number(payload?.[0]?.result ?? 0);
  if (!Number.isFinite(count) || count <= 0) return null;

  return {
    allowed: count <= options.limit,
    remaining: Math.max(0, options.limit - count),
    retryAfterSec: options.windowSec,
    total: options.limit,
  };
}

export function getRequestIp(request: Request): string {
  return getIpFromRequest(request);
}

export async function rateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  try {
    const remote = await upstashRateLimit(options);
    if (remote) return remote;
  } catch {
    // Fallback for local/dev or transient Upstash issues.
  }
  return fallbackMemoryRateLimit(options);
}
