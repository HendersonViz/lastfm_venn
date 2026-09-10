# Last.fm Artist Overlap Explorer

A small Cloudflare Worker application that compares two public Last.fm listening histories, draws their artist overlap, and creates a playful, deterministic **Overlap Fingerprint**.

The original project was a Streamlit application. This version preserves its six timeframes, 5,000-artist ceiling, harmonic-mean match score, Venn presentation, ranked table, and CSV export while moving the runtime to Cloudflare Workers + Workers Static Assets. The MIT license and original attribution remain unchanged.

## Architecture

```text
Browser (HTML/CSS/JavaScript)
    │
    ├── static files ───────────────┐
    │                               │
    └── GET /api/lastfm/compare ────┤
                                    ▼
                      one Cloudflare Worker
                         │             │
                         │             └── Workers Static Assets
                         ▼
                  Last.fm user.getTopArtists
                    (LASTFM_API_KEY secret)
```

There is no database, user account, authentication service, frontend framework, or KV namespace. The Worker validates inputs, makes bounded and timed Last.fm requests, caches individual user/period artist lists for 30 minutes at the edge, computes the comparison, and returns JSON. The browser never receives the API key.

### Routes

- `/` — the only application page
- `/api/lastfm/compare?a=alice&b=bob&period=overall` — comparison API
- `/?a=alice&b=bob&p=7day,1month,overall` — shareable UI state; valid links run automatically

Supported periods are `7day`, `1month`, `3month`, `6month`, `12month`, and `overall`.

## Local development

Requirements: Node.js 22 or newer and a [Last.fm API key](https://www.last.fm/api/account/create).

```bash
npm install
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and replace the placeholder. This file is ignored by Git.

```dotenv
LASTFM_API_KEY="your_real_key_here"
```

Then run:

```bash
npm run dev
```

Wrangler prints the local address, normally `http://localhost:8787`. Useful checks:

```bash
npm test
npm run build
npm run check
```

`npm run build` performs a Wrangler dry-run bundle into the ignored `dist/` directory. The application has no compile-time frontend build step.

## Production deployment

The checked-in [`wrangler.jsonc`](./wrangler.jsonc) defines one Worker named `lastfm-artist-overlap`, serves `public/` through Static Assets, requires the `LASTFM_API_KEY` secret, and uses the current compatibility date `2026-09-10`.

### 1. First deployment

Install dependencies and authenticate Wrangler:

```bash
npm install
npx wrangler login
npm run check
```

Create the Worker and upload the required secret and code together from the ignored local secret file:

```bash
npx wrangler deploy --secrets-file .dev.vars
```

Cloudflare stores `LASTFM_API_KEY` as an encrypted Worker secret; the file itself is not uploaded as a static asset.

### 2. Subsequent deployments

After the Worker exists and its secret is attached, deploy source changes with:

```bash
npm run deploy
```

To set or rotate the production secret interactively instead:

```bash
npx wrangler secret put LASTFM_API_KEY
```

Paste the value only at Wrangler's prompt. Do not put it in `wrangler.jsonc`, `public/`, GitHub build variables, or a committed file. You can also use **Workers & Pages → lastfm-artist-overlap → Settings → Variables and Secrets → Add → Secret** in the Cloudflare dashboard.

### 3. Connect `lastfm.nathanhenderson.ca`

The `nathanhenderson.ca` zone must be active in the same Cloudflare account. First deploy and test the generated `*.workers.dev` address. Then:

1. Open **Workers & Pages → lastfm-artist-overlap**.
2. Open **Settings → Domains & Routes → Add → Custom Domain**.
3. Enter `lastfm.nathanhenderson.ca` and confirm.
4. Cloudflare creates the DNS record and certificate. If that hostname already has an A, AAAA, or CNAME record, remove or migrate that record first.

The domain is intentionally not hard-coded in `wrangler.jsonc`, so a fresh contributor can deploy to `workers.dev` without controlling your zone. If you prefer configuration-managed routing after the first deployment, add this top-level property and redeploy:

```jsonc
"routes": [
  { "pattern": "lastfm.nathanhenderson.ca", "custom_domain": true }
]
```

### 4. Automatic deployments from GitHub

Cloudflare Workers Builds is sufficient; a separate GitHub Actions workflow is unnecessary.

1. Push this repository to GitHub.
2. In **Workers & Pages → lastfm-artist-overlap → Settings → Builds**, choose **Connect** and authorize the repository.
3. Set the production branch to `main`.
4. Set the build command to `npm run check` and deploy command to `npx wrangler deploy`.
5. Leave the root directory as `/` for this standalone repository.
6. Confirm the dashboard Worker name is exactly `lastfm-artist-overlap`, matching `wrangler.jsonc`.

The already-configured Worker secret remains attached across source deployments. Do not add the Last.fm key to GitHub merely to make builds work. Branch builds can use Wrangler's default preview-version flow; production pushes deploy to the connected Worker.

### 5. Production smoke test

After deployment, open `https://lastfm.nathanhenderson.ca` and verify:

- Compare two known public usernames across one timeframe and all three default timeframes; confirm the Venn, totals, ranked artists, fingerprint, and CSV download.
- Copy the share URL, open it in a private window, and reload it; confirm the usernames and selected timeframes restore and run.
- Try a nonexistent username and `/api/lastfm/compare` without parameters; confirm friendly JSON/UI errors with no stack trace.
- In browser Network tools, confirm requests stay same-origin and contain neither `api_key` nor `LASTFM_API_KEY`.
- Check the footer at desktop and narrow mobile widths: both link groups remain readable, wrap cleanly, and stay inside the viewport.
- In Worker Observability, confirm failures show only structured status/code data and no Last.fm response body, usernames, or secret.

## API and calculation behavior

Each API call accepts exactly two normalized usernames and one allowlisted period. Usernames are trimmed, Unicode-normalized, bounded to 64 characters, and rejected if they contain control characters. Last.fm requests use 500 results per page, stop after 10 pages/5,000 artists, and time out after eight seconds per upstream request.

Artist matching is Unicode-normalized and case-insensitive. Overlap percentage is the Jaccard percentage:

```text
shared artists / combined unique artists × 100
```

The match score preserves the original application's harmonic mean of the users' play counts. A deep cut is the shared artist whose lower (better) of the two rank numbers is farthest down both lists, with deterministic tie-breaking. Fingerprint labels use fixed overlap/count thresholds—no LLM or external service is involved.

Last.fm user/period responses are held in Cloudflare's local data-centre Cache API for 30 minutes. Cache keys include only the normalized username, period, limit, and schema version—never the API key. Comparison responses sent to browsers use `Cache-Control: no-store`.

## Security and privacy notes

- `LASTFM_API_KEY` exists only in `.dev.vars` locally and as an encrypted Worker secret in production.
- Static and API responses receive a restrictive Content Security Policy and standard browser security headers.
- The API is same-origin and does not enable cross-origin access.
- Errors are normalized; upstream request URLs, secrets, exception details, and stack traces are not returned.
- The application uses public Last.fm data and has no analytics, cookies, accounts, or durable user storage.
- The edge cache temporarily stores public artist lists keyed by Last.fm username for request reduction. It is regional and expires after 30 minutes.
- Share URLs expose the two usernames in browser history and to anyone receiving the link. Listening data is not encoded in the URL.

## Phase 3 assessment (deliberately deferred)

The current architecture is intentionally enough for modest traffic:

- **Caching:** Static Assets already receive normal Cloudflare asset caching. The Cache API handles the generated Last.fm data that normal static caching cannot. Thirty-minute per-user/per-period caching removes common repeats without a durable data store.
- **KV:** Not warranted now. KV becomes useful only if cross-region cache misses create measurable Last.fm rate-limit pressure, if longer-lived reusable results are needed, or if purge/control requirements exceed ephemeral edge caching. `fetchTopArtists` is isolated so a cache adapter can be changed later.
- **Abuse protection:** Input bounds, fixed periods, bounded pagination, same-origin browser access, and upstream caching limit accidental load. If public abuse appears, add a Cloudflare Rate Limiting rule for `/api/lastfm/*` before adding application state. Browser same-origin rules are not an authentication boundary, so the endpoint remains publicly callable.
- **Observability:** Workers Logs is enabled and only structured error code/status data is logged. Review volume after launch and lower `head_sampling_rate` if traffic grows. No third-party logging service is justified yet.
- **Dependencies:** Wrangler is the only dependency and is pinned. Review it periodically with `npm outdated`; avoid automated major upgrades without a smoke test.
- **Accessibility:** The implementation includes labels, keyboard-focus states, live status, table headings, reduced-motion handling, and an accessible description for each Venn. A manual screen-reader and colour-contrast review remains worthwhile.
- **SEO/metadata:** Basic title, description, Open Graph metadata, semantic headings, and a stable custom domain are included. A bespoke social preview image, canonical tag after the domain is live, and search-console submission can wait.
- **Shareable results:** Query-string restoration is implemented. Server-rendered per-comparison social cards are deliberately not included; they would add complexity and expose usernames to crawlers/cache layers.

## License

[MIT](./LICENSE) © 2026 Nathan Henderson. This project is not affiliated with Last.fm.
