import * as cheerio from 'cheerio';
import { z } from 'zod';
import { getRandomBrowserProfile, buildHeadersFromProfile } from '../config/user-agents';
import { JobListing, JobListingSchema } from './rss-fetcher';

export interface ScrapeDiagnostic {
  isHoneypotOrBlocked: boolean;
  blockReason?: string;
  payloadByteLength: number;
  selectorStrategyUsed: string;
  itemCount: number;
}

export interface ScrapeResult {
  jobs: JobListing[];
  diagnostics: ScrapeDiagnostic;
}

/**
 * Diagnostic patterns for anti-bot honeypots & soft-blocks that return HTTP 200 OK
 * with an empty shell or verification challenge.
 */
const BOT_CHALLENGE_PATTERNS = [
  /cloudflare/i,
  /cf-challenge/i,
  /datadome/i,
  /perimeterx/i,
  /akamai/i,
  /please enable javascript/i,
  /verify you are a human/i,
  /captcha-box/i,
  /challenge-running/i,
  /access denied/i,
  /ray id:/i,
];

/**
 * Robust HTML Parser with Multi-Strategy Fallback Selectors and Diagnostics.
 */
export class ResilientHTMLParser {
  /**
   * Diagnostic inspection of raw HTML payload before parsing.
   */
  public static diagnosePayload(html: string): { isBlocked: boolean; reason?: string } {
    const byteLength = Buffer.byteLength(html, 'utf-8');

    // Threshold 1: Suspiciously small payload
    if (byteLength < 300) {
      return { isBlocked: true, reason: `Suspiciously small payload (${byteLength} bytes). Possible anti-bot honeypot or blank shell.` };
    }

    // Threshold 2: Anti-bot challenge strings in payload
    for (const pattern of BOT_CHALLENGE_PATTERNS) {
      if (pattern.test(html)) {
        return { isBlocked: true, reason: `Anti-bot fingerprint challenge detected in payload matching pattern: ${pattern}` };
      }
    }

    return { isBlocked: false };
  }

  /**
   * Parses job listings from HTML using a tiered selector fallback hierarchy.
   */
  public static parseJobsFromHTML(html: string, baseUrl: string = ''): ScrapeResult {
    const diagnostic = ResilientHTMLParser.diagnosePayload(html);
    const byteLength = Buffer.byteLength(html, 'utf-8');

    if (diagnostic.isBlocked) {
      return {
        jobs: [],
        diagnostics: {
          isHoneypotOrBlocked: true,
          blockReason: diagnostic.reason,
          payloadByteLength: byteLength,
          selectorStrategyUsed: 'NONE_BLOCKED',
          itemCount: 0,
        },
      };
    }

    const $ = cheerio.load(html);
    const jobs: JobListing[] = [];
    let strategyUsed = 'NONE';

    // =========================================================================
    // Strategy 0: Schema.org / JSON-LD Microdata Extraction (Highest Fidelity)
    // =========================================================================
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const rawJson = $(el).html();
        if (!rawJson) return;
        const data = JSON.parse(rawJson);
        const candidates = Array.isArray(data) ? data : [data];

        for (const item of candidates) {
          if (item['@type'] === 'JobPosting') {
            const parsed = JobListingSchema.safeParse({
              title: item.title || item.name || 'Unknown Position',
              company: item.hiringOrganization?.name || 'Direct Hire',
              location: item.jobLocation?.address?.addressLocality || 'Remote',
              link: item.url || baseUrl,
              publishedAt: item.datePosted || new Date().toISOString(),
              description: item.description ? ResilientHTMLParser.cleanText(item.description).slice(0, 300) : undefined,
            });

            if (parsed.success) {
              jobs.push(parsed.data);
              strategyUsed = 'STRATEGY_0_JSON_LD';
            }
          }
        }
      } catch (e) {
        // Ignore JSON-LD parse errors and fall through
      }
    });

    if (jobs.length > 0) {
      return {
        jobs,
        diagnostics: {
          isHoneypotOrBlocked: false,
          payloadByteLength: byteLength,
          selectorStrategyUsed: strategyUsed,
          itemCount: jobs.length,
        },
      };
    }

    // =========================================================================
    // Strategy 1: Data-TestID / Semantic Data Attribute Selectors
    // =========================================================================
    const testidCards = $('[data-testid="job-card"], [data-testid="job-item"], [data-cy="job-posting"]');
    if (testidCards.length > 0) {
      strategyUsed = 'STRATEGY_1_DATA_TESTID';
      testidCards.each((_, el) => {
        const card = $(el);
        const title = card.find('[data-testid="job-title"], [data-testid="title"], h2, h3').first().text().trim();
        const company = card.find('[data-testid="company-name"], [data-testid="company"], .company').first().text().trim();
        const location = card.find('[data-testid="job-location"], [data-testid="location"], .location').first().text().trim();
        const link = card.find('a[href]').first().attr('href') || baseUrl;

        const parsed = JobListingSchema.safeParse({
          title: title || 'Unknown Position',
          company: company || 'Direct Hire',
          location: location || 'Remote',
          link: ResilientHTMLParser.resolveUrl(baseUrl, link),
          publishedAt: new Date().toISOString(),
        });

        if (parsed.success && title) jobs.push(parsed.data);
      });

      if (jobs.length > 0) {
        return {
          jobs,
          diagnostics: {
            isHoneypotOrBlocked: false,
            payloadByteLength: byteLength,
            selectorStrategyUsed: strategyUsed,
            itemCount: jobs.length,
          },
        };
      }
    }

    // =========================================================================
    // Strategy 2: Common Semantic Class Names (.job-item, .listing, etc.)
    // =========================================================================
    const semanticCards = $('.job-card, .job-listing, .job-item, .position-card, .vacancy-item, article.job');
    if (semanticCards.length > 0) {
      strategyUsed = 'STRATEGY_2_SEMANTIC_CLASSES';
      semanticCards.each((_, el) => {
        const card = $(el);
        const title = card.find('.title, .job-title, .position-title, h2, h3, a.job-link').first().text().trim();
        const company = card.find('.company, .company-name, .employer, .org').first().text().trim();
        const location = card.find('.location, .region, .city, .workplace-type').first().text().trim();
        const link = card.find('a[href]').first().attr('href') || baseUrl;

        const parsed = JobListingSchema.safeParse({
          title: title || 'Unknown Position',
          company: company || 'Direct Hire',
          location: location || 'Remote',
          link: ResilientHTMLParser.resolveUrl(baseUrl, link),
          publishedAt: new Date().toISOString(),
        });

        if (parsed.success && title) jobs.push(parsed.data);
      });

      if (jobs.length > 0) {
        return {
          jobs,
          diagnostics: {
            isHoneypotOrBlocked: false,
            payloadByteLength: byteLength,
            selectorStrategyUsed: strategyUsed,
            itemCount: jobs.length,
          },
        };
      }
    }

    // =========================================================================
    // Strategy 3: Structural Proximity & Keyword Fallback (h1, h2, h3 near keywords)
    // =========================================================================
    strategyUsed = 'STRATEGY_3_STRUCTURAL_PROXIMITY';
    $('h2, h3, h4').each((_, el) => {
      const heading = $(el);
      const headingText = heading.text().trim();
      const parentContainer = heading.closest('div, section, li, article');

      if (headingText.length > 3 && headingText.length < 120 && parentContainer.length > 0) {
        const containerText = parentContainer.text();
        const hasJobKeywords = /salary|remote|full-time|apply|location|developer|engineer|manager|hybrid/i.test(containerText);

        if (hasJobKeywords) {
          const anchor = parentContainer.find('a[href]').first();
          const link = anchor.attr('href') || baseUrl;

          const parsed = JobListingSchema.safeParse({
            title: headingText,
            company: parentContainer.find('p, span').first().text().trim().slice(0, 60) || 'Direct Hire',
            location: /remote/i.test(containerText) ? 'Remote' : 'On-Site',
            link: ResilientHTMLParser.resolveUrl(baseUrl, link),
            publishedAt: new Date().toISOString(),
          });

          if (parsed.success && !jobs.some((j) => j.title === headingText)) {
            jobs.push(parsed.data);
          }
        }
      }
    });

    return {
      jobs,
      diagnostics: {
        isHoneypotOrBlocked: false,
        payloadByteLength: byteLength,
        selectorStrategyUsed: jobs.length > 0 ? strategyUsed : 'NO_MATCH',
        itemCount: jobs.length,
      },
    };
  }

  private static cleanText(text: string): string {
    return text.replace(/\s+/g, ' ').replace(/<[^>]*>?/gm, '').trim();
  }

  private static resolveUrl(baseUrl: string, relativePath: string): string {
    if (!relativePath) return baseUrl;
    try {
      return new URL(relativePath, baseUrl).toString();
    } catch {
      return relativePath;
    }
  }
}

/**
 * Scrapes a target URL using paired browser profile headers and resilient parsing.
 */
export async function scrapeSandboxJobs(targetUrl: string): Promise<ScrapeResult> {
  const profile = getRandomBrowserProfile();
  const headers = buildHeadersFromProfile(profile);

  const response = await fetch(targetUrl, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(8000),
  });

  if (response.status === 429) {
    return {
      jobs: [],
      diagnostics: {
        isHoneypotOrBlocked: true,
        blockReason: 'HTTP 429 Rate Limit Exceeded by Target Server',
        payloadByteLength: 0,
        selectorStrategyUsed: 'RATE_LIMITED_429',
        itemCount: 0,
      },
    };
  }

  const html = await response.text();
  return ResilientHTMLParser.parseJobsFromHTML(html, targetUrl);
}
