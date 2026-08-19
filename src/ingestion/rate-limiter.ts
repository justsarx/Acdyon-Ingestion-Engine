/**
 * Token Bucket Pacing Engine & Circuit Breaker
 * 
 * Features:
 * 1. Token Bucket Algorithm for sub-second request pacing and burst handling.
 * 2. Exponential Backoff with randomized ±25% Full Jitter (RFC 8900 / AWS Architecture best practice)
 *    to prevent the "thundering herd" problem.
 * 3. Circuit Breaker Pattern (CLOSED -> OPEN -> HALF_OPEN) for upstream failure isolation.
 */

export interface TokenBucketOptions {
  capacity: number;       // Maximum burst capacity
  refillRate: number;     // Tokens added per second
}

export class TokenBucket {
  private capacity: number;
  private refillRate: number;
  private tokens: number;
  private lastRefill: number;

  constructor(options: TokenBucketOptions = { capacity: 5, refillRate: 2 }) {
    this.capacity = options.capacity;
    this.refillRate = options.refillRate;
    this.tokens = options.capacity;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillRate);
    this.lastRefill = now;
  }

  public async acquire(tokensRequired: number = 1): Promise<void> {
    this.refill();

    if (this.tokens >= tokensRequired) {
      this.tokens -= tokensRequired;
      return;
    }

    const missingTokens = tokensRequired - this.tokens;
    const waitTimeMs = (missingTokens / this.refillRate) * 1000;

    await new Promise((resolve) => setTimeout(resolve, waitTimeMs));
    this.refill();
    this.tokens = Math.max(0, this.tokens - tokensRequired);
  }

  public getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
}

/**
 * Calculates exponential backoff with ±25% uniform jitter.
 * 
 * Formula:
 * baseWait = min(maxDelayMs, initialDelayMs * (2 ^ attempt))
 * jitter = baseWait * (0.75 + Math.random() * 0.5) // Range [0.75 * baseWait, 1.25 * baseWait]
 */
export function calculateExponentialBackoffWithJitter(
  attempt: number,
  initialDelayMs: number = 1000,
  maxDelayMs: number = 30000
): number {
  const exponentialDelay = Math.min(maxDelayMs, initialDelayMs * Math.pow(2, attempt));
  // ±25% uniform jitter
  const jitterFactor = 0.75 + Math.random() * 0.5;
  return Math.round(exponentialDelay * jitterFactor);
}

export enum CircuitState {
  CLOSED = 'CLOSED',       // Normal operation
  OPEN = 'OPEN',           // Failing, fast-drop requests or route to Plan B
  HALF_OPEN = 'HALF_OPEN', // Probing upstream recovery
}

export interface CircuitBreakerOptions {
  failureThreshold: number;   // Number of consecutive failures to trip
  recoveryTimeoutMs: number;  // Time to remain open before half-open probe
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private nextAttempt: number = Date.now();
  private readonly failureThreshold: number;
  private readonly recoveryTimeoutMs: number;

  constructor(options: CircuitBreakerOptions = { failureThreshold: 3, recoveryTimeoutMs: 15000 }) {
    this.failureThreshold = options.failureThreshold;
    this.recoveryTimeoutMs = options.recoveryTimeoutMs;
  }

  public getState(): CircuitState {
    if (this.state === CircuitState.OPEN && Date.now() >= this.nextAttempt) {
      this.state = CircuitState.HALF_OPEN;
    }
    return this.state;
  }

  public recordSuccess(): void {
    this.failureCount = 0;
    this.state = CircuitState.CLOSED;
  }

  public recordFailure(): void {
    this.failureCount++;
    if (this.failureCount >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.recoveryTimeoutMs;
    }
  }

  public isOpen(): boolean {
    return this.getState() === CircuitState.OPEN;
  }

  public getMetrics() {
    return {
      state: this.getState(),
      failureCount: this.failureCount,
      failureThreshold: this.failureThreshold,
      nextAttempt: this.state === CircuitState.OPEN ? new Date(this.nextAttempt).toISOString() : null,
    };
  }
}

// Global default token bucket for ingestion pacing
export const globalRateLimiter = new TokenBucket({ capacity: 5, refillRate: 2 });
export const globalCircuitBreaker = new CircuitBreaker({ failureThreshold: 3, recoveryTimeoutMs: 15000 });
