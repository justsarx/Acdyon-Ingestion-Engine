import test from 'node:test';
import assert from 'node:assert/strict';
import { TokenBucket, CircuitBreaker, CircuitState, calculateExponentialBackoffWithJitter } from '../src/ingestion/rate-limiter';
import { ResilientHTMLParser } from '../src/ingestion/HTML-parser';
import { JobListingSchema } from '../src/ingestion/rss-fetcher';
import { validateTargetUrl, sanitizeString } from '../src/utils/security';
import { getRandomBrowserProfile, buildHeadersFromProfile } from '../src/config/user-agents';

test('1. Rate Limiter: Token Bucket acquisition and pacing', async () => {
  const bucket = new TokenBucket({ capacity: 3, refillRate: 5 });
  assert.equal(bucket.getAvailableTokens(), 3);

  await bucket.acquire(2);
  assert.equal(bucket.getAvailableTokens(), 1);

  await bucket.acquire(1);
  assert.equal(bucket.getAvailableTokens(), 0);
});

test('2. Rate Limiter: Exponential backoff with ±25% jitter bounds', () => {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const base = Math.min(30000, 1000 * Math.pow(2, attempt));
    const delay = calculateExponentialBackoffWithJitter(attempt, 1000, 30000);
    assert.ok(delay >= base * 0.75, `Delay ${delay} should be >= ${base * 0.75}`);
    assert.ok(delay <= base * 1.25, `Delay ${delay} should be <= ${base * 1.25}`);
  }
});

test('3. Circuit Breaker: State transitions (CLOSED -> OPEN -> HALF_OPEN)', async () => {
  const cb = new CircuitBreaker({ failureThreshold: 2, recoveryTimeoutMs: 100 });
  assert.equal(cb.getState(), CircuitState.CLOSED);
  assert.equal(cb.isOpen(), false);

  cb.recordFailure();
  assert.equal(cb.getState(), CircuitState.CLOSED);

  cb.recordFailure(); // Threshold reached
  assert.equal(cb.getState(), CircuitState.OPEN);
  assert.equal(cb.isOpen(), true);

  // Wait for recovery timeout
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(cb.getState(), CircuitState.HALF_OPEN);

  cb.recordSuccess();
  assert.equal(cb.getState(), CircuitState.CLOSED);
});

test('4. HTML Parser: Strategy 0 (JSON-LD Microdata)', () => {
  const html = `
    <!DOCTYPE html><html><head>
      <script type="application/ld+json">
      {
        "@context": "https://schema.org/",
        "@type": "JobPosting",
        "title": "Staff Platform Architect",
        "hiringOrganization": { "@type": "Organization", "name": "Acdyon Core" },
        "jobLocation": { "@type": "Place", "address": { "addressLocality": "Remote" } },
        "url": "https://acdyon.com/jobs/staff-architect"
      }
      </script>
    </head><body><div>Some content</div></body></html>
  `;

  const result = ResilientHTMLParser.parseJobsFromHTML(html, 'https://acdyon.com');
  assert.equal(result.diagnostics.isHoneypotOrBlocked, false);
  assert.equal(result.diagnostics.selectorStrategyUsed, 'STRATEGY_0_JSON_LD');
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].title, 'Staff Platform Architect');
  assert.equal(result.jobs[0].company, 'Acdyon Core');
});

test('5. HTML Parser: Strategy 1 (data-testid attributes)', () => {
  const html = `
    <!DOCTYPE html><html><head><title>Careers</title></head>
    <body>
      <div class="container-root">
        <div data-testid="job-card">
          <h2 data-testid="job-title">Site Reliability Engineer</h2>
          <div data-testid="company-name">Acdyon Ops</div>
          <span data-testid="job-location">Austin, TX</span>
          <a href="/jobs/sre">Apply</a>
        </div>
      </div>
    </body></html>
  `;

  const result = ResilientHTMLParser.parseJobsFromHTML(html, 'https://acdyon.com');
  assert.equal(result.diagnostics.selectorStrategyUsed, 'STRATEGY_1_DATA_TESTID');
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].title, 'Site Reliability Engineer');
  assert.equal(result.jobs[0].company, 'Acdyon Ops');
});

test('6. HTML Parser: Strategy 3 (Structural Proximity & Keyword Density Fallback)', () => {
  const html = `
    <!DOCTYPE html><html><head><title>Obfuscated Careers</title></head>
    <body>
      <div class="x9_hash_root">
        <article class="c_87y2n">
          <h2>Lead Ingestion Architect</h2>
          <p>Acdyon Data Labs</p>
          <span>Location: Global Remote | Full-Time | Salary: $200,000</span>
          <a href="/apply/lead-architect">Apply on portal</a>
        </article>
      </div>
    </body></html>
  `;

  const result = ResilientHTMLParser.parseJobsFromHTML(html, 'https://acdyon.com');
  assert.equal(result.diagnostics.selectorStrategyUsed, 'STRATEGY_3_STRUCTURAL_PROXIMITY');
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].title, 'Lead Ingestion Architect');
  assert.equal(result.jobs[0].company, 'Acdyon Data Labs');
});

test('7. HTML Parser: Honeypot & Anti-Bot Challenge Detection', () => {
  const html = `
    <!DOCTYPE html><html><head><title>Just a moment...</title></head>
    <body>
      <div id="cf-challenge-running">
        <h1>Checking your browser before accessing the website...</h1>
        <p>Please wait 5 seconds while we verify you are human.</p>
        <div class="cf-browser-verification">Ray ID: 89ab329ef001c9</div>
      </div>
    </body></html>
  `;

  const result = ResilientHTMLParser.parseJobsFromHTML(html);
  assert.equal(result.diagnostics.isHoneypotOrBlocked, true);
  assert.match(result.diagnostics.blockReason || '', /cf-challenge/i);
  assert.equal(result.jobs.length, 0);
});

test('8. Zod Schema: Contract validation and malformed item rejection', () => {
  const valid = {
    title: 'Senior Distributed Engineer',
    company: 'Acdyon',
    location: 'Remote',
    link: 'https://acdyon.com/apply',
  };
  const parseValid = JobListingSchema.safeParse(valid);
  assert.equal(parseValid.success, true);

  const invalid = {
    title: '', // Empty title should fail min(1) constraint
    company: 'Acdyon',
  };
  const parseInvalid = JobListingSchema.safeParse(invalid);
  assert.equal(parseInvalid.success, false);
});

test('9. Security: SSRF Validation and Private IP Defense', () => {
  // Safe public URL
  const publicCheck = validateTargetUrl('https://weworkremotely.com/remote-jobs.rss', false);
  assert.equal(publicCheck.isValid, true);

  // Private AWS Metadata IP (SSRF Attempt)
  const metadataCheck = validateTargetUrl('http://169.254.169.254/latest/meta-data/', false);
  assert.equal(metadataCheck.isValid, false);
  assert.match(metadataCheck.error || '', /private or link-local address/);

  // Private RFC 1918 IPs
  const rfc1918Check = validateTargetUrl('http://192.168.1.1/admin', false);
  assert.equal(rfc1918Check.isValid, false);

  // Disallowed protocol (file://)
  const protoCheck = validateTargetUrl('file:///etc/passwd', false);
  assert.equal(protoCheck.isValid, false);
  assert.match(protoCheck.error || '', /Disallowed protocol/);
});

test('10. Browser Profiles: Client Hints & User-Agent pairing', () => {
  const profile = getRandomBrowserProfile();
  const headers = buildHeadersFromProfile(profile);

  assert.ok(headers['User-Agent']);
  assert.ok(headers['Accept']);

  if (profile.name.includes('Chrome')) {
    assert.ok(headers['sec-ch-ua']);
    assert.ok(headers['sec-ch-ua-platform']);
  }
});
