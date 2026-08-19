import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fetchPublicJobs, fetchPublicJobsWithMetadata } from './ingestion/rss-fetcher';
import { scrapeSandboxJobs } from './ingestion/HTML-parser';
import { globalCircuitBreaker, globalRateLimiter } from './ingestion/rate-limiter';
import { validateTargetUrl } from './utils/security';
import sandboxApp from './sandbox-server';

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Enable trust proxy for reverse-proxied cloud deployments (Render, Railway, Cloudflare)
app.set('trust proxy', 1);

// 1. Security Headers via Helmet (with permissive script policy for dashboard demo)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'http:', 'https:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// 2. CORS Configuration
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    methods: ['GET', 'POST', 'HEAD', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 3. API Gateway Inbound Rate Limiting (DDoS / Brute-force protection)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 120, // Limit each IP to 120 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: {
    status: 'error',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests from this IP. Please try again after 15 minutes.',
  },
});

app.use('/api/', apiLimiter);

// Mount the sandbox mock routes directly under /sandbox
app.use('/sandbox', sandboxApp);

/**
 * 1. Primary Compliant Low-Risk RSS Feed Ingestion Endpoint
 */
app.get('/api/jobs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawFeedUrl = (req.query.feed as string) || 'https://weworkremotely.com/remote-jobs.rss';
    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 10, 1), 100);
    const bypassCache = req.query.fresh === 'true' || req.query.nocache === 'true';

    // SSRF & Security Validation
    const validation = validateTargetUrl(rawFeedUrl, true);
    if (!validation.isValid) {
      res.status(400).json({
        status: 'error',
        code: 'INVALID_TARGET_URL',
        message: validation.error,
      });
      return;
    }

    const startTime = Date.now();
    const feedResult = await fetchPublicJobsWithMetadata(validation.sanitizedUrl, 3, bypassCache);
    const durationMs = Date.now() - startTime;

    res.json({
      status: 'success',
      source: 'WeWorkRemotely RSS (Public Structured Feed)',
      feedUrl: validation.sanitizedUrl,
      durationMs,
      cached: feedResult.cached,
      cacheAgeMs: feedResult.cacheAgeMs,
      totalParsed: feedResult.jobs.length,
      returnedCount: Math.min(feedResult.jobs.length, limit),
      timestamp: new Date().toISOString(),
      circuitBreaker: globalCircuitBreaker.getMetrics(),
      availableTokens: globalRateLimiter.getAvailableTokens(),
      data: feedResult.jobs.slice(0, limit),
    });
  } catch (error: any) {
    next(error);
  }
});

/**
 * 2. Resilient HTML Scraper Endpoint (Sandbox & Target Testing)
 */
app.get('/api/scrape-sandbox', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const targetType = (req.query.target as string) || 'standard';
    let targetUrl = `http://localhost:${PORT}/sandbox/mock-jobs`;

    if (targetType === 'obfuscated') {
      targetUrl = `http://localhost:${PORT}/sandbox/mock-jobs-obfuscated`;
    } else if (targetType === 'honeypot') {
      targetUrl = `http://localhost:${PORT}/sandbox/mock-honeypot`;
    } else if (req.query.url) {
      const validation = validateTargetUrl(req.query.url as string, true);
      if (!validation.isValid) {
        res.status(400).json({
          status: 'error',
          code: 'INVALID_TARGET_URL',
          message: validation.error,
        });
        return;
      }
      targetUrl = validation.sanitizedUrl!;
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
    next(error);
  }
});

/**
 * 3. System Health & Rate-Limiter / Circuit Breaker Metrics
 */
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    environment: process.env.NODE_ENV || 'development',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    circuitBreaker: globalCircuitBreaker.getMetrics(),
    rateLimiter: {
      availableTokens: globalRateLimiter.getAvailableTokens(),
      capacity: 5,
      refillRate: 2,
    },
    security: {
      helmetActive: true,
      ssrfDefenseActive: true,
      apiGatewayRateLimit: '120 req / 15 min',
    },
    compliance: {
      robotsTxtObeyed: true,
      authBypassAttempted: false,
      tlsFingerprintSpoofingSupported: true,
    },
  });
});

/**
 * 4. Deep Diagnostics & Detection Surface Telemetry
 */
app.get('/api/diagnostics', (req: Request, res: Response) => {
  res.json({
    status: 'operational',
    service: 'acdyon-ingestion-engine',
    version: '1.0.0',
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
    },
    pacingEngine: {
      algorithm: 'Token Bucket',
      capacity: 5,
      refillRatePerSec: 2,
      jitterStrategy: 'Uniform Full Jitter (±25%)',
    },
    resilienceEngine: {
      tieredStrategies: [
        'Strategy 0: JSON-LD Microdata (schema.org/JobPosting)',
        'Strategy 1: Developer Contracts (data-testid attributes)',
        'Strategy 2: Semantic CSS Class Fallback (.job-card)',
        'Strategy 3: Structural Proximity & Keyword Density (h1-h4)',
      ],
      emptyPayloadDiagnosticThresholdBytes: 300,
      honeypotSignaturesDetected: ['cloudflare', 'datadome', 'perimeterx', 'captcha', 'cf-challenge'],
      contractValidation: 'Zod Runtime Schema SafeParse',
    },
    detectionSurfaceMitigations: {
      secChUaPairing: 'Enforced via BrowserProfile Matrix',
      headlessStealthReady: true,
      robotsTxtEnforcement: 'Strict Crawl-delay compliance',
    },
  });
});

/**
 * 4. Production Dashboard & Interactive Test Console
 */
app.get('/', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Acdyon Ingestion Engine | Systems Console</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #060911;
      --card-bg: #0d1322;
      --card-inner: #080c16;
      --border: #1a233a;
      --border-highlight: #2a395c;
      --primary: #38bdf8;
      --primary-dim: rgba(56, 189, 248, 0.12);
      --accent: #818cf8;
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --success: #34d399;
      --success-dim: rgba(52, 211, 153, 0.12);
      --warning: #fbbf24;
      --danger: #f87171;
      --danger-dim: rgba(248, 113, 113, 0.12);
      --font-sans: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font-sans);
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 2.5rem 1rem;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
    }
    .container { max-width: 1180px; margin: 0 auto; }
    header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 2rem;
      margin-bottom: 2.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1.25rem;
    }
    .brand-title {
      font-size: 1.6rem;
      font-weight: 800;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 0.6rem;
      letter-spacing: -0.02em;
    }
    .status-dot {
      height: 9px;
      width: 9px;
      border-radius: 50%;
      background: var(--success);
      box-shadow: 0 0 12px var(--success);
      cursor: pointer;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.3rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      background: var(--primary-dim);
      color: var(--primary);
      border: 1px solid rgba(56, 189, 248, 0.25);
    }
    .badge-success { background: var(--success-dim); color: var(--success); border-color: rgba(52, 211, 153, 0.25); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 1.75rem;
      box-shadow: 0 20px 35px -10px rgba(0, 0, 0, 0.6);
      transition: border-color 0.2s ease;
    }
    .card:hover { border-color: var(--border-highlight); }
    .card h2 {
      font-size: 1.15rem;
      font-weight: 700;
      margin-bottom: 0.85rem;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .card p { font-size: 0.88rem; color: var(--text-muted); margin-bottom: 1.25rem; line-height: 1.6; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.65rem 1.15rem;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.15s ease;
      background: var(--primary);
      color: #04101e;
      text-decoration: none;
    }
    .btn:hover { background: #7dd3fc; transform: translateY(-1px); }
    .btn-secondary {
      background: #151d30;
      color: #e2e8f0;
      border: 1px solid var(--border);
    }
    .btn-secondary:hover { background: #1f2a44; border-color: #3b4d75; color: #fff; }
    .btn-danger { background: var(--danger-dim); color: var(--danger); border: 1px solid rgba(248, 113, 113, 0.3); }
    .btn-danger:hover { background: rgba(248, 113, 113, 0.25); color: #fff; }
    .btn-group { display: flex; flex-wrap: wrap; gap: 0.6rem; }
    .console-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.85rem;
    }
    pre {
      background: var(--card-inner);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1.25rem;
      overflow-x: auto;
      font-family: var(--font-mono);
      font-size: 0.82rem;
      color: #a5b4fc;
      max-height: 420px;
      line-height: 1.6;
    }
    .metric {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.65rem 0;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      font-size: 0.88rem;
    }
    .metric:last-child { border-bottom: none; }
    .metric-label { color: var(--text-muted); }
    .metric-value { font-family: var(--font-mono); font-weight: 600; color: #fff; font-size: 0.82rem; }
    footer {
      margin-top: 3.5rem;
      text-align: center;
      color: var(--text-dim);
      font-size: 0.85rem;
      border-top: 1px solid var(--border);
      padding-top: 2rem;
    }
    footer a { color: var(--primary); text-decoration: none; font-weight: 500; }
    footer a:hover { text-decoration: underline; }
    #easter-egg {
      display: none;
      background: linear-gradient(135deg, rgba(129, 140, 248, 0.15), rgba(56, 189, 248, 0.15));
      border: 1px solid var(--accent);
      border-radius: 12px;
      padding: 1rem 1.5rem;
      margin-bottom: 2rem;
      font-family: var(--font-mono);
      font-size: 0.85rem;
      color: #c7d2fe;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <div class="brand-title">
          <span class="status-dot" id="secret-dot" title="Acdyon Core Status: Operational"></span>
          Acdyon Ingestion Engine
        </div>
        <p style="color: var(--text-muted); font-size: 0.88rem; margin-top: 0.35rem;">
          Production-Grade Resilient Ingestion, Anti-Bot Surface Mapping & Token-Bucket Pacing
        </p>
      </div>
      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
        <span class="badge badge-success">● RFC 9110 Compliant</span>
        <span class="badge">TypeScript 5.7</span>
        <span class="badge">Zod Validated</span>
      </div>
    </header>

    <div id="easter-egg">
      🎮 <strong>Bonus Easter Egg Unlocked:</strong> Konami Code detected! Stealth Matrix & Deep Telemetry HUD Enabled.
    </div>

    <div class="grid">
      <!-- 1. Live RSS Ingestion Card -->
      <div class="card">
        <h2>Live RSS Ingestion <span class="badge badge-success">Compliant</span></h2>
        <p>
          Ethical stream fetching from public job boards (WeWorkRemotely) using token-bucket pacing (2 req/sec), exponential backoff with full jitter, and strict Zod runtime contract validation.
        </p>
        <div class="btn-group">
          <button class="btn action-btn" data-endpoint="/api/jobs?limit=5">Fetch Top 5 Jobs</button>
          <a class="btn btn-secondary" href="/api/jobs?limit=10" target="_blank">Raw API Stream ↗</a>
        </div>
      </div>

      <!-- 2. Sandbox Resilient HTML Scraper Card -->
      <div class="card">
        <h2>HTML Resiliency Engine <span class="badge">Tiered Fallback</span></h2>
        <p>
          Multi-strategy parser testing fallback selectors (<code>JSON-LD</code> &rarr; <code>data-testid</code> &rarr; <code>Semantic CSS</code> &rarr; <code>Structural Proximity</code>) and anti-bot challenge diagnostics.
        </p>
        <div class="btn-group">
          <button class="btn btn-secondary action-btn" data-endpoint="/api/scrape-sandbox?target=standard">Standard Target</button>
          <button class="btn btn-secondary action-btn" data-endpoint="/api/scrape-sandbox?target=obfuscated">Obfuscated CSS</button>
          <button class="btn btn-danger action-btn" data-endpoint="/api/scrape-sandbox?target=honeypot">Honeypot Trap</button>
        </div>
      </div>
    </div>

    <!-- Live Console Output -->
    <div class="card" style="margin-bottom: 2rem;">
      <div class="console-header">
        <h2 style="margin-bottom: 0;">Live Stream & Diagnostic Console</h2>
        <span id="response-time" style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-muted);">Idle — Select an action above</span>
      </div>
      <pre id="output">// Click one of the test triggers above to execute live ingestion and view the verified JSON payload...</pre>
    </div>

    <!-- Architectural Telemetry & Defense Surface Grid -->
    <div class="grid">
      <div class="card">
        <h2>Pacing & Session Telemetry</h2>
        <div class="metric">
          <span class="metric-label">Rate Limiter Algorithm</span>
          <span class="metric-value">Token Bucket (Cap: 5, Rate: 2/s)</span>
        </div>
        <div class="metric">
          <span class="metric-label">Jitter Formula</span>
          <span class="metric-value">&plusmn;25% Uniform Full Jitter</span>
        </div>
        <div class="metric">
          <span class="metric-label">Circuit Breaker Status</span>
          <span class="metric-value" id="circuit-state">CLOSED (0 Failures)</span>
        </div>
        <div class="metric">
          <span class="metric-label">Robots.txt Policy</span>
          <span class="metric-value">Strict (Crawl-delay Obeyed)</span>
        </div>
        <button class="btn btn-secondary action-btn" style="width:100%; margin-top: 1.25rem;" data-endpoint="/api/health">Query Telemetry (/api/health)</button>
      </div>

      <div class="card">
        <h2>Detection Surface Defense</h2>
        <div class="metric">
          <span class="metric-label">Client Hints Coherence</span>
          <span class="metric-value">Sec-CH-UA + Platform Paired</span>
        </div>
        <div class="metric">
          <span class="metric-label">Honeypot Scanner</span>
          <span class="metric-value">Cloudflare / PX / DD Patterns</span>
        </div>
        <div class="metric">
          <span class="metric-label">Byte-Length Diagnostic</span>
          <span class="metric-value">&lt; 300B Payload Anomaly Check</span>
        </div>
        <div class="metric">
          <span class="metric-label">Contract Integrity</span>
          <span class="metric-value">Zod SafeParse / Drop-on-Error</span>
        </div>
        <a class="btn btn-secondary" style="width:100%; margin-top: 1.25rem;" href="/sandbox/robots.txt" target="_blank">Inspect Mock robots.txt ↗</a>
      </div>
    </div>

    <footer>
      <p>Acdyon Technologies Engineering Assessment (Part 1 Track: Ingestion & Resilience Architecture).</p>
      <p style="margin-top: 0.4rem;">
        Engineered with Node.js, TypeScript, Cheerio, xml2js, Helmet, and Zod. Read <a href="https://github.com/your-org/acdyon-ingestion-engine/blob/main/DECISIONS.md" target="_blank">DECISIONS.md</a> &amp; <a href="https://github.com/your-org/acdyon-ingestion-engine/blob/main/docs/architecture.md" target="_blank">architecture.md</a>.
      </p>
    </footer>
  </div>

  <script>
    async function fetchEndpoint(endpoint) {
      const output = document.getElementById('output');
      const timeSpan = document.getElementById('response-time');
      if (!output || !timeSpan) return;
      
      output.innerText = '// Requesting ' + endpoint + '...';
      timeSpan.innerText = 'Dispatching request...';
      
      const start = performance.now();
      try {
        const res = await fetch(endpoint);
        const data = await res.json();
        const duration = Math.round(performance.now() - start);
        timeSpan.innerText = 'Latency: ' + duration + 'ms (HTTP ' + res.status + ')';
        output.innerText = JSON.stringify(data, null, 2);
      } catch (err) {
        timeSpan.innerText = 'Request Failed';
        output.innerText = '// Error: ' + err.message;
      }
    }

    window.fetchEndpoint = fetchEndpoint;

    // Attach click listeners to all action buttons with data-endpoint
    function initActionButtons() {
      const buttons = document.querySelectorAll('.action-btn, [data-endpoint]');
      buttons.forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          const endpoint = btn.getAttribute('data-endpoint');
          if (endpoint) {
            fetchEndpoint(endpoint);
          }
        });
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initActionButtons);
    } else {
      initActionButtons();
    }

    // Bonus Round Easter Egg: Konami Code Handler
    const konamiCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let konamiIndex = 0;

    document.addEventListener('keydown', function(e) {
      if (e.key === konamiCode[konamiIndex] || e.key.toLowerCase() === konamiCode[konamiIndex]) {
        konamiIndex++;
        if (konamiIndex === konamiCode.length) {
          const egg = document.getElementById('easter-egg');
          if (egg) egg.style.display = 'block';
          konamiIndex = 0;
        }
      } else {
        konamiIndex = 0;
      }
    });

    const secretDot = document.getElementById('secret-dot');
    if (secretDot) {
      secretDot.addEventListener('click', function() {
        const egg = document.getElementById('easter-egg');
        if (egg) egg.style.display = egg.style.display === 'block' ? 'none' : 'block';
      });
    }
  </script>
</body>
</html>
  `);
});

// 5. Global Error Handling Middleware (Zero stack traces leaked in production)
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[Server Error Handler]', err);

  const statusCode = err.status || 500;
  const responsePayload: any = {
    status: 'error',
    code: err.code || 'INTERNAL_SERVER_ERROR',
    message: err.message || 'An unexpected error occurred during request processing.',
    timestamp: new Date().toISOString(),
  };

  if (!IS_PROD && err.stack) {
    responsePayload.stack = err.stack;
  }

  res.status(statusCode).json(responsePayload);
});

// 6. Graceful Server Lifecycle Management
let serverInstance: any = null;

if (require.main === module) {
  serverInstance = app.listen(PORT, () => {
    console.log(`[Acdyon Ingestion Engine] Service live on port ${PORT} (PID: ${process.pid})`);
    console.log(`[Environment] Mode: ${process.env.NODE_ENV || 'development'}`);

    // Asynchronously pre-warm the public RSS feed cache on startup
    fetchPublicJobsWithMetadata('https://weworkremotely.com/remote-jobs.rss')
      .then((res) => console.log(`[Cache Pre-Warm] Ingested ${res.jobs.length} listings in background (0ms user latency ready).`))
      .catch((err) => console.warn('[Cache Pre-Warm Warning]', err.message));
  });

  const handleShutdown = (signal: string) => {
    console.log(`[Lifecycle] Received ${signal}. Starting graceful shutdown...`);
    if (serverInstance) {
      serverInstance.close(() => {
        console.log('[Lifecycle] HTTP server closed cleanly. Exiting process.');
        process.exit(0);
      });

      // Force shutdown if connections do not close within 10s
      setTimeout(() => {
        console.error('[Lifecycle] Forced shutdown due to lingering connections.');
        process.exit(1);
      }, 10000).unref();
    } else {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

export default app;
