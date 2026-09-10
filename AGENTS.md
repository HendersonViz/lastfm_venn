# AGENTS.md

## Purpose
This repository contains a dependency-light Cloudflare Worker and static web app that compares the top artists of two Last.fm users.

## Stack
- JavaScript ES modules
- Cloudflare Workers + Workers Static Assets
- Wrangler 4
- Node's built-in test runner

## Project Map
- `worker/index.js`: HTTP routing, response normalization, asset fallback, security headers
- `worker/lastfm.js`: Last.fm client, validation, pagination, timeouts, error mapping, edge caching
- `src/overlap.js`: pure overlap and fingerprint calculations shared with tests
- `public/`: framework-free browser UI
- `tests/`: focused calculation and API tests
- `wrangler.jsonc`: one-Worker deployment configuration

## Development Guidelines
- Keep `LASTFM_API_KEY` only in `.dev.vars` locally and in a Worker secret in production.
- Keep API/network behavior in `worker/` and calculations pure in `src/`.
- Preserve the six Last.fm timeframe identifiers and harmonic-mean match score unless intentionally changing product behavior.
- Do not add KV, authentication, a database, or a frontend framework without a concrete need.
- Return stable, user-safe API errors; do not return upstream URLs, keys, stack traces, or raw exceptions.

## Validation
Run `npm run check` before deployment. For a manual smoke test, run `npm run dev`, compare two valid public usernames, inspect multiple periods, download a CSV, copy/reload the share URL, and test an invalid username.
- Use `python3` explicitly in this environment.
