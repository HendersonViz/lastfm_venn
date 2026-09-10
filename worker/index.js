import { computeOverlap } from "../src/overlap.js";
import { fetchTopArtists, LastFmError, normalizeUsername, PERIODS } from "./lastfm.js";

const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function withSecurityHeaders(response) {
  const secured = new Response(response.body, response);
  Object.entries(SECURITY_HEADERS).forEach(([name, value]) => secured.headers.set(name, value));
  return secured;
}

function json(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

export async function handleApiRequest(request, env, ctx, dependencies = {}) {
  if (request.method !== "GET") {
    return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Use GET for this endpoint." } }, 405, {
      Allow: "GET",
    });
  }

  try {
    if (!env.LASTFM_API_KEY) {
      throw new LastFmError("The server's Last.fm API key is not configured.", {
        status: 503,
        code: "MISSING_LASTFM_API_KEY",
      });
    }

    const url = new URL(request.url);
    const user1 = normalizeUsername(url.searchParams.get("a"));
    const user2 = normalizeUsername(url.searchParams.get("b"));
    const period = url.searchParams.get("period") ?? "overall";
    if (!PERIODS.has(period)) {
      throw new LastFmError("Choose a supported Last.fm timeframe.", {
        status: 400,
        code: "INVALID_PERIOD",
      });
    }

    const fetchImpl = dependencies.fetchImpl ?? fetch;
    const cache = dependencies.cache ?? caches.default;
    let artists1;
    let artists2;

    if (user1.toLocaleLowerCase("en-US") === user2.toLocaleLowerCase("en-US")) {
      artists1 = await fetchTopArtists({ username: user1, period, apiKey: env.LASTFM_API_KEY, fetchImpl, cache, ctx });
      artists2 = artists1;
    } else {
      [artists1, artists2] = await Promise.all([
        fetchTopArtists({ username: user1, period, apiKey: env.LASTFM_API_KEY, fetchImpl, cache, ctx }),
        fetchTopArtists({ username: user2, period, apiKey: env.LASTFM_API_KEY, fetchImpl, cache, ctx }),
      ]);
    }

    return json({ users: [user1, user2], period, ...computeOverlap(artists1, artists2) });
  } catch (error) {
    const known = error instanceof LastFmError;
    const status = known ? error.status : 500;
    const code = known ? error.code : "INTERNAL_ERROR";
    const message = known ? error.message : "The comparison could not be completed.";

    if (status >= 500) {
      console.error(JSON.stringify({ event: "comparison_failed", status, code }));
    }
    return json({ error: { code, message, retryable: known ? error.retryable : true } }, status, {
      ...(status === 429 ? { "Retry-After": "60" } : {}),
    });
  }
}

export async function handleRequest(request, env, ctx, dependencies = {}) {
  const url = new URL(request.url);
  let response;

  if (url.pathname === "/api/lastfm/compare") {
    response = await handleApiRequest(request, env, ctx, dependencies);
  } else if (url.pathname.startsWith("/api/")) {
    response = json({ error: { code: "NOT_FOUND", message: "API endpoint not found." } }, 404);
  } else {
    response = await env.ASSETS.fetch(request);
  }

  return withSecurityHeaders(response);
}

export default {
  fetch: handleRequest,
};
