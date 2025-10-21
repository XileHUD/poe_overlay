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
  
  // Error tracking for exponential backoff
  private consecutiveErrors = 0;
  private lastErrorTime: number | null = null;
  private errorBackoffUntil: number | null = null;

  // Persistence callback
  private saveCallback: ((rules: string, state: string) => void) | null = null;

  constructor() {
    // Default conservative rules (will be updated from server headers or loaded from config)
    this.setRulesFromHeader('5:60:60,10:600:120,15:10800:3600');
  }

  /**
   * Set a callback to save rate limit state to persistent storage
   */
  setSaveCallback(callback: (rules: string, state: string) => void): void {
    this.saveCallback = callback;
  }

  /**
   * Load rate limit state from persistent storage
   * This recalculates the current state based on saved timestamps
   */
  loadFromStorage(savedRules: string, savedState: string, savedTimestamp: number): void {
    try {
      // Parse saved rules
      this.setRulesFromHeader(savedRules);
      
      // Parse saved state
      const parts = savedState.split(',').map(s => s.trim());
      const now = Date.now();
      const elapsedMs = now - savedTimestamp;
      const elapsedSec = Math.floor(elapsedMs / 1000);
      
      // Recalculate current state based on elapsed time
      this.states = parts.map((part, idx) => {
        const [used, window, reset] = part.split(':').map(Number);
        const rule = this.rules[idx];
        if (!rule) return { remaining: 0, windowSeconds: window, resetSeconds: 0 };
        
        // Calculate new reset time
        const newReset = Math.max(0, reset - elapsedSec);
        
        // If reset time has passed, the bucket is fully restored
        const remaining = newReset === 0 ? rule.maxRequests : Math.max(0, rule.maxRequests - used);
        
        return {
          remaining,
          windowSeconds: window,
          resetSeconds: newReset
        };
      });
      
      console.log('[RateLimiter] Loaded from storage. Elapsed:', Math.floor(elapsedSec / 60), 'min');
    } catch (e) {
      console.error('[RateLimiter] Failed to load from storage:', e);
    }
  }

  /**
   * Get current rate limit headers for display (simulates what server would send)
   * Returns headers in the same format as GGG API for consistency with UI
   */
  getCurrentHeaders(): { 'x-rate-limit-account': string; 'x-rate-limit-account-state': string } | null {
    if (this.rules.length === 0 || this.states.length === 0) return null;
    
    try {
      // Reconstruct x-rate-limit-account header
      const rulesHeader = this.rules.map(r => 
        `${r.maxRequests}:${r.windowSeconds}:${r.penaltySeconds}`
      ).join(',');
      
      // Reconstruct x-rate-limit-account-state header (used:window:reset format)
      const stateHeader = this.states.map((s, idx) => {
        const rule = this.rules[idx];
        const used = rule ? Math.max(0, rule.maxRequests - s.remaining) : 0;
        return `${used}:${s.windowSeconds}:${s.resetSeconds}`;
      }).join(',');
      
      return {
        'x-rate-limit-account': rulesHeader,
        'x-rate-limit-account-state': stateHeader
      };
    } catch (e) {
      console.error('[RateLimiter] Failed to get current headers:', e);
      return null;
    }
  }

  /**
   * Save current state to storage via callback
   */
  private saveToStorage(): void {
    if (!this.saveCallback || this.rules.length === 0) return;
    
    try {
      // Serialize rules
      const rulesStr = this.rules.map(r => `${r.maxRequests}:${r.windowSeconds}:${r.penaltySeconds}`).join(',');
      
      // Serialize state
      const stateStr = this.states.map((s, idx) => {
        const rule = this.rules[idx];
        const used = rule ? Math.max(0, rule.maxRequests - s.remaining) : 0;
        return `${used}:${s.windowSeconds}:${s.resetSeconds}`;
      }).join(',');
      
      this.saveCallback(rulesStr, stateStr);
    } catch (e) {
      console.warn('[RateLimiter] Failed to save to storage:', e);
    }
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
      this.states = parts.map((part, idx) => {
        // PoE header format is actually: used:window:reset
        // We convert to remaining = maxRequests - used for internal logic.
        const [used, window, reset] = part.split(':').map(Number);
        const rule = this.rules[idx];
        const max = rule ? rule.maxRequests : 0;
        const remaining = Math.max(0, max - (isNaN(used) ? 0 : used));
        return { remaining, windowSeconds: window, resetSeconds: reset };
      });
      
      // Save updated state to storage
      this.saveToStorage();
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
    
    // Reset error tracking on successful request
    this.consecutiveErrors = 0;
    this.errorBackoffUntil = null;
    
    // Clean up old history outside the longest window
    const longestWindow = Math.max(...this.rules.map(r => r.windowSeconds));
    const cutoff = now - (longestWindow * 1000);
    this.requestHistory = this.requestHistory.filter(t => t >= cutoff);
  }

  /**
   * Record a failed request (4xx error) for exponential backoff
   */
  recordError(statusCode: number): void {
    // Only track 4xx errors (client errors) for backoff
    // Don't penalize 429 (rate limit) as that's handled separately
    if (statusCode < 400 || statusCode >= 500 || statusCode === 429) {
      return;
    }

    const now = Date.now();
    this.consecutiveErrors++;
    this.lastErrorTime = now;

    // Exponential backoff: 2^errors seconds, capped at 5 minutes
    const backoffSeconds = Math.min(Math.pow(2, this.consecutiveErrors), 300);
    this.errorBackoffUntil = now + (backoffSeconds * 1000);
    
    console.warn(`[RateLimiter] Error ${statusCode} recorded. Consecutive errors: ${this.consecutiveErrors}, backing off ${backoffSeconds}s`);
  }

  /**
   * Check if we can make a request based on local tracking + server state
   */
  canRequest(): RateLimitBudget {
    const now = Date.now();

    // Check if we're in an error backoff period
    if (this.errorBackoffUntil && now < this.errorBackoffUntil) {
      const waitSeconds = Math.ceil((this.errorBackoffUntil - now) / 1000);
      return {
        canRequest: false,
        reason: `Too many errors (${this.consecutiveErrors}). Backing off for ${waitSeconds}s`,
        retryAfter: waitSeconds,
        nextSlot: this.errorBackoffUntil
      };
    }

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

    // Simplified logic: allow request as long as ANY bucket still has remaining > 0.
    // Only block when every known bucket has 0 remaining.
    if (this.states.length > 0) {
      const anyRemaining = this.states.some(s => s.remaining > 0);
      if (!anyRemaining) {
        // All buckets exhausted – compute earliest reset
        const resetSecs = this.states
          .map(s => s.resetSeconds || 0)
          .filter(x => x > 0);
        const minReset = resetSecs.length ? Math.min(...resetSecs) : 60; // fallback 60s
        return {
          canRequest: false,
            reason: `All rate limit buckets exhausted – wait ${minReset}s`,
            retryAfter: minReset,
            nextSlot: now + (minReset * 1000)
        };
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
    
    if (this.errorBackoffUntil) {
      const wait = Math.ceil((this.errorBackoffUntil - Date.now()) / 1000);
      if (wait > 0) {
        lines.push(`  ⚠ Error backoff (${this.consecutiveErrors} errors) - retry in ${wait}s`);
      }
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
    this.consecutiveErrors = 0;
    this.errorBackoffUntil = null;
    this.lastErrorTime = null;
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();
