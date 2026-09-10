const LASTFM_ENDPOINT = "https://ws.audioscrobbler.com/2.0/";
const PAGE_SIZE = 500;
const MAX_ARTISTS = 5000;
const MAX_PAGES = Math.ceil(MAX_ARTISTS / PAGE_SIZE);
const UPSTREAM_TIMEOUT_MS = 8000;
const CACHE_TTL_SECONDS = 1800;

export const PERIODS = new Set(["7day", "1month", "3month", "6month", "12month", "overall"]);

export class LastFmError extends Error {
  constructor(message, { status = 502, code = "LASTFM_ERROR", retryable = false } = {}) {
    super(message);
    this.name = "LastFmError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export function normalizeUsername(value) {
  if (typeof value !== "string") {
    throw new LastFmError("Two Last.fm usernames are required.", { status: 400, code: "INVALID_USERNAME" });
  }

  const username = value.trim().normalize("NFC");
  if (!username || username.length > 64 || /[\u0000-\u001f\u007f]/u.test(username)) {
    throw new LastFmError("Each username must be between 1 and 64 characters.", {
      status: 400,
      code: "INVALID_USERNAME",
    });
  }
  return username;
}

function mapUpstreamError(data, responseStatus) {
  const upstreamCode = Number(data?.error);
  const upstreamMessage = typeof data?.message === "string" ? data.message : "";

  if (upstreamCode === 29 || responseStatus === 429) {
    return new LastFmError("Last.fm is receiving too many requests. Please try again shortly.", {
      status: 429,
      code: "LASTFM_RATE_LIMITED",
      retryable: true,
    });
  }
  if (upstreamCode === 17 || /user not found/i.test(upstreamMessage)) {
    return new LastFmError("Last.fm could not find one of those users.", {
      status: 404,
      code: "LASTFM_USER_NOT_FOUND",
    });
  }
  if ([11, 16].includes(upstreamCode) || responseStatus >= 500) {
    return new LastFmError("Last.fm is temporarily unavailable. Please try again.", {
      status: 503,
      code: "LASTFM_UNAVAILABLE",
      retryable: true,
    });
  }
  if ([10, 26].includes(upstreamCode)) {
    return new LastFmError("The server's Last.fm API access is not configured correctly.", {
      status: 502,
      code: "LASTFM_CONFIGURATION_ERROR",
    });
  }
  if (upstreamCode === 6) {
    return new LastFmError("Last.fm rejected that username or timeframe.", {
      status: 400,
      code: "LASTFM_INVALID_REQUEST",
    });
  }
  return new LastFmError("Last.fm returned an unexpected response.", {
    status: 502,
    code: "LASTFM_BAD_RESPONSE",
    retryable: true,
  });
}

async function fetchPage({ username, period, page, apiKey, fetchImpl }) {
  const url = new URL(LASTFM_ENDPOINT);
  url.search = new URLSearchParams({
    method: "user.gettopartists",
    user: username,
    period,
    api_key: apiKey,
    format: "json",
    limit: String(PAGE_SIZE),
    page: String(page),
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let response;
  try {
    response = await fetchImpl(url, { signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new LastFmError("Last.fm took too long to respond. Please try again.", {
        status: 504,
        code: "LASTFM_TIMEOUT",
        retryable: true,
      });
    }
    throw new LastFmError("Could not reach Last.fm. Please try again.", {
      status: 503,
      code: "LASTFM_NETWORK_ERROR",
      retryable: true,
    });
  } finally {
    clearTimeout(timeout);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw mapUpstreamError(null, response.status);
  }

  if (!response.ok || data?.error) throw mapUpstreamError(data, response.status);
  if (!data?.topartists || typeof data.topartists !== "object") {
    throw mapUpstreamError(null, response.status);
  }
  return data.topartists;
}

function cacheRequest(username, period) {
  const key = new URL("https://lastfm-cache.internal/top-artists");
  key.searchParams.set("user", username.toLocaleLowerCase("en-US"));
  key.searchParams.set("period", period);
  key.searchParams.set("limit", String(MAX_ARTISTS));
  key.searchParams.set("v", "1");
  return new Request(key, { method: "GET" });
}

export async function fetchTopArtists({ username, period, apiKey, fetchImpl = fetch, cache, ctx }) {
  const cacheKey = cacheRequest(username, period);
  const cached = cache ? await cache.match(cacheKey) : null;
  if (cached) return cached.json();

  const artists = new Map();
  for (let page = 1; page <= MAX_PAGES && artists.size < MAX_ARTISTS; page += 1) {
    const topartists = await fetchPage({ username, period, page, apiKey, fetchImpl });
    const items = Array.isArray(topartists.artist)
      ? topartists.artist
      : topartists.artist && typeof topartists.artist === "object" ? [topartists.artist] : [];

    items.forEach((item, index) => {
      if (typeof item?.name !== "string" || !item.name.trim()) return;
      const name = item.name.trim().normalize("NFC");
      const playcount = Math.max(0, Number.parseInt(item.playcount, 10) || 0);
      const rank = Math.max(1, Number.parseInt(item?.["@attr"]?.rank, 10) || (page - 1) * PAGE_SIZE + index + 1);
      const key = name.toLocaleLowerCase("en-US");
      const previous = artists.get(key);
      if (!previous || playcount > previous.playcount) artists.set(key, { name, playcount, rank });
    });

    const totalPages = Math.max(1, Number.parseInt(topartists?.["@attr"]?.totalPages, 10) || 1);
    if (page >= totalPages || items.length < PAGE_SIZE) break;
  }

  const result = [...artists.values()];
  if (cache) {
    const cachedResponse = Response.json(result, {
      headers: { "Cache-Control": `public, s-maxage=${CACHE_TTL_SECONDS}` },
    });
    const write = cache.put(cacheKey, cachedResponse);
    if (ctx?.waitUntil) ctx.waitUntil(write);
    else await write;
  }
  return result;
}
