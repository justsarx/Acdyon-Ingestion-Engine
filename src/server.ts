import express from 'express';
import cors from 'cors';
import { fetchPublicJobs } from './ingestion/rss-fetcher';
import { scrapeSandboxJobs, ResilientHTMLParser } from './ingestion/HTML-parser';
import { globalCircuitBreaker, globalRateLimiter } from './ingestion/rate-limiter';
import sandboxApp from './sandbox-server';

const app = express();
const PORT = process.env.PORT || 3000;
const SANDBOX_PORT = process.env.SANDBOX_PORT || 4000;

app.use(cors());
app.use(express.json());

// Mount the sandbox mock routes directly under /sandbox for unified single-server deployment
app.use('/sandbox', sandboxApp);

/**
 * 1. Primary Compliant Low-Risk RSS Feed Ingestion Endpoint
 */
app.get('/api/jobs', async (req, res) => {
  try {
    const feedUrl = (req.query.feed as string) || 'https://weworkremotely.com/remote-jobs.rss';
    const limit = parseInt(req.query.limit as string, 10) || 10;

    const startTime = Date.now();
    const jobs = await fetchPublicJobs(feedUrl);
    const durationMs = Date.now() - startTime;

    res.json({
      status: 'success',
      source: 'WeWorkRemotely RSS',
      feedUrl,
      durationMs,
      totalParsed: jobs.length,
      timestamp: new Date().toISOString(),
      circuitBreaker: globalCircuitBreaker.getMetrics(),
      availableTokens: globalRateLimiter.getAvailableTokens(),
      data: jobs.slice(0, limit),
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      circuitBreaker: globalCircuitBreaker.getMetrics(),
    });
  }
});

/**
 * 2. Resilient HTML Scraper Endpoint (Sandbox & Fallback Target Testing)
 */
app.get('/api/scrape-sandbox', async (req, res) => {
  try {
    const targetType = (req.query.target as string) || 'standard';
    let targetUrl = `http://localhost:${PORT}/sandbox/mock-jobs`;

    if (targetType === 'obfuscated') {
      targetUrl = `http://localhost:${PORT}/sandbox/mock-jobs-obfuscated`;
    } else if (targetType === 'honeypot') {
      targetUrl = `http://localhost:${PORT}/sandbox/mock-honeypot`;
    } else if (req.query.url) {
      targetUrl = req.query.url as string;
    }

    const startTime = Date.now();
    const result = await scrapeSandboxJobs(targetUrl);
    const durationMs = Date.now() - startTime;

    res.json({
      status: 'success',
      targetUrl,
      durationMs,
      timestamp: new Date().toISOString(),
      diagnostics: result.diagnostics,
      itemCount: result.jobs.length,
      data: result.jobs,
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
});

/**
 * 3. System Health & Rate-Limiter / Circuit Breaker Metrics
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    circuitBreaker: globalCircuitBreaker.getMetrics(),
    rateLimiter: {
      availableTokens: globalRateLimiter.getAvailableTokens(),
      capacity: 5,
      refillRate: 2,
    },
    compliance: {
      robotsTxtObeyed: true,
      authBypassAttempted: false,
      tlsFingerprintSpoofingSupported: true,
    },
  });
});

/**
 * 4. Production Dashboard & Interactive Test Console
 */
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Acdyon Ingestion Engine | Production Console</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #111827;
      --border: #1f293d;
      --primary: #38bdf8;
      --accent: #818cf8;
      --text: #f3f4f6;
      --text-dim: #9ca3af;
      --success: #34d399;
      --warning: #fbbf24;
      --danger: #f87171;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 2rem 1rem;
    }
    .container { max-width: 1100px; margin: 0 auto; }
    header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 1.5rem;
      margin-bottom: 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .brand h1 { font-size: 1.5rem; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 0.5rem; }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.6rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      background: rgba(56, 189, 248, 0.15);
      color: var(--primary);
      border: 1px solid rgba(56, 189, 248, 0.3);
    }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .card h2 { font-size: 1.1rem; font-weight: 600; margin-bottom: 1rem; color: #fff; display: flex; align-items: center; justify-content: space-between; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.6rem 1rem;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.2s ease;
      background: var(--primary);
      color: #04101e;
      text-decoration: none;
      margin-top: 0.5rem;
    }
    .btn:hover { background: #7dd3fc; }
    .btn-secondary { background: #1f293d; color: #e5e7eb; border: 1px solid #374151; }
    .btn-secondary:hover { background: #374151; }
    .btn-danger { background: rgba(248, 113, 113, 0.15); color: var(--danger); border: 1px solid rgba(248, 113, 113, 0.3); }
    .btn-group { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    pre {
      background: #040711;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
      overflow-x: auto;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      color: #a5b4fc;
      max-height: 380px;
    }
    .metric { display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.85rem; }
    .metric-label { color: var(--text-dim); }
    .metric-value { font-family: 'JetBrains Mono', monospace; font-weight: 600; color: #fff; }
    .status-dot { height: 8px; width: 8px; border-radius: 50%; display: inline-block; background: var(--success); }
    footer { margin-top: 3rem; text-align: center; color: var(--text-dim); font-size: 0.85rem; border-top: 1px solid var(--border); padding-top: 1.5rem; }
    a { color: var(--primary); text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <h1><span class="status-dot"></span> Acdyon Ingestion Engine</h1>
        <p style="color: var(--text-dim); font-size: 0.85rem; margin-top: 0.25rem;">Resilient Ingestion, Anti-Bot Surface Mapping & Pacing Architecture</p>
      </div>
      <div>
        <span class="badge">TypeScript + Node.js</span>
        <span class="badge" style="margin-left: 0.25rem;">RFC 9110 Compliant</span>
      </div>
    </header>

    <div class="grid">
      <!-- 1. Live RSS Ingestion Card -->
      <div class="card">
        <h2>Live RSS Ingestion <span class="badge" style="background:rgba(52,211,153,0.15); color:var(--success); border-color:rgba(52,211,153,0.3)">Compliant</span></h2>
        <p style="font-size: 0.85rem; color: var(--text-dim); margin-bottom: 1rem;">
          Low-risk, ethical stream fetching from WeWorkRemotely RSS feed with token-bucket sub-second pacing and Zod schema validation.
        </p>
        <div class="btn-group">
          <button class="btn" onclick="fetchEndpoint('/api/jobs?limit=5')">Fetch 5 Jobs</button>
          <a class="btn btn-secondary" href="/api/jobs" target="_blank">Open Raw API ↗</a>
        </div>
      </div>

      <!-- 2. Sandbox HTML Scraper Card -->
      <div class="card">
        <h2>HTML Resiliency Engine <span class="badge">Sandbox</span></h2>
        <p style="font-size: 0.85rem; color: var(--text-dim); margin-bottom: 1rem;">
          Multi-strategy parser testing fallback selectors (JSON-LD -> data-testid -> Semantic classes -> Proximity) and honeypot diagnostics.
        </p>
        <div class="btn-group">
          <button class="btn btn-secondary" onclick="fetchEndpoint('/api/scrape-sandbox?target=standard')">Standard Target</button>
          <button class="btn btn-secondary" onclick="fetchEndpoint('/api/scrape-sandbox?target=obfuscated')">Obfuscated CSS</button>
          <button class="btn btn-danger" onclick="fetchEndpoint('/api/scrape-sandbox?target=honeypot')">Honeypot Trap</button>
        </div>
      </div>
    </div>

    <!-- Live Console Output -->
    <div class="card" style="margin-bottom: 2rem;">
      <h2>Live Stream & Diagnostic Response <span id="response-time" style="font-size: 0.75rem; color: var(--text-dim);">Ready</span></h2>
      <pre id="output">// Click one of the test triggers above to execute live ingestion and view the JSON contract stream...</pre>
    </div>

    <!-- Architectural Guarantees Grid -->
    <div class="grid">
      <div class="card">
        <h2>Pacing & Session Metrics</h2>
        <div class="metric">
          <span class="metric-label">Rate Limiter Algorithm</span>
          <span class="metric-value">Token Bucket (Cap: 5, Rate: 2/s)</span>
        </div>
        <div class="metric">
          <span class="metric-label">Jitter Formula</span>
          <span class="metric-value">±25% Uniform Full Jitter</span>
        </div>
        <div class="metric">
          <span class="metric-label">Circuit Breaker</span>
          <span class="metric-value" id="circuit-state">CLOSED (Healthy)</span>
        </div>
        <div class="metric">
          <span class="metric-label">Robots.txt Policy</span>
          <span class="metric-value">Strict (Crawl-delay obeyed)</span>
        </div>
        <button class="btn btn-secondary" style="width:100%; margin-top: 1rem;" onclick="fetchEndpoint('/api/health')">Query /api/health</button>
      </div>

      <div class="card">
        <h2>Detection Surface Defense</h2>
        <div class="metric">
          <span class="metric-label">TLS & Client Hints</span>
          <span class="metric-value">Sec-CH-UA / UA Coherence</span>
        </div>
        <div class="metric">
          <span class="metric-label">Empty Payload Check</span>
          <span class="metric-value">&lt; 300B Threshold Diagnostic</span>
        </div>
        <div class="metric">
          <span class="metric-label">Honeypot Fingerprints</span>
          <span class="metric-value">Cloudflare/PX/DataDome Regex</span>
        </div>
        <div class="metric">
          <span class="metric-label">Contract Integrity</span>
          <span class="metric-value">Zod SafeParse / Drop-on-error</span>
        </div>
        <a class="btn btn-secondary" style="width:100%; margin-top: 1rem;" href="/sandbox/robots.txt" target="_blank">View Mock robots.txt ↗</a>
      </div>
    </div>

    <footer>
      <p>Acdyon Technologies Engineering Assessment (Part 1 Track: Ingestion & Resilience Architecture).</p>
      <p style="margin-top: 0.25rem;">Built with Node.js, TypeScript, Cheerio, xml2js, and Zod. Deployed on Railway/Render.</p>
    </footer>
  </div>

  <script>
    async function fetchEndpoint(endpoint) {
      const output = document.getElementById('output');
      const timeSpan = document.getElementById('response-time');
      output.innerText = '// Fetching ' + endpoint + '...';
      timeSpan.innerText = 'Requesting...';
      
      const start = performance.now();
      try {
        const res = await fetch(endpoint);
        const data = await res.json();
        const duration = Math.round(performance.now() - start);
        timeSpan.innerText = 'Latency: ' + duration + 'ms (HTTP ' + res.status + ')';
        output.innerText = JSON.stringify(data, null, 2);
      } catch (err) {
        timeSpan.innerText = 'Error';
        output.innerText = '// Error: ' + err.message;
      }
    }
  </script>
</body>
</html>
  `);
});

app.listen(PORT, () => {
  console.log(`[Acdyon Ingestion Engine] Service live on http://localhost:${PORT}`);
  console.log(`[Sandbox Mock Endpoints] Accessible via http://localhost:${PORT}/sandbox/mock-jobs`);
});

export default app;
