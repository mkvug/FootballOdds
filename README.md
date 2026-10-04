# FootballOdds

Live win probability for NFL and college football games in progress. Built from [SPEC.md](SPEC.md).

Data comes from ESPN's unofficial public API (no key needed). Personal, non-commercial project.

```bash
npm install
npm run dev            # http://localhost:3000 (Next picks the next free port if taken)
npm test               # unit tests
npm run typecheck
npm run build && npm start
npm run record-fixtures   # snapshot live ESPN payloads into tests/fixtures/recorded/ (run on game day)
```

Config (all optional, see `.env.example`): `ESPN_USER_AGENT`, `CACHE_TTL_LIVE_S`, `CACHE_TTL_LIST_S`.

## Hosting note: ESPN may block your host's servers

ESPN's CDN returns `403` to some datacenter IP ranges (Vercel's, as of 2026-10-04). When our `/api` routes can't reach
ESPN they answer `502`, and the browser then fetches ESPN directly (ESPN allows cross-origin reads) using the same
parsing code, loaded on demand (`lib/transport.ts`, `lib/direct.ts`). It re-tries the server every 5 minutes.
The 502 body says why (`details` / `reason`), and the Vercel function log has the same line.

## Layout

- `app/api/games` – cached JSON for the list and for one game (`?since=` returns only new probability points)
- `lib/providers/espn.ts` – the only file that knows ESPN's shapes; Zod-validated, maps to `lib/providers/types.ts`
- `lib/games.ts`, `lib/cache.ts` – TTL cache with request de-duplication and stale fallback
- `components/` – list cards, full-screen game view, split bar, timeline chart

## End-to-end tests

```bash
npm run test:e2e        # builds the app, starts a mock ESPN + the app, drives Chromium
npm run test:e2e:ui     # same, in Playwright's UI
```

The suite never touches real ESPN. `tests/e2e/mock-espn.mjs` replays `tests/fixtures/` as a live NFL game, a live
college game, upcoming games and a final, and exposes `POST /__control` so tests can move the probability, take
the "feed" down, or empty the slate. The app runs in production mode on port 3100 with 1s cache TTLs and ~1.5s
polling (`NEXT_PUBLIC_POLL_*`), so tests don't wait out real 5s/30s intervals.
