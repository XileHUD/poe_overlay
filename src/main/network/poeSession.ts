import { BrowserWindow, session } from 'electron';
import { httpGetRaw } from './http';
import { rateLimiter } from '../services/rateLimiter';

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
  constructor(private getAccountName: () => string | null, private setAccountName: (n: string | null)=>void) {}

  async hasSession(): Promise<boolean> {
    try {
      const cookies = await session.defaultSession.cookies.get({ domain: 'pathofexile.com', name: 'POESESSID' });
      return cookies && cookies.length > 0 && !!cookies[0].value;
    } catch { return false; }
  }

  async fetchHistory(league: string): Promise<PoeHistoryResponse> {
    const url = `https://www.pathofexile.com/api/trade2/history/${encodeURIComponent(league)}`;
    try {
      const { statusCode, body, headers } = await httpGetRaw(url, {
        Accept: 'application/json',
        Referer: 'https://www.pathofexile.com/trade2',
        'X-Requested-With': 'XMLHttpRequest'
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
        return { ok: false, status: statusCode, error: 'Unauthorized' };
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
