# Acdyon Ingestion Engine

> **Production-Grade Ingestion Subsystem, Anti-Bot Detection Surface Mitigation & Resilience Architecture**  
> *Acdyon Technologies Engineering Assessment (Part 1 Track: Ingestion & Resilience Architecture + Sandbox Demo)*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.21-lightgrey.svg)](https://expressjs.com/)
[![Zod](https://img.shields.io/badge/Zod-3.24-purple.svg)](https://zod.dev/)
[![Security: Hardened](https://img.shields.io/badge/Security-Helmet%20%7C%20SSRF%20Defense-emerald.svg)](https://github.com/helmetjs/helmet)
[![Tests: 10/10 Passing](https://img.shields.io/badge/Tests-10%2F10%20Passing-brightgreen.svg)](tests/engine.test.ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 📖 Table of Contents
1. [Overview & Architectural Pillars](#-overview--architectural-pillars)
2. [Repository Structure](#-repository-structure)
3. [Quick Start & Local Execution](#-quick-start--local-execution)
4. [Automated Test Suite (10 Passing Tests)](#-automated-test-suite-10-passing-tests)
5. [API Endpoints & Visual Dashboard](#-api-endpoints--visual-dashboard)
6. [Security & Anti-Bot Surface Engineering](#-security--anti-bot-surface-engineering)
7. [Production Docker & Cloud Deployment (Railway / Render)](#-production-docker--cloud-deployment-railway--render)
8. [Mandatory Documentation Links](#-mandatory-documentation-links)

---

## 🚀 Overview & Architectural Pillars

The **Acdyon Ingestion Engine** is an enterprise-grade ingestion microservice built with Node.js and TypeScript. It implements robust pacing algorithms, tiered selector fallback parsing, proactive anti-bot detection surface defenses, and SSRF security hardening.

### Key Capabilities:
* **Compliant Live Feed Ingestion**: Ingests live public RSS feeds (e.g. WeWorkRemotely RSS) with token-bucket sub-second pacing and Zod runtime schema contract validation.
* **Multi-Strategy Resilient HTML Parser**: 4-Tiered selector fallback (`JSON-LD / Schema.org` $\rightarrow$ `data-testid` $\rightarrow$ `Semantic CSS` $\rightarrow$ `Structural Proximity`) that survives markup shifts and CSS-in-JS hash obfuscation.
* **Detection Surface Defense**: Curated browser profile matrix enforcing strict coherence between `User-Agent` and Client Hints (`Sec-CH-UA`).
* **Pacing & Circuit Breaker Engine**: Token Bucket rate-limiter coupled with exponential backoff and randomized $\pm 25\%$ Full Jitter to eliminate thundering herds.
* **Honeypot & Soft-Block Diagnostics**: Analyzes byte-length thresholds ($< 300\text{B}$) and regex patterns to catch HTTP 200 OK anti-bot challenges (Cloudflare / DataDome / PerimeterX).
* **Enterprise Security Standards**: Helmet HTTP security headers, inbound Express API rate-limiting, and strict SSRF / private IP range validation.
* **Sandbox Verification Suite**: Built-in mock target server simulating rate limits (HTTP 429), obfuscated CSS modules, and Cloudflare-style challenge shells.

---

## 📁 Repository Structure

```
acdyon-ingestion-engine/
├── docs/
│   └── architecture.md       # Complete 4-criteria architectural document & Mermaid diagrams
├── src/
│   ├── config/
│   │   └── user-agents.ts    # Curated UA pool, TLS & Sec-CH-UA header presets
│   ├── ingestion/
│   │   ├── rss-fetcher.ts    # Low-risk compliant RSS/Atom fetcher with Zod validation
│   │   ├── HTML-parser.ts   # Robust parser with tiered selector fallback & diagnostics
│   │   └── rate-limiter.ts  # Token-bucket pacing engine, jitter & circuit breaker
│   ├── utils/
│   │   └── security.ts       # SSRF validator, private IP defense, string sanitization
│   ├── server.ts             # Production Express API gateway + visual web dashboard
│   └── sandbox-server.ts     # Mock target server simulating dynamic blocking & honeypots
├── tests/
│   └── engine.test.ts        # Comprehensive 10-point unit & integration test suite
├── .dockerignore
├── .gitignore
├── DECISIONS.md              # Concise 1-page mandatory decisions document
├── Dockerfile                # Multi-stage hardened non-root production container
├── docker-compose.yml        # One-click Docker container orchestrator
├── package.json
├── tsconfig.json
├── architecture_reference.md # Full architectural reference & systems specification
└── README.md
```

---

## ⚡ Quick Start & Local Execution

### Prerequisites
* Node.js (v18+, v20+, or v22+)
* npm (v9+)

### Installation & Run

```bash
# 1. Clone repository
git clone https://github.com/your-org/acdyon-ingestion-engine.git
cd acdyon-ingestion-engine

# 2. Install dependencies
npm install

# 3. Build TypeScript bundle
npm run build

# 4. Start the engine & visual console (Port 3000)
npm start
```

Visit **[http://localhost:3000](http://localhost:3000)** in your browser to view the visual systems dashboard.

---

## 🧪 Automated Test Suite (10 Passing Tests)

Run the full automated test suite covering pacing, circuit breakers, multi-strategy parsing, honeypot diagnostics, Zod validation, and SSRF security:

```bash
npm test
```

### Test Coverage Summary:
```
✔ 1. Rate Limiter: Token Bucket acquisition and pacing
✔ 2. Rate Limiter: Exponential backoff with ±25% jitter bounds
✔ 3. Circuit Breaker: State transitions (CLOSED -> OPEN -> HALF_OPEN)
✔ 4. HTML Parser: Strategy 0 (JSON-LD Microdata)
✔ 5. HTML Parser: Strategy 1 (data-testid attributes)
✔ 6. HTML Parser: Strategy 3 (Structural Proximity & Keyword Density Fallback)
✔ 7. HTML Parser: Honeypot & Anti-Bot Challenge Detection
✔ 8. Zod Schema: Contract validation and malformed item rejection
✔ 9. Security: SSRF Validation and Private IP Defense
✔ 10. Browser Profiles: Client Hints & User-Agent pairing
```

---

## 📡 API Endpoints & Visual Dashboard

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/` | `GET` | Interactive Visual Dashboard with live stream testing console |
| `/api/jobs` | `GET` | Ingests live jobs from public RSS feed (Query params: `feed`, `limit`) |
| `/api/scrape-sandbox` | `GET` | Executes resilient scraper against sandbox targets (`?target=standard\|obfuscated\|honeypot`) |
| `/api/health` | `GET` | Reports uptime, circuit breaker status, token bucket availability, security, and compliance metrics |
| `/sandbox/mock-jobs` | `GET` | Mock careers portal with Schema.org JSON-LD and `data-testid` attributes |
| `/sandbox/mock-jobs-obfuscated` | `GET` | Obfuscated HTML page with randomized CSS classes |
| `/sandbox/mock-honeypot` | `GET` | HTTP 200 OK Cloudflare challenge trap for diagnostic testing |
| `/sandbox/robots.txt` | `GET` | Mock robots.txt with `Crawl-delay: 2` directive |

### Sample Response (`GET /api/jobs?limit=2`)
```json
{
  "status": "success",
  "source": "WeWorkRemotely RSS (Public Structured Feed)",
  "feedUrl": "https://weworkremotely.com/remote-jobs.rss",
  "durationMs": 342,
  "totalParsed": 100,
  "returnedCount": 2,
  "timestamp": "2026-08-19T16:20:00.000Z",
  "circuitBreaker": {
    "state": "CLOSED",
    "failureCount": 0,
    "failureThreshold": 3,
    "nextAttempt": null
  },
  "availableTokens": 4,
  "data": [
    {
      "title": "Senior Full-Stack Engineer",
      "company": "Automattic",
      "location": "Remote",
      "link": "https://weworkremotely.com/remote-jobs/...",
      "publishedAt": "Wed, 19 Aug 2026 07:00:00 +0000"
    }
  ]
}
```

---

## 🛡️ Security & Anti-Bot Surface Engineering

### 1. SSRF & Private IP Defense (`src/utils/security.ts`)
Validates all user-supplied URLs against private IP subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`) to block Server-Side Request Forgery (SSRF) and cloud metadata credential harvesting.

### 2. Token Bucket Pacing with $\pm 25\%$ Full Jitter (`src/ingestion/rate-limiter.ts`)
Outbound requests are throttled through an in-memory token bucket ($C=5$, $r=2/\text{sec}$). Exponential retries calculate uniform jitter:
$$\Delta t_{\text{backoff}} = \min(t_{\max},\, t_{\text{initial}} \times 2^{\text{attempt}}) \times (0.75 + \text{random}() \times 0.50)$$

### 3. Tiered Selector Resiliency (`src/ingestion/HTML-parser.ts`)
1. **Strategy 0**: Schema.org JSON-LD structured data (`<script type="application/ld+json">`).
2. **Strategy 1**: Developer contracts (`[data-testid="job-card"]`).
3. **Strategy 2**: Semantic class names (`.job-card`, `.job-title`).
4. **Strategy 3**: Structural proximity and keyword density (`h2` inside container with job keywords).

---

## 🐳 Production Docker & Cloud Deployment (Railway / Render)

### Running via Docker
```bash
# Build and run containerized service
docker-compose up --build
```

### Deploying to Railway
1. Push this repository to GitHub.
2. Link your repository in [Railway.app](https://railway.app).
3. Railway automatically detects `package.json` / `Dockerfile` and deploys the service on port 3000.

### Deploying to Render (Free Web Service)
1. Create a new **Web Service** on [Render](https://render.com).
2. Set Build Command: `npm install && npm run build`
3. Set Start Command: `npm start`

---

## 📜 Mandatory Documentation Links

* **[DECISIONS.md](file:///home/justsarx/acdyon/DECISIONS.md)**: 1-Page Mandatory Decisions Document (Strategy Choice, 1-Week Trade-Offs, AI Verification).
* **[architecture_reference.md](file:///home/justsarx/acdyon/architecture_reference.md)**: Full Systems Design & Anti-Bot Detection Surface Mapping Specification.
* **[assessment.md](file:///home/justsarx/acdyon/assessment.md)**: Original Assessment Prompt & Evaluation Criteria.
