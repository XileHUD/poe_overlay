import { BrowserWindow, session } from 'electron';
import { httpGetRaw } from './http';

export interface PoeHistoryResponse { ok: boolean; status: number; data?: any; headers?: Record<string,string>; error?: string; }

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
      if (statusCode === 200) {
        let json: any = null; try { json = JSON.parse(body); } catch {}
        return { ok: true, status: statusCode, data: json ?? body, headers };
      }
      if (statusCode === 401 || statusCode === 403) return { ok: false, status: statusCode, error: 'Unauthorized' };
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
      const already = await this.hasSession();
      if (already) { resolve({ loggedIn: true, accountName: this.getAccountName() }); return; }
      const loginWin = new BrowserWindow({
        width: 900, height: 900, title: 'Log in to pathofexile.com',
        webPreferences: { nodeIntegration: false, contextIsolation: true }
      });
      const finish = async () => {
        const authed = await this.isAuthenticatedProbe('Rise of the Abyssal');
        if (authed) { try { loginWin.close(); } catch {}; resolve({ loggedIn: true, accountName: this.getAccountName() }); return true; }
        return false;
      };
      loginWin.on('closed', async () => {
        const authed = await this.isAuthenticatedProbe('Rise of the Abyssal');
        if (authed) resolve({ loggedIn: true, accountName: this.getAccountName() });
        else resolve({ loggedIn: false, accountName: null });
      });
      loginWin.webContents.on('did-finish-load', () => { finish(); });
      loginWin.webContents.on('did-navigate', () => { finish(); });
      loginWin.loadURL('https://www.pathofexile.com/login');
    });
  }
}
