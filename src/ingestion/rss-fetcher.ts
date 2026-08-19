import parser from 'xml2js';
import { z } from 'zod';
import { getCompliantBotHeaders } from '../config/user-agents';
import { globalRateLimiter, globalCircuitBreaker, calculateExponentialBackoffWithJitter } from './rate-limiter';

/**
 * Zod Schema for runtime type safety & contract validation.
 * Dropping malformed items prevents downstream pipeline crashes.
 */
export const JobListingSchema = z.object({
  title: z.string().min(1, 'Title is required').default('Unknown Position'),
  company: z.string().min(1, 'Company is required').default('Direct Hire'),
  location: z.string().default('Remote'),
  link: z.string().default(''),
  publishedAt: z.string().default(() => new Date().toISOString()),
  description: z.string().optional(),
});

export type JobListing = z.infer<typeof JobListingSchema>;

export interface IngestionResult {
  source: string;
  count: number;
  validCount: number;
  droppedCount: number;
  timestamp: string;
  jobs: JobListing[];
}

/**
 * Low-risk, compliant RSS feed fetcher with token-bucket pacing,
 * exponential backoff retry logic, and Zod contract validation.
 */
export async function fetchPublicJobs(
  feedUrl: string = 'https://weworkremotely.com/remote-jobs.rss',
  maxRetries: number = 3
): Promise<JobListing[]> {
  if (globalCircuitBreaker.isOpen()) {
    throw new Error('Circuit breaker is OPEN. Upstream RSS ingestion temporarily disabled to prevent cascade failures.');
  }

  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= maxRetries) {
    try {
      // 1. Enforce Token Bucket pacing before dispatching request
      await globalRateLimiter.acquire(1);

      // 2. Fetch using compliant bot headers
      const response = await fetch(feedUrl, {
        method: 'GET',
        headers: getCompliantBotHeaders(),
        signal: AbortSignal.timeout(10000), // 10s timeout protection
      });

      if (response.status === 429) {
        throw new Error(`Rate limit exceeded (HTTP 429) on ${feedUrl}`);
      }

      if (!response.ok) {
        throw new Error(`Ingestion failed with status: ${response.status} ${response.statusText}`);
      }

      const xmlData = await response.text();

      // Diagnostic: Empty response check
      if (!xmlData || xmlData.trim().length < 50) {
        throw new Error('Received empty or truncated XML response payload');
      }

      const parsed = await parser.parseStringPromise(xmlData, {
        trim: true,
        explicitArray: true,
        ignoreAttrs: false,
      });

      // Support RSS 2.0 and Atom structures
      const rawItems = parsed.rss?.channel?.[0]?.item || parsed.feed?.entry || [];
      const validatedJobs: JobListing[] = [];

      for (const item of rawItems) {
        const rawCandidate = {
          title: cleanHtmlEntities(item.title?.[0] || 'Unknown Position'),
          company: cleanHtmlEntities(item['dc:creator']?.[0] || item.author?.[0]?.name?.[0] || 'Direct Hire'),
          location: cleanHtmlEntities(item.category?.[0] || item['region']?.[0] || 'Remote'),
          link: item.link?.[0]?._ || item.link?.[0] || item.id?.[0] || '',
          publishedAt: item.pubDate?.[0] || item.published?.[0] || item.updated?.[0] || new Date().toISOString(),
          description: typeof item.description?.[0] === 'string' ? stripTags(item.description[0]).slice(0, 300) : undefined,
        };

        const result = JobListingSchema.safeParse(rawCandidate);
        if (result.success) {
          validatedJobs.push(result.data);
        } else {
          console.warn(`[Ingestion Pipeline] Dropped malformed RSS item:`, result.error.format());
        }
      }

      globalCircuitBreaker.recordSuccess();
      return validatedJobs;
    } catch (err: any) {
      lastError = err;
      attempt++;

      if (attempt > maxRetries) {
        globalCircuitBreaker.recordFailure();
        break;
      }

      const backoffMs = calculateExponentialBackoffWithJitter(attempt);
      console.warn(`[Ingestion Retry] Attempt ${attempt}/${maxRetries} failed: ${err.message}. Retrying in ${backoffMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  throw new Error(`Public jobs ingestion failed after ${maxRetries} attempts. Last error: ${lastError?.message}`);
}

function cleanHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')
    .trim();
}

function stripTags(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>?/gm, '').trim();
}
