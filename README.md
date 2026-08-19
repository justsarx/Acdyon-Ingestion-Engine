# Acdyon Ingestion Engine

> **Production-Grade Ingestion Service, Anti-Bot Detection Surface Mitigation & Resilience Architecture**  
> *Acdyon Technologies Engineering Assessment (Part 1 Track: Ingestion & Resilience Architecture + Sandbox Demo)*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.21-lightgrey.svg)](https://expressjs.com/)
[![Zod](https://img.shields.io/badge/Zod-3.24-purple.svg)](https://zod.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 📖 Table of Contents
1. [Overview & Highlights](#-overview--highlights)
2. [Project Layout](#-project-layout)
3. [Quick Start & Local Setup](#-quick-start--local-setup)
4. [API Endpoints & Live Demo](#-api-endpoints--live-demo)
5. [Resilience & Anti-Bot Surface Engineering](#-resilience--anti-bot-surface-engineering)
6. [Deployment Guide (Railway / Render)](#-deployment-guide-railway--render)
7. [Architectural Decisions](#-architectural-decisions)

---

## 🚀 Overview & Highlights

The **Acdyon Ingestion Engine** is a high-reliability, fault-tolerant ingestion microservice built with Node.js and TypeScript. It implements production-grade pacing algorithms, multi-strategy fallback parsing, and comprehensive anti-bot detection surface defenses.

### Key Capabilities:
* **Compliant Live Feed Ingestion**: Ingests live public RSS feeds (e.g. WeWorkRemotely RSS) with token-bucket sub-second pacing and Zod schema contract validation.
* **Multi-Strategy Resilient HTML Parser**: Tiered selector fallback (`JSON-LD / Schema.org` $\rightarrow$ `data-testid` $\rightarrow$ `Semantic CSS` $\rightarrow$ `Structural Proximity`) that survives markup and class-name changes.
* **Detection Surface Defense**: Curated browser profile matrix enforcing strict coherence between `User-Agent` and Client Hints (`Sec-CH-UA`).
* **Pacing & Circuit Breaker Engine**: Token Bucket rate-limiter coupled with exponential backoff and randomized $\pm 25\%$ Full Jitter to eliminate thundering herds.
* **Honeypot & Soft-Block Diagnostics**: Analyzes byte-length thresholds and regex patterns to catch HTTP 200 OK anti-bot challenges.
* **Sandbox Verification Suite**: Built-in mock target server simulating rate limits (HTTP 429), obfuscated CSS modules, and Cloudflare-style challenge shells.

---

## 📁 Project Layout

```
acdyon-ingestion-engine/
├── docs/
│   └── architecture.md       # Complete 4-criteria architectural document & Mermaid diagrams
├── src/
│   ├── config/
│   │   └── user-agents.ts    # Curated UA pool, TLS & Sec-CH-UA header presets
│   ├── ingestion/
│   │   ├── rss-fetcher.ts    # Low-risk compliant RSS/Atom fetcher (Primary live demo)
│   │   ├── HTML-parser.ts   # Robust parser with tiered selector fallback & diagnostics
│   │   └── rate-limiter.ts  # Token-bucket pacing engine, jitter & circuit breaker
│   ├── server.ts             # Express API serving ingestion endpoints + web dashboard
│   └── sandbox-server.ts     # Mock target server simulating dynamic blocking & honeypots
├── .gitignore
├── DECISIONS.md              # 1-page architectural decisions & trade-offs document
├── package.json
├── tsconfig.json
└── README.md
```

---

## ⚡ Quick Start & Local Setup

### Prerequisites
* Node.js (v18+ or v20+)
* npm (v9+)

### Installation & Run

```bash
# 1. Clone repository
git clone https://github.com/your-org/acdyon-ingestion-engine.git
cd acdyon-ingestion-engine

# 2. Install dependencies
npm install

# 3. Build TypeScript
npm run build

# 4. Start the engine & web console
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser to access the interactive web dashboard.

---

## 📡 API Endpoints & Live Demo

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/` | `GET` | Interactive Visual Dashboard with live stream testing console |
| `/api/jobs` | `GET` | Ingests live jobs from public RSS feed (Query params: `feed`, `limit`) |
| `/api/scrape-sandbox` | `GET` | Executes resilient scraper against sandbox targets (`?target=standard\|obfuscated\|honeypot`) |
| `/api/health` | `GET` | Reports uptime, circuit breaker status, token bucket availability, and compliance metrics |
| `/sandbox/mock-jobs` | `GET` | Mock careers portal with Schema.org JSON-LD and `data-testid` attributes |
| `/sandbox/mock-jobs-obfuscated` | `GET` | Obfuscated HTML page with randomized CSS classes |
| `/sandbox/mock-honeypot` | `GET` | HTTP 200 OK Cloudflare challenge trap for diagnostic testing |
| `/sandbox/robots.txt` | `GET` | Mock robots.txt with `Crawl-delay: 2` directive |

### Sample Response (`GET /api/jobs?limit=2`)
```json
{
  "status": "success",
  "source": "WeWorkRemotely RSS",
  "feedUrl": "https://weworkremotely.com/remote-jobs.rss",
  "durationMs": 312,
  "totalParsed": 50,
  "timestamp": "2026-08-19T08:55:00.000Z",
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

## 🛡️ Resilience & Anti-Bot Surface Engineering

### 1. Token Bucket Pacing with $\pm 25\%$ Full Jitter
Requests are dispatched through an in-memory token bucket ($C=5$, $r=2/\text{sec}$). Exponential retries compute randomized jitter:
$$\Delta t_{\text{backoff}} = \min(t_{\max},\, t_{\text{initial}} \times 2^{\text{attempt}}) \times (0.75 + \text{random}() \times 0.50)$$

### 2. Tiered Selector Resiliency
1. **Strategy 0**: Schema.org JSON-LD structured data (`<script type="application/ld+json">`).
2. **Strategy 1**: Developer contracts (`[data-testid="job-card"]`).
3. **Strategy 2**: Semantic class names (`.job-card`, `.job-title`).
4. **Strategy 3**: Structural proximity and keyword density (`h2` inside container with job keywords).

### 3. Zod Contract Validation
Every extracted record is strictly parsed via `JobListingSchema`. Incomplete or malformed items are safely discarded to protect downstream ETL pipelines.

---

## 🌐 Deployment Guide (Railway / Render)

### Railway Deployment
1. Connect your GitHub repository to [Railway.app](https://railway.app).
2. Set Build Command: `npm install && npm run build`
3. Set Start Command: `npm start`
4. Set Environment Variable: `PORT=3000` (automatically supplied by Railway)

### Render Free Tier Deployment
1. Create a new **Web Service** on [Render](https://render.com).
2. Select **Node** environment.
3. Build Command: `npm install && npm run build`
4. Start Command: `npm start`

---

## 📜 Architectural Decisions

Refer to [DECISIONS.md](file:///home/justsarx/acdyon/DECISIONS.md) and [docs/architecture.md](file:///home/justsarx/acdyon/docs/architecture.md) for full architectural documentation, design trade-offs, and detection surface mapping.
