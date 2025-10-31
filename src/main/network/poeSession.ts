import { BrowserWindow, session } from 'electron';
import { httpGetRaw } from './http';
import { rateLimiter } from '../services/rateLimiter';
import type { OverlayVersion } from '../../types/overlayVersion.js';

export interface PoeHistoryResponse { 
  ok: boolean; 
  status: number; 
  data?: any; 
  headers?: Record<string,string>; 
  error?: string;
  rateLimited?: boolean;
  retryAfter?: number;
}

export class PoeSessionHelper {
  constructor(
    private getAccountName: () => string | null,
    private setAccountName: (n: string | null) => void,
    private getOverlayVersion: () => OverlayVersion
  ) {}

  async hasSession(): Promise<boolean> {
    try {
      const cookies = await session.defaultSession.cookies.get({ domain: 'pathofexile.com', name: 'POESESSID' });
      return cookies && cookies.length > 0 && !!cookies[0].value;
    } catch { return false; }
  }

  /**
   * Maps display league names to API league names.
   * PoE1 API uses shorter league names (e.g., "Keepers" instead of "Keepers of the Flame")
   */
  private mapLeagueNameForApi(league: string, overlayVersion: OverlayVersion): string {
    if (overlayVersion !== 'poe1') {
      // PoE2 leagues use full names in API
      return league;
    }

    // PoE1 league name mapping (display name -> API name)
    const poe1LeagueMap: Record<string, string> = {
      'Keepers of the Flame': 'Keepers',
      'Hardcore Keepers of the Flame': 'Hardcore Keepers',
      'HC Keepers of the Flame': 'Hardcore Keepers',
      'Standard': 'Standard',
      'Hardcore': 'Hardcore'
    };

    return poe1LeagueMap[league] || league;
  }

  async fetchHistory(league: string): Promise<PoeHistoryResponse> {
    const overlayVersion = this.safeOverlayVersion();
    const tradeRoot = overlayVersion === 'poe1' ? 'trade' : 'trade2';
    const apiLeagueName = this.mapLeagueNameForApi(league, overlayVersion);
    const url = `https://www.pathofexile.com/api/${tradeRoot}/history/${encodeURIComponent(apiLeagueName)}`;
    
    console.log(`[PoeSession] Fetching history for ${overlayVersion} league: "${league}" -> API: "${apiLeagueName}"`);
    
    // Pre-flight check: ensure we have budget before making the request
    const budget = rateLimiter.canRequest();
    if (!budget.canRequest) {
      console.warn('[PoeSession] Rate limit check BEFORE request - blocked:', budget.reason);
      // Return synthetic rate-limited response to preserve existing headers for display
      const savedHeaders = rateLimiter.getCurrentHeaders();
      return {
        ok: false,
        status: 429,
        error: budget.reason || 'Rate limited (pre-flight check)',
        rateLimited: true,
        retryAfter: budget.retryAfter,
        headers: savedHeaders || {}
      };
    }
    
    try {
      const { statusCode, body, headers } = await httpGetRaw(url, {
        Accept: 'application/json',
        Referer: `https://www.pathofexile.com/${tradeRoot}`,
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'XileHUD/0.3.0 (contact: hello@xile.wtf)'
      }, 12000);

      // Update rate limiter with server headers
      if (headers['x-rate-limit-account']) {
        rateLimiter.setRulesFromHeader(headers['x-rate-limit-account']);
      }
      if (headers['x-rate-limit-account-state']) {
        rateLimiter.updateStateFromHeader(headers['x-rate-limit-account-state']);
      }

      // After updating state, check if all buckets exhausted (rare edge: server returned exhausted state w/out 429)
      const postBudget = rateLimiter.canRequest();
      if (!postBudget.canRequest && statusCode !== 200 && statusCode !== 429) {
        return {
          ok: false,
          status: 429,
          error: postBudget.reason || 'Rate limited',
          rateLimited: true,
          retryAfter: postBudget.retryAfter,
          headers
        };
      }

      if (statusCode === 200) {
        // Success - record this request
        rateLimiter.recordRequest();
        
        let json: any = null; 
        try { json = JSON.parse(body); } catch {}
        return { ok: true, status: statusCode, data: json ?? body, headers };
      }

      if (statusCode === 429) {
        // Rate limited by server - respect retry-after
        const retryAfter = parseInt(headers['retry-after'] || '3600', 10);
        rateLimiter.setRetryAfter(retryAfter);
        
        return { 
          ok: false, 
          status: 429, 
          error: `Rate limited. Retry after ${retryAfter}s`,
          rateLimited: true,
          retryAfter,
          headers
        };
      }

      if (statusCode === 401 || statusCode === 403) {
        rateLimiter.recordError(statusCode);
        return { ok: false, status: statusCode, error: 'Unauthorized' };
      }

      // Record other 4xx errors for exponential backoff
      if (statusCode >= 400 && statusCode < 500) {
        rateLimiter.recordError(statusCode);
      }

      return { ok: false, status: statusCode, error: `HTTP ${statusCode}` };
    } catch (e: any) {
      return { ok: false, status: 0, error: e?.message || 'Network error' };
    }
  }

  async isAuthenticatedProbe(defaultLeague: string): Promise<boolean> {
    try {
      const probe = await this.fetchHistory(defaultLeague);
      return !!probe.ok && probe.status === 200;
    } catch { return false; }
  }

  private safeOverlayVersion(): OverlayVersion {
    try {
      const value = this.getOverlayVersion();
      return value === 'poe1' ? 'poe1' : 'poe2';
    } catch {
      return 'poe2';
    }
  }

  openLoginWindow(): Promise<{ loggedIn: boolean; accountName?: string | null }>{
    return new Promise(async (resolve) => {
      // Always open the window so user can login/logout/manage session
      const loginWin = new BrowserWindow({
        width: 900, height: 900, title: 'Log in to pathofexile.com',
        webPreferences: { nodeIntegration: false, contextIsolation: true }
      });
      
      // When window closes, just check if cookie exists (don't probe API - that triggers CF challenges)
      loginWin.on('closed', async () => {
        const hasCookie = await this.hasSession();
        if (hasCookie) {
          resolve({ loggedIn: true, accountName: this.getAccountName() });
        } else {
          resolve({ loggedIn: false, accountName: null });
        }
      });
      
      loginWin.loadURL('https://www.pathofexile.com/login');
    });
  }
}
