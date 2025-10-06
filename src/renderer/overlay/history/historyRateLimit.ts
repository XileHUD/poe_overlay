/**
 * historyRateLimit.ts
 * 
 * Rate limit utilities for trade history:
 * - Calculate next allowed refresh time
 * - Parse rate limit headers from API responses
 * - Update refresh button UI based on rate limit status
 */

import { historyState } from './historyData';
import { historyVisible } from './historyView';
import { updateRefreshButtonUI } from './refreshButton';
import { autoRefreshManager } from './autoRefresh';

/**
 * Calculate the next allowed refresh timestamp based on:
 * - Global minimum interval (default 5 minutes)
 * - Last fetch timestamp (local or remote)
 * - Rate limit enforcement timestamp
 */
export function nextAllowedRefreshAt(): number {
  const minInterval = historyState.globalMinInterval || 300_000;
  const base = historyState.remoteLastFetchAt || historyState.lastRefreshAt || 0;
  return Math.max(base + minInterval, historyState.rateLimitUntil || 0);
}

let _refreshBtnTimer: any = null;
let _lastRateLimitInfo: { limits: string; state: string; budget: string } | null = null;

/**
 * Store rate limit info from last fetch for display
 */
export function setRateLimitInfo(headers: any): void {
  try {
    const limits = headers?.['x-rate-limit-account'] || headers?.['x-rate-limit-ip'] || 'Unknown';
    const state = headers?.['x-rate-limit-account-state'] || headers?.['x-rate-limit-ip-state'] || 'Unknown';
    
    // Parse to show friendly budget
    const limitLines: string[] = [];
    const stateLines: string[] = [];
    const budgetLines: string[] = [];
    
    const limitBucketParts: { limit: number; period: number }[] = [];
    if (typeof limits === 'string' && limits !== 'Unknown') {
      const buckets = limits.split(',');
      buckets.forEach((bucket) => {
        const [limitStr, periodStr] = bucket.split(':');
        const limit = Number(limitStr);
        const periodSec = Number(periodStr);
        limitBucketParts.push({ limit, period: periodSec });
        const periodDesc = formatWindow(periodSec);
        limitLines.push(`• ${limit} requests / ${periodDesc}`);
      });
    }
    
    if (typeof state === 'string' && state !== 'Unknown') {
      const buckets = state.split(',');
      buckets.forEach((bucket, i) => {
        const [usedStr, periodStr, resetStr] = bucket.split(':');
        const used = Number(usedStr);
        const resetSec = Number(resetStr);
        const resetDesc = formatReset(resetSec);
        stateLines.push(`• ${used} used (resets in ${resetDesc})`);
        
        // Budget line paired with its period window
        const limitInfo = limitBucketParts[i];
        if (limitInfo) {
          const remaining = limitInfo.limit - used;
          const windowDesc = formatWindow(limitInfo.period);
          budgetLines.push(`• ${remaining}/${limitInfo.limit} remaining (${windowDesc})`);
        }
      });
    }
    
    _lastRateLimitInfo = {
      limits: limitLines.length > 0 ? limitLines.join('\n') : limits.toString(),
      state: stateLines.length > 0 ? stateLines.join('\n') : state.toString(),
      budget: budgetLines.length > 0 ? budgetLines.join('\n') : 'Unknown'
    };
  } catch (e) {
    console.warn('[RateLimit] Failed to parse rate limit info:', e);
  }
}

// ===== Formatting helpers =====
function formatWindow(periodSec: number): string {
  if (!periodSec || periodSec <= 0) return 'unknown window';
  if (periodSec < 60) return `${periodSec}s`;
  const mins = Math.floor(periodSec / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remM = mins % 60;
  return remM ? `${hrs}h ${remM}m` : `${hrs}h`;
}

function formatReset(resetSec: number): string {
  if (resetSec <= 0) return 'soon';
  if (resetSec < 60) return `${resetSec}s`;
  const mins = Math.floor(resetSec / 60);
  if (mins < 60) {
    const secs = resetSec % 60;
    return secs ? `${mins}m ${secs}s` : `${mins}m`;
  }
  const hrs = Math.floor(mins / 60);
  const remM = mins % 60;
  return remM ? `${hrs}h ${remM}m` : `${hrs}h`;
}

/**
 * Update the refresh button UI to reflect current rate limit status.
 * Shows countdown timer if rate limited, enables button if ready.
 * Schedules next update if waiting for rate limit to expire.
 */
export function updateHistoryRefreshButton(): void {
  if (!historyVisible()) return;
  
  const now = Date.now();
  const nextAt = nextAllowedRefreshAt();
  const waitMs = Math.max(0, nextAt - now);
  const canRefresh = waitMs === 0;
  const retryAfterSecs = Math.ceil(waitMs / 1000);
  const autoRefreshActive = autoRefreshManager.isRunning();
  
  updateRefreshButtonUI(canRefresh, retryAfterSecs, autoRefreshActive, _lastRateLimitInfo || undefined);
  
  // Schedule next update if rate limited
  if (waitMs > 0) {
    if (_refreshBtnTimer) clearTimeout(_refreshBtnTimer);
    _refreshBtnTimer = setTimeout(() => { 
      _refreshBtnTimer = null; 
      updateHistoryRefreshButton(); 
    }, Math.min(waitMs, 1000));
  } else {
    if (_refreshBtnTimer) { 
      clearTimeout(_refreshBtnTimer); 
      _refreshBtnTimer = null; 
    }
  }
}

/**
 * Parse rate limit headers from GGG API response.
 * 
 * Headers format:
 * - x-rate-limit-account: "5:60:60,10:600:120,15:10800:3600"
 * - x-rate-limit-account-state: "4:60:55,9:600:115,12:10800:3595"
 * - retry-after: "30" (seconds, if 429)
 * 
 * Returns the timestamp (ms) until which we should not make requests.
 * If any bucket is full or nearly full, we wait until it resets.
 * 
 * @param headers - Response headers object
 * @param status - HTTP status code (429 = rate limited)
 * @returns Timestamp in ms when rate limit expires (0 if not limited)
 */
export function parseRateLimitHeaders(headers: any, status?: number): number {
  try {
    const now = Date.now();
    
    // Check retry-after header first (explicit rate limit)
    const retryAfter = Number(((headers?.["retry-after"] || "") as string).split(",")[0]) || 0;
    let until = retryAfter ? now + retryAfter * 1000 : 0;
    
    // Parse rate limit rules and current state
    const lim = (headers?.["x-rate-limit-account"] || headers?.["x-rate-limit-ip"] || "").toString();
    const st = (headers?.["x-rate-limit-account-state"] || headers?.["x-rate-limit-ip-state"] || "").toString();
    
    // Parse limit buckets: "5:60:60" = 5 requests per 60 seconds, resets every 60s
    const limits = lim
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean)
      .map((s: string) => {
        const [limit, period] = s.split(":").map((x) => Number(x || 0));
        return { limit, period } as any;
      });
    
    // Parse state buckets: "4:60:55" = 4 used, 60s period, 55s until reset
    const states = st
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean)
      .map((s: string) => {
        const [used, period, reset] = s.split(":").map((x) => Number(x || 0));
        return { used, period, reset } as any;
      });
    
    // Check each bucket - if full or nearly full, wait for reset
    for (let i = 0; i < Math.min(limits.length, states.length); i++) {
      const L = limits[i];
      const S = states[i];
      if (!L || !S) continue;
      
      // Bucket is full
      if ((S as any).used >= (L as any).limit) {
        until = Math.max(until, now + ((S as any).reset || 1) * 1000 + 500);
      } 
      // Bucket has only 1 request left - be conservative
      else if ((L as any).limit > 0) {
        if ((L as any).limit - (S as any).used <= 1) {
          until = Math.max(until, now + ((S as any).reset || 1) * 1000 + 500);
        }
      }
    }
    
    // If we got 429 status but no clear headers, wait 30 seconds
    if (status === 429) until = Math.max(until, now + 30_000);
    
    return until || 0;
  } catch {
    return 0;
  }
}
