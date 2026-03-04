import { BrowserWindow, session } from 'electron';
import { httpGetRaw } from './http';
import { rateLimiter } from '../services/rateLimiter';
import type { OverlayVersion } from '../../types/overlayVersion.js';
import { POE1_LEAGUE_ENDED, POE2_LEAGUE_ENDED } from '../../shared/leagueStatus.js';

export interface PoeHistoryResponse { 
  ok: boolean; 
  status: number; 
  data?: any; 
  headers?: Record<string,string>; 
  error?: string;
  rateLimited?: boolean;
  retryAfter?: number;
  leagueEnded?: boolean; // New flag to indicate league has ended
}

export class PoeSessionHelper {
  constructor(
    private getAccountName: () => string | null,
    private setAccountName: (n: string | null) => void,
    private getOverlayVersion: () => OverlayVersion,
    private getOverlayWindow?: () => BrowserWindow | null
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
      'Mirage': 'Mirage',
      'Hardcore Mirage': 'Hardcore Mirage',
      'Keepers of the Flame': 'Keepers',
      'Hardcore Keepers of the Flame': 'Hardcore Keepers',
      'HC Keepers of the Flame': 'Hardcore Keepers',
      'Standard': 'Standard',
      'Hardcore': 'Hardcore'
    };

    return poe1LeagueMap[league] || league;
  }

  async fetchHistory(league: string): Promise<PoeHistoryResponse> {
    // Check global league ended flag (but allow permanent leagues like Standard/Hardcore)
    const isPermanentLeague = /^(standard|hardcore)$/i.test(league.trim());
    const overlayVersion = this.safeOverlayVersion();
    const leagueEnded = (overlayVersion === 'poe1' ? POE1_LEAGUE_ENDED : POE2_LEAGUE_ENDED) && !isPermanentLeague;
    
    if (leagueEnded) {
      console.log(`[PoeSession] Global ${overlayVersion === 'poe1' ? 'POE1' : 'POE2'}_LEAGUE_ENDED flag is true, blocking fetch for "${league}"`);
      return {
        ok: false,
        status: 410,
        error: 'League has ended (global config)',
        leagueEnded: true
      };
    }
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

      if (statusCode === 410) {
        // League has ended (Gone) - GGG returns 410 for ended leagues
        console.log(`[PoeSession] League "${league}" returned 410 Gone - league has ended`);
        return { 
          ok: false, 
          status: 410, 
          error: 'League has ended',
          leagueEnded: true
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
      // Calculate position to the right of overlay (or left if not enough space)
      let x = 100, y = 100;
      try {
        const overlayWin = this.getOverlayWindow?.();
        if (overlayWin && !overlayWin.isDestroyed()) {
          const { screen } = require('electron');
          const overlayBounds = overlayWin.getBounds();
          const display = screen.getDisplayNearestPoint({ x: overlayBounds.x, y: overlayBounds.y });
          const workArea = display.workArea;

          // Try to position to the right of overlay
          const loginWidth = 900;
          const loginHeight = 900;
          const rightX = overlayBounds.x + overlayBounds.width + 20;
          
          if (rightX + loginWidth <= workArea.x + workArea.width) {
            // Enough space on the right
            x = rightX;
            y = overlayBounds.y;
          } else {
            // Not enough space on right, try left
            const leftX = overlayBounds.x - loginWidth - 20;
            if (leftX >= workArea.x) {
              x = leftX;
              y = overlayBounds.y;
            } else {
              // No space on either side, center it
              x = Math.max(workArea.x, overlayBounds.x + (overlayBounds.width - loginWidth) / 2);
              y = Math.max(workArea.y, overlayBounds.y + 50);
            }
          }

          // Clamp to screen bounds
          x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - loginWidth));
          y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - loginHeight));
        }
      } catch (e) {
        console.warn('[PoeSession] Failed to calculate login window position:', e);
      }

      // Always open the window so user can login/logout/manage session
      const loginWin = new BrowserWindow({
        width: 900, 
        height: 900, 
        x, 
        y,
        title: 'Log in to pathofexile.com',
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
