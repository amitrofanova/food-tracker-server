import type { FastifyRequest, FastifyReply } from "fastify";

const OFF_BASE = "https://world.openfoodfacts.org";
// Required by OpenFoodFacts — identify your app to avoid bot-detection / IP bans.
// See https://openfoodfacts.github.io/openfoodfacts-server/api/#authentication
const USER_AGENT = "FoodTracker/1.0 (mittralena@yandex.ru)";
const PRODUCT_FIELDS = "code,product_name,generic_name,nutriments";

// ---------------------------------------------------------------------------
// Simple in-memory cache with TTL
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_ENTRIES = 1000;

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function getCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    // Evict the oldest entry
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ---------------------------------------------------------------------------
// Shared fetch wrapper
// ---------------------------------------------------------------------------
async function offFetch(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
    // Abort if no response within 10 seconds
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`OpenFoodFacts returned ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/products/search?q=...&page=...
 * Proxies text search to OpenFoodFacts with caching.
 */
export const searchProducts = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const { q, page = "1" } = request.query as { q?: string; page?: string };

  if (!q || q.trim().length < 2) {
    return reply
      .status(400)
      .send({ error: "Query must be at least 2 characters" });
  }

  const normalizedPage = Math.max(1, parseInt(page, 10) || 1);
  const cacheKey = `search:${q.trim().toLowerCase()}:${normalizedPage}`;

  const cached = getCache(cacheKey);
  if (cached) {
    reply.header("X-Cache", "HIT");
    return reply.send(cached);
  }

  const url = new URL(`${OFF_BASE}/cgi/search.pl`);
  url.searchParams.set("search_terms", q.trim());
  url.searchParams.set("lang", "en");
  url.searchParams.set("page", String(normalizedPage));
  url.searchParams.set("page_size", "20");
  url.searchParams.set("json", "1");
  url.searchParams.set("action", "process");
  url.searchParams.set("fields", PRODUCT_FIELDS);

  try {
    const data = await offFetch(url.toString());
    setCache(cacheKey, data);
    reply.header("X-Cache", "MISS");
    return reply.send(data);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch from OpenFoodFacts";
    request.log.error(
      { err, url: url.toString() },
      "OpenFoodFacts search failed",
    );
    return reply.status(502).send({ error: message });
  }
};

/**
 * GET /api/products/barcode/:barcode
 * Proxies barcode lookup to OpenFoodFacts with caching.
 */
export const getProductByBarcode = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const { barcode } = request.params as { barcode: string };

  if (!/^\d{8,14}$/.test(barcode)) {
    return reply.status(400).send({ error: "Invalid barcode format" });
  }

  const cacheKey = `barcode:${barcode}`;
  const cached = getCache(cacheKey);
  if (cached) {
    reply.header("X-Cache", "HIT");
    return reply.send(cached);
  }

  const url = `${OFF_BASE}/api/v2/product/${barcode}.json?fields=${PRODUCT_FIELDS}`;

  try {
    const data = await offFetch(url);
    setCache(cacheKey, data);
    reply.header("X-Cache", "MISS");
    return reply.send(data);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch from OpenFoodFacts";
    request.log.error({ err, barcode }, "OpenFoodFacts barcode lookup failed");
    return reply.status(502).send({ error: message });
  }
};
