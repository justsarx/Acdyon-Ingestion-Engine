import { URL } from 'url';

/**
 * Security & SSRF Defense Utilities
 * Protects ingestion endpoints against Server-Side Request Forgery (SSRF),
 * loopback port scanning, and cloud metadata credential harvesting.
 */

const PRIVATE_IP_RANGES = [
  /^127\./,                          // IPv4 Loopback
  /^10\./,                           // RFC 1918 Class A
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,  // RFC 1918 Class B
  /^192\.168\./,                     // RFC 1918 Class C
  /^169\.254\./,                     // IPv4 Link-Local / Cloud Metadata (AWS/GCP/Azure)
  /^0\./,                            // Broadcast / Current network
  /^::1$/,                           // IPv6 Loopback
  /^[fF][cCdD]/,                     // IPv6 Unique Local Address
  /^[fF][eE][89aAbB]/,               // IPv6 Link-Local
];

const ALLOWED_PUBLIC_PROTOCOLS = new Set(['http:', 'https:']);

export interface URLValidationResult {
  isValid: boolean;
  sanitizedUrl?: string;
  error?: string;
}

/**
 * Validates whether a target URL is safe to request from the server.
 * In production mode, requests to private/internal IPs are strictly forbidden.
 */
export function validateTargetUrl(
  inputUrl: string,
  allowLocalhost: boolean = process.env.NODE_ENV !== 'production'
): URLValidationResult {
  if (!inputUrl || typeof inputUrl !== 'string') {
    return { isValid: false, error: 'URL parameter is required and must be a string.' };
  }

  const trimmed = inputUrl.trim();
  if (trimmed.length > 2048) {
    return { isValid: false, error: 'URL exceeds maximum length of 2048 characters.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { isValid: false, error: 'Invalid URL format.' };
  }

  if (!ALLOWED_PUBLIC_PROTOCOLS.has(parsed.protocol)) {
    return { isValid: false, error: `Disallowed protocol: ${parsed.protocol}. Only http: and https: are permitted.` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Allow localhost only if explicitly enabled (e.g. for internal sandbox testing)
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    if (allowLocalhost) {
      return { isValid: true, sanitizedUrl: parsed.toString() };
    }
    return { isValid: false, error: 'Access to loopback/localhost addresses is restricted in production.' };
  }

  // Check private IP ranges
  for (const regex of PRIVATE_IP_RANGES) {
    if (regex.test(hostname)) {
      return { isValid: false, error: `Disallowed target IP: Host ${hostname} resolves to a private or link-local address.` };
    }
  }

  return { isValid: true, sanitizedUrl: parsed.toString() };
}

/**
 * Sanitizes strings against XSS before returning or logging.
 */
export function sanitizeString(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
