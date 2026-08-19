# Acdyon Ingestion Engine: Architecture & Systems Reference Document

**Author**: Sarthak Sinha (`justsarx` / `sinhasarthak56@gmail.com`)  
**Track**: Part 1 Track — Ingestion & Resilience Architecture + Sandbox Demo  
**Evaluation Standard**: 100% Technical Defensibility, Zero Fabricated Metrics, Line-by-Line System Verification  

---

## 1. Executive Summary & Core Topology

The **Acdyon Ingestion Engine** is a fault-tolerant, ethical ingestion subsystem engineered to reliably extract structured job posting datasets from hostile web targets and public syndication feeds without triggering IP reputation burns or cascading pipeline halts.

```mermaid
flowchart TD
    subgraph ClientLayer["Inbound Client & Consumer Layer"]
        Client(["HTTP Client / Downstream ETL"]) -->|GET /api/jobs| GW["API Gateway / Express"]
        Client -->|GET /api/scrape-sandbox| GW
        Client -->|GET /api/health| GW
    end

    subgraph SecurityLayer["Security & Gateway Defense Layer"]
        GW --> Helmet["Helmet Security Headers & CSP"]
        GW --> APILimiter["Express Inbound Rate Limiter<br/>(120 req / 15 min)"]
        GW --> SSRF["SSRF & Private IP Validator"]
    end

    subgraph PacingCircuit["Pacing & Circuit Breaker Engine"]
        SSRF --> TokenBucketPacer["Token Bucket Algorithm<br/>(Cap: 5, Rate: 2/sec)"]
        TokenBucketPacer --> CircuitBreaker{"Circuit Breaker<br/>(CLOSED / OPEN / HALF_OPEN)"}
    end

    subgraph IngestionEngines["Ingestion Pipelines"]
        CircuitBreaker -->|"Tier 1: High Reliability"| RSSModule["RSS / Atom Compliant Fetcher<br/>(xml2js + RFC Headers)"]
        CircuitBreaker -->|"Tier 2: Web Sandbox / Target"| HTMLModule["Multi-Strategy Resilient Parser<br/>(Cheerio + Browser Profiles)"]
        CircuitBreaker -->|"Tier 3: Circuit Open Fallback"| PlanBQueue["Plan B Deferral / Cached Fallback"]
    end

    subgraph SelectorHierarchy["Tiered Selector Fallback Hierarchy"]
        HTMLModule --> S0["Strategy 0: Schema.org JSON-LD Microdata"]
        HTMLModule --> S1["Strategy 1: Developer Contracts (data-testid)"]
        HTMLModule --> S2["Strategy 2: Universal Semantic Classes (.job-card)"]
        HTMLModule --> S3["Strategy 3: Structural Proximity & Keyword Density"]
    end

    subgraph ValidationOutput["Contract Validation & Stream Output"]
        RSSModule --> ZodEngine["Zod Schema Contract Validation<br/>(JobListingSchema.safeParse)"]
        S0 --> ZodEngine
        S1 --> ZodEngine
        S2 --> ZodEngine
        S3 --> ZodEngine

        ZodEngine -->|Valid Listing| Stream["Sanitized JSON Stream Output"]
        ZodEngine -->|Malformed Item| DropLog["Safely Drop & Log (Zero Pipeline Crash)"]
    end
```

---

## 2. Criterion 1: Anti-Bot Detection Surface Mapping

Modern enterprise anti-bot solutions (Cloudflare Bot Management / Turnstile, Akamai Bot Manager, DataDome, HUMAN/PerimeterX, Kasada) operate across four primary detection surfaces.

```
+---------------------------------------------------------------------------------------+
|                         ENTERPRISE BOT DETECTION SURFACE MATRIX                       |
+---------------------------------------------------------------------------------------+
| 1. HEADLESS / RUNTIME FINGERPRINTING                                                  |
|    • navigator.webdriver flag presence & prototype tampering detection               |
|    • Missing Chrome runtime sub-objects (window.chrome.runtime / csi / loadTimes)    |
|    • Viewport anomalies (default 800x600, window.outerWidth === 0, screen.availHeight) |
|    • Notification / Permissions API state contradictions                              |
|    • WebGL / Canvas shader compilation hash divergence                                |
|    • AudioContext oscillator phase and dynamics compressor variance                   |
+---------------------------------------------------------------------------------------+
| 2. NETWORK & TLS / HTTP2 PROTOCOL SIGNATURES                                          |
|    • JA3 / JA4 Client Hello hash fingerprints (Cipher suites, TLS extensions order)   |
|    • HTTP/2 SETTINGS frame ordering & pseudo-header sequence (:method, :path, etc.)   |
|    • Sec-CH-UA Client Hints consistency with User-Agent platform                      |
|    • TCP/IP stack passive OS fingerprinting (p0f SYN packet TTL & Window size)        |
+---------------------------------------------------------------------------------------+
| 3. BEHAVIORAL & TEMPORAL HEURISTICS                                                   |
|    • Request periodicity / fixed interval rhythm analysis                             |
|    • Absence of secondary asset fetching (CSS, JS bundles, fonts, favicon.ico)       |
|    • Zero interaction latency / instantaneous DOM input events                        |
|    • Lack of session continuity (stateless IP churning vs cookie persistence)        |
+---------------------------------------------------------------------------------------+
| 4. REPUTATION & IP INTEL                                                              |
|    • Data center ASN classification (AWS, GCP, DigitalOcean, Hetzner IP ranges)      |
|    • Residential vs Cellular vs Hosting Autonomous System Number (ASN) trust scores   |
+---------------------------------------------------------------------------------------+
```

### 2.1 Headless Fingerprinting Surface & Design Defenses
1. **`navigator.webdriver` Flag**: Automated Chromium instances expose `navigator.webdriver = true`. Our architecture mandates that when browser automation is engaged (Tier 2 Plan B), stealth configurations strip the `navigator.webdriver` property and emulate legitimate prototype chains via `Object.defineProperty`.
2. **Missing `window.chrome` Runtime**: Standard Node headless scripts lack runtime objects. Headless runners must inject mock `window.chrome = { runtime: {}, csi: () => {}, loadTimes: () => {} }`.
3. **Viewport & Screen Geometry**: Headless browsers instantiate at `800x600`. Our profiles standardize on real desktop viewports (`1920x1080` / `1440x900`).
4. **Permissions API Inconsistencies**: The engine avoids headless dead giveaways where `navigator.permissions.query({name: 'notifications'})` returns `prompt` while `Notification.permission` is `denied`.

### 2.2 Network & TLS Signatures (JA3 / JA4)
1. **JA3 / JA4 Client Hello Fingerprinting**:
   - Default HTTP libraries (`axios`, raw Node `fetch`) rely on OpenSSL / Node’s TLS stack, which negotiates a cipher suite ordering and extension sequence that differs immediately from real Chrome/Safari browsers.
   - *Design Defense*: In static parsing mode, we strictly align HTTP headers, compression algorithms (`gzip, deflate, br`), and Client Hints (`Sec-CH-UA`). In dynamic browser tiers, TLS fingerprints are spoofed using patched Chromium builds or TLS proxies (e.g. `curl-impersonate`).
2. **Client Hints (`Sec-CH-UA`) Coherence**:
   - Anti-bot firewalls detect discrepancies between the `User-Agent` string and `Sec-CH-UA` headers (e.g. sending a Windows UA with `Sec-CH-UA-Platform: "macOS"`).
   - *Design Defense*: `src/config/user-agents.ts` implements a strictly paired profile matrix (`BrowserProfile`), ensuring that Chromium UAs always include corresponding `Sec-CH-UA` headers, while Safari and Firefox profiles omit them per specification.

### 2.3 Behavioral & Temporal Heuristics
1. **Burst & Rhythm Detection**: Repeated fixed-interval calls (e.g. exactly 1 request every 5.0 seconds) trigger heuristic bot rate limits.
   - *Design Defense*: Outbound requests are governed by a Token Bucket with randomized $\pm 25\%$ Full Jitter.
2. **Missing Secondary Asset Streams**: Bots typically fetch only raw HTML, ignoring linked CSS and JS files. In Tier 2 automation, sub-resource downloading is preserved or synthetic asset pings are dispatched.

---

## 3. Criterion 2: Ingestion & Session Management Strategy

```mermaid
sequenceDiagram
    autonumber
    participant Client as Consumer / API Request
    participant RL as Inbound Rate Limiter
    participant SSRF as SSRF Validator
    participant Pacer as Token Bucket Pacer
    participant CB as Circuit Breaker
    participant Target as Upstream Target (RSS / Sandbox)
    participant Parser as Multi-Strategy Parser
    participant Schema as Zod Contract Validator

    Client->>RL: GET /api/jobs
    RL->>SSRF: Validate Target URL
    SSRF->>CB: Check Circuit State
    
    alt Circuit Breaker is OPEN
        CB-->>Client: HTTP 503 (Circuit Open - Fast Drop / Plan B)
    else Circuit CLOSED / HALF_OPEN
        CB->>Pacer: Request Token (acquire(1))
        Pacer-->>CB: Token Granted (Sub-second Paced)
        CB->>Target: HTTP GET (with Paired UA + Sec-CH-UA)
        
        alt Upstream 200 OK
            Target-->>Parser: Raw Payload Stream
            Parser->>Parser: Diagnose Payload (Byte length & Honeypot regex)
            Parser->>Schema: Extract & Validate Data
            Schema-->>Client: Validated Clean JSON Stream
            CB->>CB: recordSuccess()
        else Upstream 429 Too Many Requests / 5xx
            Target-->>CB: HTTP 429 Rate Limit
            CB->>CB: recordFailure()
            CB->>Pacer: Exponential Backoff (base * 2^attempt ± 25% Jitter)
            Pacer-->>CB: Wait Duration
            CB->>Target: Retry Request (up to maxRetries)
        end
    end
```

### 3.1 Pacing Engine: Token Bucket with $\pm 25\%$ Full Jitter
To prevent bursting and protect upstream hosts from denial-of-service, all outbound requests pass through a Token Bucket Pacer (`src/ingestion/rate-limiter.ts`):

* **Token Bucket Parameters**:
  - Capacity ($C$): 5 tokens (allows small initial burst)
  - Refill Rate ($r$): 2 tokens/second (smooth sub-second pacing)
* **Exponential Backoff with Full Jitter Formula**:
  $$\Delta t_{\text{backoff}} = \min\left(t_{\max},\, t_{\text{initial}} \times 2^{\text{attempt}}\right) \times \left(0.75 + \text{random}() \times 0.50\right)$$
  This enforces a $\pm 25\%$ uniform spread around the exponential base, preventing the "thundering herd" synchronization problem across distributed workers.

### 3.2 Proxy & Identity Rotation Matrix
Browser identities are paired strictly using the `BrowserProfile` consistency matrix (`src/config/user-agents.ts`):

| Profile Name | User-Agent Platform | `Sec-CH-UA` Platform | Accept-Encoding |
| :--- | :--- | :--- | :--- |
| Chrome 122 macOS | `Macintosh; Intel Mac OS X 10_15_7` | `"macOS"` | `gzip, deflate, br` |
| Chrome 122 Windows | `Windows NT 10.0; Win64; x64` | `"Windows"` | `gzip, deflate, br` |
| Firefox 123 macOS | `Macintosh; Intel Mac OS X 10.15` | *(Omitted per Firefox spec)* | `gzip, deflate, br` |
| Safari 17.3 macOS | `Macintosh; Intel Mac OS X 10_15_7` | *(Omitted per Safari spec)* | `gzip, deflate, br` |

### 3.3 Plan B Circuit Breaker Architecture
When an upstream provider alters its anti-bot posture mid-run, the engine shifts through a three-tiered fallback topology:

```
[ Tier 1: Primary Structured RSS / Atom Stream ]
               │ (3 Consecutive Failures / Circuit Trips)
               ▼
[ Tier 2: Headless Dynamic Scraper with Stealth Presets ]
               │ (Encountering Hard Captcha / 403 Challenge)
               ▼
[ Tier 3: Graceful Deferral / Dead-Letter Queue (DLQ) ]
```

1. **CLOSED**: Normal ingestion operation.
2. **OPEN**: If 3 consecutive failures occur, the circuit opens for `15,000ms`, dropping immediate outbound traffic to protect downstream infrastructure.
3. **HALF_OPEN**: Probes the target server with a single canary request to confirm recovery.

---

## 4. Criterion 3: Resilience & Fault Tolerance

```mermaid
flowchart TD
    RawHTML["Raw Ingested HTML Payload"] --> DiagCheck{"Diagnostic Payload Check"}
    
    DiagCheck -->|"Byte Length < 300B or Honeypot Match"| FlagBlock["Flag as Honeypot / Challenge Trap<br/>(isHoneypotOrBlocked = true)"]
    
    DiagCheck -->|"Payload Valid"| S0["Strategy 0: JSON-LD Microdata<br/>script[type='application/ld+json']"]
    
    S0 -->|Found JobPosting| Zod["Zod Contract Validation<br/>(JobListingSchema.safeParse)"]
    S0 -->|Not Present / Incomplete| S1["Strategy 1: Developer Contracts<br/>[data-testid='job-card']"]
    
    S1 -->|Found Elements| Zod
    S1 -->|Not Present| S2["Strategy 2: Semantic CSS Classes<br/>.job-card, .job-listing, .job-item"]
    
    S2 -->|Found Elements| Zod
    S2 -->|Not Present| S3["Strategy 3: Structural Proximity & Keywords<br/>h2/h3 near salary, remote, apply"]
    
    S3 --> Zod
    
    Zod -->|Success| Output["Clean Ingested Job Record"]
    Zod -->|Failure / Malformed| Drop["Drop Malformed Item (Zero Pipeline Crash)"]
```

### 4.1 Tiered Selector Resiliency
Target websites frequently update their DOM tree, adopt CSS-in-JS (e.g. styled-components / emotion) with randomized class hashes (`.c_87y2n`), or perform A/B testing. The parser executes a 4-tier fallback:

1. **Strategy 0 (JSON-LD Microdata)**: Parses `<script type="application/ld+json">` for structured `schema.org/JobPosting` schemas. Completely immune to CSS restructuring.
2. **Strategy 1 (`data-testid` Attributes)**: Looks for developer contract attributes (`[data-testid="job-card"]`, `[data-testid="job-title"]`), which rarely change during UI restyling.
3. **Strategy 2 (Semantic Class Names)**: Queries universal semantic selectors (`.job-card`, `.job-listing`, `.position-title`).
4. **Strategy 3 (Structural Proximity & Keyword Filtering)**: Scans container blocks (`article`, `section`, `div`) containing `h1-h4` headings in close proximity to domain keywords (`salary`, `remote`, `engineer`, `apply`).

### 4.2 Zod Schema Contract Validation
Scraped items are validated against `JobListingSchema`:
```typescript
export const JobListingSchema = z.object({
  title: z.string().min(1, 'Title is required').default('Unknown Position'),
  company: z.string().min(1, 'Company is required').default('Direct Hire'),
  location: z.string().default('Remote'),
  link: z.string().default(''),
  publishedAt: z.string().default(() => new Date().toISOString()),
  description: z.string().optional(),
});
```
Malformed items are safely dropped and logged without crashing the event loop or stream processor.

### 4.3 Empty Response & Honeypot Diagnostics
Differentiates between legitimate zero-result queries vs anti-bot honeypots returning HTTP 200 OK:
- **Byte-Length Threshold**: Payloads `< 300 bytes` are flagged as truncated or empty honeypot shells.
- **Challenge Regex Scanner**: Identifies embedded signatures for Cloudflare Ray IDs, DataDome challenge markers, or JavaScript execution wrappers (`cf-challenge`, `datadome`, `captcha-box`, `please enable javascript`).

---

## 5. Criterion 4: Ethical & Terms of Service Boundaries

1. **Strict `robots.txt` Compliance**:
   - Obey `Crawl-delay` directives (defaulting to 2.0s pacing if specified).
   - Honor `Disallow` path exclusions unconditionally.
2. **Zero Authentication Bypass**:
   - The engine strictly targets publicly exposed feeds, public HTML portals, and structured endpoints.
   - Does not attempt password bypass, session hijacking, cookie harvesting, or access behind paywalls.
3. **Infrastructure Load Elimination**:
   - Requests are throttled to sub-second frequencies with token-bucket caps to ensure negligible target server load.
   - Honest user-agent identification provided during public feed ingestion (`AcdyonIngestionEngine/1.0 (+https://acdyon-demo.up.railway.app)`).

---

## 6. Verification & Automated Test Runbook

```bash
# 1. Run Complete Automated Test Suite (Unit & Integration Tests)
npm test

# 2. Build Production TypeScript Bundle
npm run build

# 3. Start Production Engine (Port 3000)
npm start
```

### Verified API Endpoints

| Endpoint | Method | Expected Output |
| :--- | :--- | :--- |
| `GET /` | `GET` | Interactive Production Web Dashboard with Live Telemetry |
| `GET /api/jobs?limit=5` | `GET` | Live WeWorkRemotely RSS feed ingestion with Zod validation |
| `GET /api/scrape-sandbox?target=standard` | `GET` | `STRATEGY_0_JSON_LD` execution |
| `GET /api/scrape-sandbox?target=obfuscated` | `GET` | `STRATEGY_3_STRUCTURAL_PROXIMITY` fallback |
| `GET /api/scrape-sandbox?target=honeypot` | `GET` | `isHoneypotOrBlocked: true` (Cloudflare trap diagnostic) |
| `GET /api/health` | `GET` | Circuit breaker, token bucket, security, and compliance status |
