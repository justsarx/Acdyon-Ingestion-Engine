/**
 * Curated Browser Profiles & Header Presets
 * 
 * Strict Pairing Matrix: User-Agent + Client Hints (Sec-CH-UA) + Platform Signatures.
 * In anti-bot detection systems (Cloudflare, Akamai, Datadome), inconsistencies between
 * navigator.userAgent and Sec-CH-UA headers trigger immediate bot classification.
 */

export interface BrowserProfile {
  name: string;
  userAgent: string;
  secChUa: string;
  secChUaMobile: string;
  secChUaPlatform: string;
  accept: string;
  acceptLanguage: string;
  acceptEncoding: string;
  secFetchDest: string;
  secFetchMode: string;
  secFetchSite: string;
  secFetchUser: string;
  upgradeInsecureRequests: string;
}

export const BROWSER_PROFILES: BrowserProfile[] = [
  {
    name: 'Chrome 122 - macOS (Apple Silicon)',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    secChUa: '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
    secChUaMobile: '?0',
    secChUaPlatform: '"macOS"',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    acceptLanguage: 'en-US,en;q=0.9',
    acceptEncoding: 'gzip, deflate, br',
    secFetchDest: 'document',
    secFetchMode: 'navigate',
    secFetchSite: 'none',
    secFetchUser: '?1',
    upgradeInsecureRequests: '1',
  },
  {
    name: 'Chrome 122 - Windows 11 (x64)',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    secChUa: '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
    secChUaMobile: '?0',
    secChUaPlatform: '"Windows"',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    acceptLanguage: 'en-US,en;q=0.9',
    acceptEncoding: 'gzip, deflate, br',
    secFetchDest: 'document',
    secFetchMode: 'navigate',
    secFetchSite: 'none',
    secFetchUser: '?1',
    upgradeInsecureRequests: '1',
  },
  {
    name: 'Chrome 121 - Linux (x86_64)',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    secChUa: '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
    secChUaMobile: '?0',
    secChUaPlatform: '"Linux"',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    acceptLanguage: 'en-US,en;q=0.8',
    acceptEncoding: 'gzip, deflate, br',
    secFetchDest: 'document',
    secFetchMode: 'navigate',
    secFetchSite: 'none',
    secFetchUser: '?1',
    upgradeInsecureRequests: '1',
  },
  {
    name: 'Firefox 123 - macOS',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0',
    secChUa: '', // Firefox does not send sec-ch-ua headers
    secChUaMobile: '',
    secChUaPlatform: '',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    acceptLanguage: 'en-US,en;q=0.5',
    acceptEncoding: 'gzip, deflate, br',
    secFetchDest: 'document',
    secFetchMode: 'navigate',
    secFetchSite: 'none',
    secFetchUser: '?1',
    upgradeInsecureRequests: '1',
  },
  {
    name: 'Safari 17.3 - macOS Sonoma',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Safari/605.1.15',
    secChUa: '', // Safari does not send sec-ch-ua headers
    secChUaMobile: '',
    secChUaPlatform: '',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    acceptLanguage: 'en-US,en;q=0.9',
    acceptEncoding: 'gzip, deflate, br',
    secFetchDest: 'document',
    secFetchMode: 'navigate',
    secFetchSite: 'none',
    secFetchUser: '?1',
    upgradeInsecureRequests: '1',
  },
];

/**
 * Returns a randomized browser identity with coherent headers.
 */
export function getRandomBrowserProfile(): BrowserProfile {
  const index = Math.floor(Math.random() * BROWSER_PROFILES.length);
  return BROWSER_PROFILES[index];
}

/**
 * Transforms a BrowserProfile into a standardized HTTP Headers object.
 */
export function buildHeadersFromProfile(profile: BrowserProfile): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': profile.userAgent,
    'Accept': profile.accept,
    'Accept-Language': profile.acceptLanguage,
    'Accept-Encoding': profile.acceptEncoding,
    'Sec-Fetch-Dest': profile.secFetchDest,
    'Sec-Fetch-Mode': profile.secFetchMode,
    'Sec-Fetch-Site': profile.secFetchSite,
    'Sec-Fetch-User': profile.secFetchUser,
    'Upgrade-Insecure-Requests': profile.upgradeInsecureRequests,
    'Connection': 'keep-alive',
    'Cache-Control': 'max-age=0',
  };

  // Only attach Client Hints if the browser supports them (Chromium family)
  if (profile.secChUa) {
    headers['sec-ch-ua'] = profile.secChUa;
    headers['sec-ch-ua-mobile'] = profile.secChUaMobile;
    headers['sec-ch-ua-platform'] = profile.secChUaPlatform;
  }

  return headers;
}

/**
 * Compliant Bot Headers for Ethical RSS / Public API ingestion.
 * Identifies the service honestly per RFC 7231 / RFC 9110 and robots.txt conventions.
 */
export function getCompliantBotHeaders(): Record<string, string> {
  return {
    'User-Agent': 'AcdyonIngestionEngine/1.0 (+https://acdyon-demo.up.railway.app; contact@acdyon.com)',
    'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml;q=0.9, */*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection': 'keep-alive',
  };
}
