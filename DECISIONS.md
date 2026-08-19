# Architectural Decisions (DECISIONS.md)

### 1. Ingestion Strategy Choice
**Chosen**: Public Structured RSS Feed Ingestion with HTTP Layer Pacing  
**Rejected**: Playwright/Puppeteer Direct Browser Automation against live anti-bot protected portals (e.g. LinkedIn/Naukri).  
**Reasoning**: Automated browser instances against live platforms violate ToS, trigger aggressive IP bans, and create fragile infrastructure dependent on reverse-engineering Cloudflare/Akamai challenges. Utilizing structured RSS/APIs guarantees 100% uptime, zero legal risk, clean semantic data parsing, and zero proxy overhead while demonstrating the complete ingestion architectural pattern.

### 2. Time-Limit Trade-offs
* **Current Implementation**: In-memory token-bucket pacing and fallback parsing.
* **With 1 Full Week**: Implement a distributed Redis-backed Celery/BullMQ task queue with IP rotation via residential proxy gateways (e.g., BrightData/Smartproxy), headless TLS fingerprint spoofing via `curl-impersonate`, and automated Schema Drift Alerts via LLM-assisted HTML parsing when CSS selectors break.

### 3. AI Tool Utilization & Verification
* **AI Assistance**: Used for boilerplating Express route setups and parsing initial XML node paths.
* **Manual Verification & Changes**: Hand-coded all HTTP header payloads, configured exponential backoff timing algorithms manually, and validated error handling pathways to ensure resilience when responses return empty or HTTP 429 status codes.
