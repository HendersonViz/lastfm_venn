import test from "node:test";
import assert from "node:assert/strict";

import { handleApiRequest } from "../worker/index.js";
import { fetchTopArtists, LastFmError, normalizeUsername } from "../worker/lastfm.js";

class MemoryCache {
  constructor() {
    this.responses = new Map();
  }

  async match(request) {
    return this.responses.get(request.url)?.clone();
  }

  async put(request, response) {
    this.responses.set(request.url, response.clone());
  }
}

const topArtistsResponse = (artists, totalPages = 1) => Response.json({
  topartists: {
    artist: artists.map((artist, index) => ({
      name: artist,
      playcount: String(10 - index),
      "@attr": { rank: String(index + 1) },
    })),
    "@attr": { totalPages: String(totalPages) },
  },
});

test("normalizes safe usernames and rejects empty or control-character input", () => {
  assert.equal(normalizeUsername("  Listener_1  "), "Listener_1");
  assert.throws(() => normalizeUsername(""), LastFmError);
  assert.throws(() => normalizeUsername("bad\nname"), LastFmError);
});

test("fetches and caches normalized artist data without caching the API key", async () => {
  const cache = new MemoryCache();
  const seenUrls = [];
  const fetchImpl = async (url) => {
    seenUrls.push(String(url));
    return topArtistsResponse(["Björk", "Radiohead"]);
  };

  const options = { username: "alice", period: "overall", apiKey: "super-secret", fetchImpl, cache };
  const first = await fetchTopArtists(options);
  const second = await fetchTopArtists({ ...options, fetchImpl: async () => assert.fail("cache should avoid a repeat fetch") });

  assert.deepEqual(first, second);
  assert.equal(seenUrls.length, 1);
  assert.match(seenUrls[0], /api_key=super-secret/u);
  assert.equal([...cache.responses.keys()].some((url) => url.includes("super-secret")), false);
});

test("maps Last.fm rate limiting to a safe retryable error", async () => {
  const fetchImpl = async () => Response.json({ error: 29, message: "Rate limit exceeded" });

  await assert.rejects(
    fetchTopArtists({ username: "alice", period: "overall", apiKey: "key", fetchImpl }),
    (error) => error.status === 429 && error.code === "LASTFM_RATE_LIMITED" && error.retryable,
  );
});

test("API validates periods before calling Last.fm", async () => {
  const response = await handleApiRequest(
    new Request("https://example.test/api/lastfm/compare?a=alice&b=bob&period=yesterday"),
    { LASTFM_API_KEY: "secret" },
    {},
    { fetchImpl: async () => assert.fail("invalid input must not reach Last.fm"), cache: new MemoryCache() },
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, "INVALID_PERIOD");
});

test("API response never includes the Last.fm secret", async () => {
  const response = await handleApiRequest(
    new Request("https://example.test/api/lastfm/compare?a=alice&b=bob&period=overall"),
    { LASTFM_API_KEY: "do-not-leak" },
    {},
    { fetchImpl: async () => topArtistsResponse(["Shared artist"]), cache: new MemoryCache() },
  );
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(body.includes("do-not-leak"), false);
  assert.match(body, /Shared artist/u);
});

test("API reports a missing server secret without exposing internals", async () => {
  const response = await handleApiRequest(
    new Request("https://example.test/api/lastfm/compare?a=alice&b=bob"),
    {},
    {},
    { cache: new MemoryCache() },
  );
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.error.code, "MISSING_LASTFM_API_KEY");
});
