# FootballOdds — Build Spec

**Status:** Draft v1 · **Date:** 2026-10-04 · **Type:** Greenfield web app

A website that lists the football games being played right now. When a user picks one, it shows a full-screen view of each team's current chance of winning, updated in real time.

---

## 1. Scope and assumptions

| # | Decision | Rationale |
|---|----------|-----------|
| A1 | **"Football" = American football only: NFL first, then NCAAF.** | Confirmed by the product owner. Soccer is out of scope. |
| A2 | **"Winning odds" = win probability (0–100%) per team.** Bookmaker moneyline odds are shown as a secondary layer. | Win probability is the number people actually understand. It is free and changes on every play. Bookmaker odds are converted to probabilities so both use the same scale (§6). |
| A3 | **"Currently being played" = games with status `in`.** Upcoming games later today and games finished today are shown in collapsed sections below. | With nothing else on the list, it would be empty most of the week. |
| A4 | No user accounts, no betting, no payments. | Out of scope. The site only displays data. |
| A5 | **Personal, non-commercial project.** It will never be monetised. | Confirmed by the product owner. This makes relying on ESPN's unofficial API acceptable (§2.3) and fits the free Vercel Hobby plan, which is for non-commercial use only. |
| A6 | **ESPN is the only data source.** No paid feeds and no API keys. | Confirmed by the product owner. The Odds API is not used for now; the adapter layer (§4.2) leaves room to add a source later. |

**Non-goals (v1):** placing bets, push notifications, historical archives, user-created content, native apps.

---

## 2. Data source research

All sources below were checked on 2026-10-04 (NFL Week 4, 2026 season) unless marked *unverified*.

### 2.1 Comparison

| Source | Cost | Live win probability | Live odds | Coverage | Official? | Verdict |
|---|---|---|---|---|---|---|
| **ESPN site/core API** (`site.api.espn.com`, `sports.core.api.espn.com`) | Free, no key | ✅ Per-play `homeWinPercentage` | ✅ DraftKings moneyline/spread/total, pre-game and live | NFL, NCAAF, more | ❌ Undocumented; the app ESPN.com runs on | **Chosen** |
| **The Odds API** v4 (`api.the-odds-api.com`) | Free plan: 500 credits/mo. Paid: $30/mo for 20K, $59/mo for 100K | ❌ | ✅ Multi-bookmaker h2h. In-play refresh about every 40s, pre-match about every 60s | NFL, NCAAF | ✅ Documented, stable | **Not used for now** (A6). Best candidate if a second source is ever needed |
| SportsDataIO, Sportradar, OddsJam | Paid / enterprise | Some | ✅ | Wide | ✅ | Not needed for a personal project |

### 2.2 Why ESPN

- **The probability is already calculated.** ESPN publishes its own win-probability model with one data point per play. That gives us both the current value and a full history for a chart, with no modelling on our side.
- **No key and no quota.** The Odds API's free plan cannot cover live polling: one region and one market costs 1 credit per call. Polling every 60s across a 3.5-hour NFL window uses about 210 credits per sport per window, so 500 credits last roughly two Sundays.
- **Team metadata is included.** Every response carries team names, abbreviations, logo URLs, and hex brand colours (`team.color`, `team.alternateColor`). The visualisation needs all of these.

### 2.3 Risks of ESPN and mitigations

| Risk | Mitigation |
|---|---|
| Undocumented. It can change or disappear without notice. | Every upstream call goes through one **provider adapter** (§4.2). Each adapter returns our own normalised types. If ESPN breaks, we write a new adapter; the UI does not change. |
| Terms of use / rate limiting | Browsers never call ESPN directly. Our server fetches each upstream URL **at most once per cache TTL**, no matter how many users are watching. Send a descriptive `User-Agent`. The project is personal and non-commercial (A5), so no licensed feed is planned. |
| Win probability is missing for some games (some NCAAF, some pre-game states) | Fall back to the de-vigged moneyline probability (§6) and label the source in the UI. |

### 2.4 Verified endpoints

**Scoreboard: list of games** (pass `?dates=YYYYMMDD` for a specific day)

```
GET https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard
GET https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard
```

Fields we use, under `events[]`:

- `id`, `name`, `date`
- `status.type.state`: `"pre"`, `"in"` or `"post"`
- `status.displayClock`, `status.period`, `status.type.shortDetail`
- `competitions[0].competitors[]`: `homeAway`, `score`, `team.{id, displayName, abbreviation, logo, color, alternateColor}`
- `competitions[0].odds[0]`: `provider.name` (e.g. "DraftKings"), `moneyline.{home,away}.{open,close}.odds` (American format, e.g. `"+170"`), `spread`, `overUnder`
- `competitions[0].situation.lastPlay.probability.homeWinPercentage`: live games only. **To verify:** this field could not be observed because no game was live during research. It is expected from community documentation.

**Game summary: full win-probability history for one game**

```
GET https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event={eventId}
```

- `winprobability[]`: `{ homeWinPercentage: 0..1, tiePercentage, playId }`, in play order. Verified: 196 points for a completed game. The last element is the current value.
- `header`, `boxscore`, `drives`, `pickcenter`, `odds`: score, clock and odds context.

**Core probabilities feed** (an alternative that includes `awayWinPercentage`, `secondsLeft` and `lastModified`)

```
GET https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/{id}/competitions/{id}/probabilities?limit=1000
```

---

## 3. Product requirements

### 3.1 Game list (`/`)

| ID | Requirement |
|---|---|
| L1 | Show every NFL and NCAAF game with state `in` as a card, grouped by league. NFL is listed first. |
| L2 | Each card shows: both team logos and abbreviations, the score, period and clock (`shortDetail`, e.g. "Q3 4:12"), and a **thin win-probability bar** in team colours with the leading team's percentage. |
| L3 | Below the live games: "Later today" (`pre`, start time in local time, pre-game probability from moneyline) and "Final" (`post`). Both sections collapsed by default. |
| L4 | If no games are live, show an empty state with the time of the next kickoff and the "Later today" section expanded. |
| L5 | The list refreshes automatically every **30s**. Cards update in place, with no layout shift and no full re-render flash. |
| L6 | Clicking or tapping a card, or pressing Enter on a focused card, opens `/game/{league}/{eventId}`. |
| L7 | League filter chips: All / NFL / NCAAF. NCAAF can have 50+ games on a Saturday, so it gets a search box that matches team names. |

### 3.2 Game view (`/game/[league]/[eventId]`)

The game view fills the whole screen and is designed to be left open on a TV or second monitor.

```
┌─────────────────────────────────────────────────────────────┐
│ ← Games                        Q3 · 4:12        ● LIVE  ⛶   │
│                                                             │
│   [LOGO]                                         [LOGO]     │
│   KANSAS CITY                                  LAS VEGAS    │
│   CHIEFS  24                                  17  RAIDERS   │
│                                                             │
│        ██████████████████████████████▌░░░░░░░░░░░           │
│              73.4%                          26.6%           │
│                                                             │
│   ╭─ win probability over game ──────────────────────────╮  │
│   │      ╱╲    ╱‾‾‾‾╲___╱‾‾‾‾‾‾‾‾‾‾‾╲___╱‾‾‾‾‾‾‾          │  │
│   │ ‾‾‾‾╱  ╲__╱                        50% ─ ─ ─ ─ ─      │  │
│   ╰─ Q1 ──────── Q2 ──────── Q3 ──────── Q4 ────────────╯  │
│                                                             │
│  Market (DraftKings): KC -320 · LV +250  →  74% / 26%       │
│  Last play: P.Mahomes pass to T.Kelce for 12 yds            │
│  Updated 3s ago · Source: ESPN win probability              │
└─────────────────────────────────────────────────────────────┘
```

| ID | Requirement |
|---|---|
| G1 | **Hero split bar.** It spans the full width, each side filled in that team's `color`. The boundary between them animates to the new value (spring or ease-out, about 600ms) whenever the probability changes. |
| G2 | **Large percentages**, at least 12vw on mobile and 8vw on desktop. Use tabular numerals, and animate value changes by counting up or down. |
| G3 | **Win-probability timeline.** A line chart of home win % across the game, with the y-axis fixed at 0–100% and a 50% reference line. Shade the area above 50% in the home colour and below it in the away colour. Mark quarter boundaries. When a new point arrives, it appends without redrawing the whole chart. |
| G4 | **Swing indicator.** If one play moves the probability by 10 percentage points or more, flash a "Big swing ±N%" toast and add a marker on the timeline. |
| G5 | **Market odds strip.** Show the bookmaker moneyline (American format), the de-vigged implied probability, and the provider name. Hide the strip when no odds are available. |
| G6 | **Freshness.** Show "Updated Ns ago". If more than 90s pass with no update while the game is `in`, show a "Delayed" badge. |
| G7 | **Fullscreen button** using the Fullscreen API. On TV-sized screens (≥1600px wide), hide the header after 5s of no mouse movement. |
| G8 | **Game states.** `pre`: show the moneyline-derived probability and a kickoff countdown. `post`: show the final score, a "FINAL" badge, and the frozen chart. Polling stops after `post`. |
| G9 | **Colour clash handling.** If the two sides' colours have a ΔE (CIE76) below 35, the away side tries a lightened primary, its `alternateColor`, a lightened alternate, then light grey, taking the first visible one that clears the threshold. (20 was too low: two reds at ΔE 22 were indistinguishable on a thin bar.) A vertical `|` divider also marks the boundary, so it stays visible even when colours are close. Text placed on a team colour must meet WCAG AA contrast; choose white or black text automatically. |
| G10 | **Deep-linkable and shareable.** Set the page `<title>` to "KC 73% – LV 27% · FootballOdds" and keep it updated, and add OG tags. |

### 3.3 Non-functional

| ID | Requirement |
|---|---|
| N1 | **Latency:** less than 15s from ESPN publishing a new probability to it appearing on screen (server cache 5s plus client poll 5s, plus network). |
| N2 | **Upstream load:** at most one upstream request per unique URL per TTL window, no matter how many viewers there are. |
| N3 | **Performance:** LCP under 2.0s on 4G mobile. Game view JS under 120KB gzipped. |
| N4 | **Accessibility:** WCAG 2.1 AA. Changes in the leading team are announced through an `aria-live="polite"` region, throttled to at most once every 30s. Respect `prefers-reduced-motion`. |
| N5 | **Responsive:** works from 360px to 4K. Landscape is the primary target for the game view. |
| N6 | **Responsible-gambling notice** in the footer: "For entertainment only. Not betting advice. 21+. Gambling problem? Call 1-800-GAMBLER." |

---

## 4. Architecture

### 4.1 Stack

| Layer | Choice | Alternatives rejected |
|---|---|---|
| Framework | **Next.js 15+ (App Router), TypeScript** | Vite SPA (would still need a separate server for proxying and caching); Remix (fine, but the team is less familiar with it) |
| Hosting | **Vercel** (Hobby plan is free) | Cloudflare Pages (also a good fit; the choice can be swapped later) |
| Caching | Next `fetch` with `revalidate`, plus an in-memory LRU per instance. Optional Upstash Redis (free tier) if we need multiple instances | Database (no data needs to persist) |
| Client data | **TanStack Query** with `refetchInterval` | SWR (equivalent) |
| Real-time transport | **Client polling** of our own API (5s game view, 30s list) | SSE/WebSockets. The upstream data is poll-based anyway, and long-lived connections fit poorly on serverless. Revisit if we move to a paid push feed. |
| Charts | **visx** (or a hand-rolled SVG path) | Chart.js (canvas, harder to theme); Recharts (heavier) |
| Animation | **Motion** (`motion/react`) | CSS-only (counting numbers is awkward) |
| Styling | Tailwind CSS v4 | — |
| Validation | **Zod** schemas on every upstream response | — |
| Testing | Vitest, Playwright, MSW | — |

### 4.2 System diagram

```
Browser ──poll──► Next.js Route Handlers (/api/*) ──► EspnProvider ──► ESPN site/core API
   ▲                     │  cache (TTL)                    │
   └──── JSON (normalised types, §5) ◄──────────────────────┘
```

**Provider adapter interface**

```ts
interface ScoreboardProvider {
  listGames(league: League, date?: string): Promise<GameSummary[]>;
  getGame(league: League, eventId: string): Promise<GameDetail>;
}
```

Build one adapter, `EspnProvider`. It also extracts the DraftKings moneyline from ESPN's `odds` block into `MarketOdds`, so the market strip (G5) needs no second source. The interface exists so ESPN can be replaced without touching the UI if its API changes.

### 4.3 Our API

| Route | Returns | Server cache TTL |
|---|---|---|
| `GET /api/games?league=nfl,ncaaf` | `GameSummary[]` | 15s while any game is `in`, otherwise 5min |
| `GET /api/games/{league}/{eventId}` | `GameDetail`, including the full probability history | 5s if `in`, 60s if `pre`, 24h if `post` |

Response headers: `Cache-Control: public, s-maxage=<ttl>, stale-while-revalidate=30`. When the upstream fails, return the last good payload with `stale: true` rather than a 5xx error.

### 4.4 Directory layout

```
app/
  page.tsx                         # game list
  game/[league]/[eventId]/page.tsx # full-screen view
  api/games/route.ts
  api/games/[league]/[eventId]/route.ts
lib/
  providers/espn.ts  providers/types.ts
  odds.ts          # conversion and de-vig (§6)
  colors.ts        # ΔE clash check, contrast picker
  cache.ts
components/
  GameCard.tsx  ProbabilityBar.tsx  ProbabilityChart.tsx
  MarketStrip.tsx  FreshnessBadge.tsx  FullscreenButton.tsx
tests/  (unit/, e2e/, fixtures/ ← recorded ESPN JSON)
```

---

## 5. Data model (normalised)

```ts
type League = "nfl" | "ncaaf";
type GameState = "pre" | "in" | "post";

interface Team {
  id: string; name: string; abbreviation: string;
  logoUrl: string; color: string; altColor: string;   // "#RRGGBB"
}

interface WinProbability {
  home: number; away: number; tie: number;    // 0..1, sums to 1. tie comes from ESPN tiePercentage, usually 0
  source: "espn_model" | "market_devig";
  asOf: string;                                // ISO timestamp
}

interface MarketOdds {
  provider: string;                            // e.g. "DraftKings", as reported by ESPN
  homeAmerican: number; awayAmerican: number;
  implied: WinProbability;                     // de-vigged
}

interface GameSummary {
  id: string; league: League; state: GameState;
  startTime: string; clock: string | null; period: number | null; statusText: string;
  home: Team & { score: number }; away: Team & { score: number };
  winProbability: WinProbability | null;
}

interface ProbabilityPoint { seq: number; homeWin: number; period?: number; playText?: string; }

interface GameDetail extends GameSummary {
  history: ProbabilityPoint[];
  market: MarketOdds | null;
  lastPlay: string | null;
  stale?: boolean;
}
```

**Choosing the probability source:** use ESPN `winprobability` (last point) if present. Otherwise use `MarketOdds.implied`. Otherwise use `null`, which the UI renders as "Probability unavailable" with the bar at 50/50 in grey.

---

## 6. Odds math (`lib/odds.ts`)

**Convert American odds to raw implied probability**

- Negative odds `−A`: `p = A / (A + 100)`. For example, −320 → 0.762.
- Positive odds `+B`: `p = 100 / (B + 100)`. For example, +250 → 0.286.

**Remove the vig (proportional normalisation):** `p_i' = p_i / Σp`. Taking the example above: the total is 1.048, so the result is 72.7% / 27.3%.

Unit-test these with known pairs, including even odds (+100/+100 → 50/50), heavy favourites (−1000/+650), and inputs that are already vig-free.

---

## 7. Polling and update strategy

| Context | Client interval | Pauses when |
|---|---|---|
| Game list | 30s | Tab hidden (`document.visibilityState`) |
| Game view, `in` | 5s | Tab hidden. On becoming visible again, refetch immediately |
| Game view, `pre` | 60s, then 5s from 5min before kickoff | Tab hidden |
| Game view, `post` | No polling | — |

- **Incremental history:** the client sends `?since={lastSeq}`, and the server returns only new points. This keeps payloads small in long games, which can have 200+ plays.
- **Backoff:** after 3 consecutive failures, double the interval each time up to a 60s cap, and show the "Delayed" badge.

---

## 8. Visual design direction

- **Look:** dark, broadcast-graphics style. Near-black background (`#0B0D10`), with team colours as the only saturated hues so the two sides read as the teams.
- **Type:** a condensed display face for team names and numbers (e.g. "Barlow Condensed" or "Oswald"), with tabular numerals. Body text uses Inter.
- **Motion:** the bar boundary moves on a spring. Numbers count. A big swing triggers a short pulse on the gaining side. With `prefers-reduced-motion`, all of this becomes instant changes.
- **Light mode** applies to the list page only. The game view always stays dark.

---

## 9. Error and edge cases

| Case | Behaviour |
|---|---|
| Upstream 5xx, timeout, or schema mismatch (Zod fails) | Serve the last cached payload with `stale: true`. Log the error with the event ID. The UI shows a "Delayed" badge. |
| Unknown or expired `eventId` | 404 page with a link back to the list |
| Game postponed or suspended (`status.type.name`) | Badge showing the status text. Polling drops to 5min. |
| Overtime | The chart's x-axis extends. Label the period "OT". |
| Tie (NFL regular season) | Display a `tie` segment only when it is greater than 1%. |
| The two teams' colours clash | §3.2 G9 |
| Missing logo | Monogram fallback: the abbreviation inside a team-coloured circle |
| Very large NCAAF slate | The list is virtualised once it exceeds 40 cards |

---

## 10. Testing plan

| Layer | What | Tool |
|---|---|---|
| Unit | Odds conversion and de-vig, colour ΔE and contrast, ESPN → normalised mappers (built from recorded fixtures of `pre`, `in` and `post` games, plus OT and postponed) | Vitest |
| Contract | Zod schemas run against **live** ESPN endpoints in a daily scheduled CI job. Alert when ESPN's shape changes. | Vitest + GitHub Actions cron |
| Integration | Route handlers with MSW-mocked upstreams: cache TTLs, stale fallback, the `since` parameter | Vitest + MSW |
| E2E | List → select → game view. Bar animates on a mocked probability change. Fullscreen toggles. Empty state. 404. | Playwright |
| Visual | Game view snapshots at 375px, 1280px and 2560px for one live and one final game | Playwright screenshots |
| Accessibility | axe checks on both pages; keyboard-only navigation | `@axe-core/playwright` |
| Manual | Watch a real Sunday slate end-to-end and confirm the `situation.lastPlay.probability` field from §2.4 | — |

**Fixtures:** add `scripts/record-fixtures.ts`, which saves current scoreboard and summary JSON into `tests/fixtures/`. Run it during a live game day to capture `in`-state payloads.

---

## 11. Milestones

| Phase | Deliverable | Done when |
|---|---|---|
| **0. Spike** (½ day) | Record ESPN fixtures during a live game. Confirm the live probability fields. | Fixtures are committed, and the "To verify" item in §2.4 is resolved |
| **1. MVP** | NFL only: list page, game view with bar and percentages, ESPN adapter, polling, caching | A real live NFL game shows updating probability within 15s of ESPN |
| **2. Polish** | Timeline chart, swing indicator, market strip, fullscreen and TV mode, NCAAF and search, accessibility pass, all tests | Every requirement in §3 is met. CI is green. |
| **3. Optional** | Redis shared cache; SSE push; a second data source if ESPN becomes unreliable | — |

---

## 12. Configuration

```
ESPN_USER_AGENT="FootballOdds/1.0 (+contact email)"
CACHE_TTL_LIVE_S=5
CACHE_TTL_LIST_S=15
```

## 13. Open questions

None. Resolved decisions are recorded as A1, A5 and A6 in §1.
