import express from 'express';

const app = express();
const PORT = process.env.SANDBOX_PORT || 4000;

// Rate limit counter for testing HTTP 429 simulation
let hitCount = 0;
let lastReset = Date.now();

app.use((req, res, next) => {
  if (Date.now() - lastReset > 5000) {
    hitCount = 0;
    lastReset = Date.now();
  }
  next();
});

// 1. Robots.txt Compliance endpoint
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *\nDisallow: /admin/\nDisallow: /private/\nCrawl-delay: 2\n\nUser-agent: AcdyonIngestionEngine\nAllow: /\n`);
});

// 2. Standard Mock Job Portal with JSON-LD and data-testid attributes
app.get('/mock-jobs', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Acdyon Mock Careers Portal</title>
  <script type="application/ld+json">
  [
    {
      "@context": "https://schema.org/",
      "@type": "JobPosting",
      "title": "Principal Distributed Systems Engineer",
      "description": "Architecting resilient high-throughput ingestion pipelines and token-bucket pacing layers.",
      "datePosted": "2026-08-19T00:00:00Z",
      "hiringOrganization": {
        "@type": "Organization",
        "name": "Acdyon Technologies"
      },
      "jobLocation": {
        "@type": "Place",
        "address": {
          "@type": "PostalAddress",
          "addressLocality": "San Francisco, CA (Remote)"
        }
      },
      "url": "http://localhost:${PORT}/jobs/principal-distributed-systems"
    },
    {
      "@context": "https://schema.org/",
      "@type": "JobPosting",
      "title": "Senior Rust / WebAssembly Performance Specialist",
      "description": "Optimizing low-latency TLS parsing and JA4 client fingerprinting engines.",
      "datePosted": "2026-08-18T12:00:00Z",
      "hiringOrganization": {
        "@type": "Organization",
        "name": "Acdyon Core Systems"
      },
      "jobLocation": {
        "@type": "Place",
        "address": {
          "@type": "PostalAddress",
          "addressLocality": "Austin, TX (Remote)"
        }
      },
      "url": "http://localhost:${PORT}/jobs/sr-rust-wasm"
    }
  ]
  </script>
</head>
<body>
  <h1>Open Engineering Roles at Acdyon</h1>
  <div class="job-list">
    <div class="job-card" data-testid="job-card">
      <h2 class="title" data-testid="job-title">Staff Site Reliability Engineer (SRE)</h2>
      <p class="company" data-testid="company-name">Acdyon Platform Ops</p>
      <span class="location" data-testid="job-location">Remote, EU/US</span>
      <a href="/jobs/staff-sre">Apply Now</a>
    </div>
    <div class="job-card" data-testid="job-card">
      <h2 class="title" data-testid="job-title">Senior Frontend Engineer (Design Systems)</h2>
      <p class="company" data-testid="company-name">Acdyon Product Team</p>
      <span class="location" data-testid="job-location">New York, NY (Hybrid)</span>
      <a href="/jobs/sr-frontend-engineer">Apply Now</a>
    </div>
  </div>
</body>
</html>
  `);
});

// 3. Obfuscated / CSS-Mangled Mock Job Page (Simulating Class Name Hashing / React Minification)
app.get('/mock-jobs-obfuscated', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`
<!DOCTYPE html>
<html>
<head><title>Obfuscated Career Listings</title></head>
<body>
  <div class="x9_hash_root">
    <article class="c_87y2n">
      <h2>Lead Ingestion Architect</h2>
      <p>Acdyon Data Labs</p>
      <span>Location: Global Remote | Full-Time | Salary: $180,000 - $220,000</span>
      <a href="/apply/lead-architect">Apply on portal</a>
    </article>
    <article class="c_87y2n">
      <h2>Senior Security & Anti-Bot Defense Engineer</h2>
      <p>Acdyon Cyber Systems</p>
      <span>Location: Remote Worldwide | Full-Time | Competitive Equity</span>
      <a href="/apply/security-eng">Apply on portal</a>
    </article>
  </div>
</body>
</html>
  `);
});

// 4. Honeypot / Anti-Bot Challenge Simulation (HTTP 200 OK with Bot Challenge Signature)
app.get('/mock-honeypot', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`
<!DOCTYPE html>
<html>
<head><title>Just a moment...</title></head>
<body>
  <div id="cf-challenge-running">
    <h1>Checking your browser before accessing the website...</h1>
    <p>Please wait 5 seconds while we verify you are human.</p>
    <div class="cf-browser-verification">Ray ID: 89ab329ef001c9</div>
  </div>
</body>
</html>
  `);
});

// 5. Rate Limit Simulation (Returns 429 after 2 rapid hits)
app.get('/mock-rate-limit', (req, res) => {
  hitCount++;
  if (hitCount > 2) {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Slow down or obey Crawl-delay.',
      retryAfterSeconds: 5,
    });
    return;
  }

  res.json({
    status: 'ok',
    message: `Request ${hitCount} accepted. Exceeding 2 requests within 5 seconds triggers HTTP 429.`,
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[Acdyon Sandbox Target Server] Live on http://localhost:${PORT}`);
  });
}

export default app;
