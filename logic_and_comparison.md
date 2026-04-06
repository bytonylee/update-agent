# OpenCLI vs last30days: How They Track X.com Posts

## 1. OpenCLI — X.com Post Tracking Logic

OpenCLI uses **your Chrome browser session directly** via CDP (Chrome DevTools Protocol). It piggybacks on your logged-in X.com cookies.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        OpenCLI Architecture                         │
│                                                                     │
│  ┌──────────┐  Chrome     ┌────────────┐  page.evaluate()          │
│  │ Your     │  DevTools   │ OpenCLI    │  (runs JS inside Chrome)  │
│  │ Chrome   │◄═══════════►│ TypeScript │                           │
│  │ Browser  │  Protocol   │ CLI Engine │                           │
│  │ (logged  │  (CDP)      │            │                           │
│  │  in to X)│             └─────┬──────┘                           │
│  └──────────┘                   │                                   │
│       ▲                         │ Two strategies:                   │
│       │ reuses                  ├──────────────────┐                │
│       │ session                 ▼                  ▼                │
│  ┌────┴─────┐         ┌──────────────┐    ┌──────────────┐        │
│  │ ct0 CSRF │         │  COOKIE      │    │  INTERCEPT   │        │
│  │ cookie   │         │  Strategy    │    │  Strategy    │        │
│  └──────────┘         └──────┬───────┘    └──────┬───────┘        │
│                              │                    │                 │
│                              ▼                    ▼                 │
│              ┌─────────────────────┐  ┌───────────────────────┐   │
│              │ Direct GraphQL      │  │ Monkey-patch fetch()  │   │
│              │ fetch() in browser  │  │ → SPA navigate        │   │
│              │                     │  │ → capture API calls   │   │
│              │ /i/api/graphql/     │  │ → collect responses   │   │
│              │  {queryId}/         │  │                       │   │
│              │  UserByScreenName   │  │ Used for: search      │   │
│              │  HomeTimeline       │  │                       │   │
│              │  HomeLatestTimeline │  └───────────────────────┘   │
│              └─────────────────────┘                               │
│                       │                                            │
│                       ▼                                            │
│              ┌─────────────────────┐                               │
│              │ Dynamic queryId     │                               │
│              │ resolution:         │                               │
│              │ 1. GitHub JSON      │                               │
│              │    (twitter-openapi)│                               │
│              │ 2. Parse X's JS     │                               │
│              │    bundles          │                               │
│              │ 3. Hardcoded        │                               │
│              │    fallback         │                               │
│              └─────────────────────┘                               │
│                                                                     │
│  Output: raw structured data (JSON rows)                           │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │ {id, author, text, likes, retweets, replies, views, url} │     │
│  └──────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

**Key characteristics:**

- **Per-command, point-in-time** -- each call returns current data, no history
- **Requires Chrome running** and logged into X
- **No API keys** -- uses your browser session cookies (`ct0` CSRF token)
- **queryId auto-resolution** -- survives X's frequent GraphQL endpoint rotations
- **Read AND write** -- can post, like, follow, delete, not just read

### Data flow (COOKIE strategy)

```
┌────────┐  page.goto  ┌────────┐  ct0 cookie  ┌───────┐
│Navigate├────────────►│Extract ├──────────────►│Build  │
│to x.com│             │ct0 CSRF│               │Headers│
└────────┘             └────────┘               └───┬───┘
                                                    │
┌────────┐  parse JSON  ┌────────┐  fetch()    ┌───▼───┐
│Return  │◄─────────────┤Parse   │◄────────────┤GraphQL│
│columns │              │response│              │query  │
└────────┘              └────────┘              └───────┘
```

### Data flow (INTERCEPT strategy -- search)

```
┌────────┐  goto     ┌──────────┐ pushState  ┌──────────┐
│Navigate├──────────►│Install   ├───────────►│SPA nav   │
│/explore│           │intercept │            │to /search│
└────────┘           └──────────┘            └────┬─────┘
                                                   │
┌────────┐  dedup    ┌──────────┐ autoScroll ┌────▼─────┐
│Return  │◄──────────┤Collect   │◄───────────┤Capture   │
│results │           │payloads  │            │API calls │
└────────┘           └──────────┘            └──────────┘
```

---

## 2. last30days -- X.com Post Tracking Logic

last30days has a **3-tier fallback cascade** for X search, none of which require a browser:

```
┌─────────────────────────────────────────────────────────────────────┐
│                      last30days Architecture                        │
│                                                                     │
│  ┌──────────────┐                                                  │
│  │ last30days.py│  Python orchestrator                             │
│  │ (main)       │  decides which X backend to use                  │
│  └──────┬───────┘                                                  │
│         │                                                           │
│         │ Priority cascade (tries in order):                       │
│         │                                                           │
│    ┌────┴──────────────────────────────────────────────────┐       │
│    │                                                        │       │
│    ▼ Tier 1              ▼ Tier 2              ▼ Tier 3    │       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │       │
│  │ bird_x.py    │  │scrapecreators│  │ xai_x.py         │ │       │
│  │              │  │_x.py         │  │                   │ │       │
│  │ Vendored     │  │              │  │ xAI Responses     │ │       │
│  │ Bird client  │  │ ScrapeCreat- │  │ API               │ │       │
│  │ (Node.js)    │  │ ors REST API │  │                   │ │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬────────────┘ │       │
│         │                  │                  │             │       │
│         ▼                  ▼                  ▼             │       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │       │
│  │ Twitter      │  │ scrapecreato │  │ api.x.ai/v1/     │ │       │
│  │ GraphQL API  │  │ rs.com/v1/   │  │ responses        │ │       │
│  │ (via cookies │  │ twitter/     │  │                   │ │       │
│  │  AUTH_TOKEN  │  │ search/tweets│  │ Uses x_search    │ │       │
│  │  + CT0 env)  │  │              │  │ tool w/ LLM to   │ │       │
│  │              │  │ Needs:       │  │ find+format      │ │       │
│  │ Needs:       │  │ SCRAPECREATO │  │ posts            │ │       │
│  │ AUTH_TOKEN + │  │ RS_API_KEY   │  │                   │ │       │
│  │ CT0 env vars │  │              │  │ Needs:           │ │       │
│  └──────────────┘  └──────────────┘  │ XAI_API_KEY      │ │       │
│                                       └──────────────────┘ │       │
│    └────────────────────────────────────────────────────────┘       │
│                         │                                           │
│                         ▼                                           │
│              ┌───────────────────────┐                              │
│              │ Normalize + Score     │                              │
│              │                       │                              │
│              │ - Canonical schema    │                              │
│              │ - Relevance scoring   │                              │
│              │   (token overlap)     │                              │
│              │ - Date-range filter   │                              │
│              │ - Engagement sort     │                              │
│              │ - Deduplication       │                              │
│              │ - Cross-platform      │                              │
│              │   signal detection    │                              │
│              └───────────┬───────────┘                              │
│                          │                                          │
│                          ▼                                          │
│              ┌───────────────────────┐                              │
│              │ AI Synthesis          │                              │
│              │ (Judge Agent)         │                              │
│              │                       │                              │
│              │ Merges X data with    │                              │
│              │ Reddit, YouTube,      │                              │
│              │ TikTok, HN, Poly-    │                              │
│              │ market, Bluesky,     │                              │
│              │ Truth Social, Web     │                              │
│              └───────────┬───────────┘                              │
│                          │                                          │
│                          ▼                                          │
│              ┌───────────────────────┐                              │
│              │ Cited research report │                              │
│              │ saved to ~/Documents/ │                              │
│              │ Last30Days/           │                              │
│              └───────────────────────┘                              │
└─────────────────────────────────────────────────────────────────────┘
```

**Key characteristics:**

- **Research-oriented** -- finds what people said about a topic in the last 30 days
- **No browser needed** -- uses API keys or env-var cookies
- **3 X backends** with automatic fallback
- **Read-only** -- never posts, likes, or modifies anything
- **Multi-source fusion** -- X is just 1 of 10+ sources

### Tier 1: bird_x.py (Vendored Bird Client)

```
┌──────────┐  subprocess  ┌──────────────────┐  Twitter
│ Python   ├─────────────►│ bird-search.mjs  ├─────────►  GraphQL
│ bird_x.py│  node ...    │ (vendored v0.8)  │  private    API
└──────────┘  --json      └──────────────────┘  API
     │
     │  On 0 results, retries:
     │  1. OR-groups: ("multi-agent" OR "agent sim")
     │  2. Shorter query: first 2 words
     │  3. Strongest token: longest non-noise word
     │
     ▼
  Normalized items with engagement metrics
```

### Tier 2: scrapecreators_x.py (REST API)

```
┌──────────────┐  GET /v1/twitter/   ┌──────────────────┐
│ Python       ├────────────────────►│ ScrapeCreators   │
│ requests lib │  search/tweets      │ API              │
└──────────────┘  ?query=...         └──────────────────┘
       │                                      │
       │  Post-processing:                    │
       │  - Date filter (from_date..to_date)  │
       │  - Engagement sort                   │
       │  - Token-overlap relevance scoring   │
       ▼
  Normalized items
```

### Tier 3: xai_x.py (LLM-Mediated)

```
┌──────────┐  POST /v1/responses  ┌──────────┐  x_search  ┌───────┐
│ Python   ├─────────────────────►│ xAI LLM  ├───────────►│ X.com │
│ xai_x.py │  tools: [x_search]  │ (Grok)   │  tool call │ data  │
└──────────┘  + structured prompt └──────────┘            └───────┘
                                        │
                                        │ LLM formats results
                                        │ as JSON {items: [...]}
                                        ▼
                                  Parsed + validated items
```

---

## 3. Head-to-Head Comparison

```
┌──────────────────┬────────────────────────┬────────────────────────────┐
│ Dimension        │ OpenCLI                │ last30days                 │
├──────────────────┼────────────────────────┼────────────────────────────┤
│ PURPOSE          │ CLI for X actions      │ Multi-source research      │
│                  │ (CRUD operations)      │ engine (read-only)         │
├──────────────────┼────────────────────────┼────────────────────────────┤
│ X ACCESS METHOD  │ CDP -> Chrome browser  │ 3-tier cascade:            │
│                  │ page.evaluate() runs   │  1. Bird (vendored Node)   │
│                  │ JS inside your tab     │  2. ScrapeCreators API     │
│                  │                        │  3. xAI Responses API      │
├──────────────────┼────────────────────────┼────────────────────────────┤
│ AUTH             │ Your Chrome login      │ ENV vars:                  │
│                  │ cookies (ct0 from      │  AUTH_TOKEN + CT0, or      │
│                  │ document.cookie)       │  SCRAPECREATORS_API_KEY,or │
│                  │                        │  XAI_API_KEY               │
├──────────────────┼────────────────────────┼────────────────────────────┤
│ BROWSER NEEDED?  │ YES (Chrome must be    │ NO (headless, pure         │
│                  │ running + logged in)   │ API / subprocess calls)    │
├──────────────────┼────────────────────────┼────────────────────────────┤
│ API SURFACE      │ Twitter private        │ Tier 1: Twitter private    │
│                  │ GraphQL (/i/api/       │   GraphQL (same as OpenCLI)│
│                  │ graphql/{queryId}/...) │ Tier 2: ScrapeCreators REST│
│                  │                        │ Tier 3: xAI Responses API  │
│                  │                        │   (LLM-mediated x_search) │
├──────────────────┼────────────────────────┼────────────────────────────┤
│ QUERY ID         │ Dynamic resolution:    │ Delegated to vendored      │
│ HANDLING         │  1. GitHub JSON        │ Bird client (handles       │
│                  │  2. Parse X JS bundles │ internally); ScrapeCreators│
│                  │  3. Hardcoded fallback │ & xAI don't need queryIds │
├──────────────────┼────────────────────────┼────────────────────────────┤
│ SEARCH STRATEGY  │ INTERCEPT: install     │ Bird: subprocess call with │
│                  │ fetch() monkey-patch,  │ query + since:DATE filter  │
│                  │ SPA-navigate to        │ + automatic retry with     │
│                  │ /search, capture       │ OR-groups and shorter      │
│                  │ SearchTimeline API     │ queries on 0 results       │
│                  │ responses              │                            │
├──────────────────┼────────────────────────┼────────────────────────────┤
│ DATE FILTERING   │ None built-in          │ Core feature: --days=N     │
│                  │ (returns whatever      │ enforced at query level    │
│                  │ timeline/search gives) │ (since:DATE) + post-filter │
├──────────────────┼────────────────────────┼────────────────────────────┤
│ SCORING /        │ None -- returns raw    │ Relevance scoring (token   │
│ RANKING          │ data as-is from X      │ overlap), engagement sort, │
│                  │                        │ near-duplicate detection,  │
│                  │                        │ cross-platform signals     │
├──────────────────┼────────────────────────┼────────────────────────────┤
│ CAN WRITE?       │ YES: post, like,       │ NO: read-only, never      │
│                  │ reply, follow, delete, │ modifies any content       │
│                  │ block, bookmark        │                            │
├──────────────────┼────────────────────────┼────────────────────────────┤
│ OTHER SOURCES    │ X only (per adapter)   │ 10+ sources: Reddit, YT,  │
│                  │ but has 60+ other      │ TikTok, Instagram, HN,    │
│                  │ platform adapters      │ Polymarket, Bluesky,      │
│                  │                        │ Truth Social, Web search  │
├──────────────────┼────────────────────────┼────────────────────────────┤
│ OUTPUT           │ Structured JSON rows   │ AI-synthesized research    │
│                  │ (tabular, per-command) │ report with citations +   │
│                  │                        │ engagement stats           │
├──────────────────┼────────────────────────┼────────────────────────────┤
│ LANGUAGE         │ TypeScript (Node)      │ Python + vendored Node     │
│                  │                        │ (for Bird client only)     │
├──────────────────┼────────────────────────┼────────────────────────────┤
│ RESILIENCE       │ Single path; fails if  │ 3-tier fallback + query    │
│                  │ queryId expires or     │ retry (OR-groups, shorter  │
│                  │ Chrome not running     │ terms, strongest token)    │
└──────────────────┴────────────────────────┴────────────────────────────┘
```

---

## 4. Summary

- **OpenCLI** = "Swiss army knife for X" -- direct browser control, full CRUD, raw data, point-in-time, single-platform-per-command
- **last30days** = "Research analyst" -- API-based, read-only, multi-backend fallback, scores/dedupes/ranks results, fuses X with 10+ other sources into a cited report
