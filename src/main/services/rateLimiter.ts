/**
 * Smart Rate Limiter for PoE Trade API
 * 
 * Respects server-provided rate limit headers and maintains a local budget
 * to ensure we never exceed 80% of allowed requests in any window.
 * 
 * Rate limit format: "5:60:60,10:600:120,15:10800:3600"
 * Means: maxRequests:windowSeconds:penaltySeconds
 * - 5 requests per 60s window (60s penalty)
 * - 10 requests per 600s window (120s penalty)
 * - 15 requests per 10800s window (3600s penalty)
 */

export interface RateLimitRule {
  maxRequests: number;
  windowSeconds: number;
  penaltySeconds: number;
}

export interface RateLimitState {
  remaining: number;
  windowSeconds: number;
  resetSeconds: number;
}

export interface RateLimitBudget {
  canRequest: boolean;
  reason?: string;
  retryAfter?: number; // seconds until next request allowed
  nextSlot?: number; // timestamp when next slot available
}

export class RateLimiter {
  private rules: RateLimitRule[] = [];
  private states: RateLimitState[] = [];
  private requestHistory: number[] = []; // timestamps of past requests
  private lastRetryAfter: number | null = null;
  private retryAfterUntil: number | null = null;
  private safetyMargin = 0.8; // Use max 80% of budget

  constructor() {
    // Default conservative rules (will be updated from server headers)
    this.setRulesFromHeader('5:60:60,10:600:120,15:10800:3600');
  }

  /**
   * Parse rate limit rules from server header
   * Format: "maxRequests:windowSeconds:penaltySeconds,..."
   */
  setRulesFromHeader(header: string): void {
    try {
      const parts = header.split(',').map(s => s.trim());
      this.rules = parts.map(part => {
        const [max, window, penalty] = part.split(':').map(Number);
        return { maxRequests: max, windowSeconds: window, penaltySeconds: penalty };
      });
      
      // Initialize states if not present
      if (this.states.length === 0) {
        this.states = this.rules.map(rule => ({
          remaining: rule.maxRequests,
          windowSeconds: rule.windowSeconds,
          resetSeconds: 0
        }));
      }
    } catch (e) {
      console.error('Failed to parse rate limit header:', header, e);
    }
  }

  /**
   * Update current state from server response headers
   * Format: "remaining:windowSeconds:resetSeconds,..."
   */
  updateStateFromHeader(header: string): void {
    try {
      const parts = header.split(',').map(s => s.trim());
      this.states = parts.map(part => {
        const [remaining, window, reset] = part.split(':').map(Number);
        return { remaining, windowSeconds: window, resetSeconds: reset };
      });
    } catch (e) {
      console.error('Failed to parse rate limit state header:', header, e);
    }
  }

  /**
   * Set retry-after from 429 response
   */
  setRetryAfter(seconds: number): void {
    this.lastRetryAfter = seconds;
    this.retryAfterUntil = Date.now() + (seconds * 1000);
  }

  /**
   * Record a successful request
   */
  recordRequest(): void {
    const now = Date.now();
    this.requestHistory.push(now);
    
    // Clean up old history outside the longest window
    const longestWindow = Math.max(...this.rules.map(r => r.windowSeconds));
    const cutoff = now - (longestWindow * 1000);
    this.requestHistory = this.requestHistory.filter(t => t >= cutoff);
  }

  /**
   * Check if we can make a request based on local tracking + server state
   */
  canRequest(): RateLimitBudget {
    const now = Date.now();

    // Check if we're in a retry-after penalty
    if (this.retryAfterUntil && now < this.retryAfterUntil) {
      const waitSeconds = Math.ceil((this.retryAfterUntil - now) / 1000);
      return {
        canRequest: false,
        reason: `Rate limited by server. Retry after ${waitSeconds}s`,
        retryAfter: waitSeconds,
        nextSlot: this.retryAfterUntil
      };
    }

    // Check each window with safety margin
    for (let i = 0; i < this.rules.length; i++) {
      const rule = this.rules[i];
      const state = this.states[i];
      
      // Local tracking: count requests in this window
      const windowStart = now - (rule.windowSeconds * 1000);
      const requestsInWindow = this.requestHistory.filter(t => t >= windowStart).length;
      
      // Apply safety margin (use 80% of limit)
      const safeLimit = Math.floor(rule.maxRequests * this.safetyMargin);
      
      // Check local tracking
      if (requestsInWindow >= safeLimit) {
        const oldestInWindow = this.requestHistory.find(t => t >= windowStart);
        const nextSlot = oldestInWindow ? oldestInWindow + (rule.windowSeconds * 1000) : now + (rule.windowSeconds * 1000);
        const waitSeconds = Math.ceil((nextSlot - now) / 1000);
        
        return {
          canRequest: false,
          reason: `Local budget exhausted for ${rule.windowSeconds}s window (${requestsInWindow}/${safeLimit})`,
          retryAfter: waitSeconds,
          nextSlot
        };
      }

      // Check server-provided state (if available)
      if (state) {
        const serverSafeLimit = Math.floor(rule.maxRequests * this.safetyMargin);
        if (state.remaining < (rule.maxRequests - serverSafeLimit)) {
          const nextSlot = now + (state.resetSeconds * 1000);
          return {
            canRequest: false,
            reason: `Server budget low for ${rule.windowSeconds}s window (${state.remaining} remaining)`,
            retryAfter: state.resetSeconds,
            nextSlot
          };
        }
      }
    }

    return { canRequest: true };
  }

  /**
   * Get human-readable status
   */
  getStatus(): string {
    const lines: string[] = [];
    lines.push('Rate Limit Status:');
    
    for (let i = 0; i < this.rules.length; i++) {
      const rule = this.rules[i];
      const state = this.states[i];
      const now = Date.now();
      const windowStart = now - (rule.windowSeconds * 1000);
      const localCount = this.requestHistory.filter(t => t >= windowStart).length;
      const safeLimit = Math.floor(rule.maxRequests * this.safetyMargin);
      
      const windowLabel = rule.windowSeconds < 3600 
        ? `${rule.windowSeconds / 60}min`
        : `${rule.windowSeconds / 3600}hr`;
      
      lines.push(
        `  ${windowLabel}: ${localCount}/${safeLimit} used (server: ${state?.remaining ?? '?'}/${rule.maxRequests})`
      );
    }
    
    if (this.retryAfterUntil) {
      const wait = Math.ceil((this.retryAfterUntil - Date.now()) / 1000);
      if (wait > 0) {
        lines.push(`  ⚠ Rate limited - retry in ${wait}s`);
      }
    }
    
    return lines.join('\n');
  }

  /**
   * Reset all tracking (use with caution)
   */
  reset(): void {
    this.requestHistory = [];
    this.retryAfterUntil = null;
    this.lastRetryAfter = null;
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();
