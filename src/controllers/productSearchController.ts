import type { FastifyRequest, FastifyReply } from "fastify";

const OFF_BASE = "https://world.openfoodfacts.org";
const SEARCH_A_LICIOUS_BASE = "https://search.openfoodfacts.org";
// Required by Open Food Facts — identify the app to avoid bot-detection / IP bans.
// Reads do not need an API key; fill out their usage form and always send this header:
// https://openfoodfacts.github.io/openfoodfacts-server/api/#authentication
const USER_AGENT =
  process.env.OFF_USER_AGENT ?? "FoodTracker/1.0 (mittralena@yandex.ru)";
const CGI_FIELDS =
  "code,product_name,generic_name,nutriments.energy-kcal_100g,nutriments.energy_100g,nutriments.proteins_100g,nutriments.fat_100g,nutriments.carbohydrates_100g";
const SAL_FIELDS = "code,product_name,generic_name,nutriments";
const BARCODE_FIELDS = CGI_FIELDS;

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 1000;
const FETCH_TIMEOUT_MS = 10_000;

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

export interface OffSearchResponse {
  products: unknown[];
  page: number;
  page_count: number;
  page_size: number;
  count: number;
}

const cache = new Map<string, CacheEntry>();

class OffUpstreamError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "OffUpstreamError";
  }
}

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
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(err: unknown): boolean {
  if (err instanceof OffUpstreamError) {
    return (
      err.status === undefined ||
      err.status === 429 ||
      err.status === 502 ||
      err.status === 503
    );
  }
  if (err instanceof TypeError) return true;
  return err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
}

async function offFetch(url: string, retries = 1): Promise<unknown> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!res.ok) {
        throw new OffUpstreamError(
          `OpenFoodFacts returned ${res.status} ${res.statusText}`,
          res.status,
        );
      }

      return await res.json();
    } catch (err) {
      lastError = err;
      if (attempt < retries && isRetryable(err)) {
        await sleep(400 * 2 ** attempt);
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

function normalizeSearchResponse(data: unknown, page: number): OffSearchResponse {
  const fallback: OffSearchResponse = {
    products: [],
    page,
    page_count: 0,
    page_size: 20,
    count: 0,
  };
  if (!data || typeof data !== "object") return fallback;

  const raw = data as Record<string, unknown>;
  const products = Array.isArray(raw.products)
    ? raw.products
    : Array.isArray(raw.hits)
      ? raw.hits
      : null;
  if (!products) return fallback;

  return {
    products,
    page: Number(raw.page) || page,
    page_count: Number(raw.page_count) || 0,
    page_size: Number(raw.page_size) || 20,
    count: Number(raw.count) || 0,
  };
}

function cgiSearchUrl(query: string, page: number): string {
  const url = new URL(`${OFF_BASE}/cgi/search.pl`);
  url.searchParams.set("search_terms", query);
  url.searchParams.set("search_simple", "1");
  url.searchParams.set("action", "process");
  url.searchParams.set("json", "1");
  url.searchParams.set("page", String(page));
  url.searchParams.set("page_size", "20");
  url.searchParams.set("fields", CGI_FIELDS);
  return url.toString();
}

function searchALiciousUrl(query: string, page: number): string {
  const url = new URL(`${SEARCH_A_LICIOUS_BASE}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("page", String(page));
  url.searchParams.set("page_size", "20");
  url.searchParams.set("fields", SAL_FIELDS);
  url.searchParams.set("langs", "en,ru");
  url.searchParams.set("boost_phrase", "true");
  return url.toString();
}

async function searchOpenFoodFacts(
  query: string,
  page: number,
): Promise<OffSearchResponse> {
  try {
    const data = await offFetch(searchALiciousUrl(query, page), 1);
    return normalizeSearchResponse(data, page);
  } catch (err) {
    if (!isRetryable(err)) throw err;
    const data = await offFetch(cgiSearchUrl(query, page), 1);
    return normalizeSearchResponse(data, page);
  }
}

/**
 * GET /api/products/search?q=...&page=...
 * Proxies text search to Open Food Facts with caching.
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

  const normalizedQuery = q.trim();
  const normalizedPage = Math.max(1, parseInt(page, 10) || 1);
  const cacheKey = `search:${normalizedQuery.toLowerCase()}:${normalizedPage}`;

  const cached = getCache<OffSearchResponse>(cacheKey);
  if (cached) {
    reply.header("X-Cache", "HIT");
    return reply.send(cached);
  }

  try {
    const data = await searchOpenFoodFacts(normalizedQuery, normalizedPage);
    setCache(cacheKey, data);
    reply.header("X-Cache", "MISS");
    return reply.send(data);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch from OpenFoodFacts";
    request.log.error({ err, q: normalizedQuery }, "OpenFoodFacts search failed");
    return reply.status(502).send({ error: message });
  }
};

/**
 * GET /api/products/barcode/:barcode
 * Proxies barcode lookup to Open Food Facts with caching.
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

  const url = `${OFF_BASE}/api/v2/product/${barcode}.json?fields=${BARCODE_FIELDS}`;

  try {
    const data = await offFetch(url, 1);
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
