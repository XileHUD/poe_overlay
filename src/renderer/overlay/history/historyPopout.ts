/**
 * History Popout Window
 * Manages standalone history window functionality
 */

export interface HistoryState {
  items: any[];
  lastRefreshAt: number;
  rateLimitUntil: number;
  globalMinInterval?: number;
  remoteLastFetchAt?: number;
}

/**
 * Normalize timestamp to milliseconds
 */
function canonicalTs(r: any): number {
  try {
    const raw = r?.time ?? r?.listedAt ?? r?.date ?? 0;
    if (!raw) return 0;
    if (typeof raw === 'number') {
      if (!isFinite(raw) || raw <= 0) return 0;
      return raw < 2_000_000_000 ? raw * 1000 : raw;
    }
    if (typeof raw === 'string' && raw.trim()) {
      const p = Date.parse(raw.trim());
      return isFinite(p) ? p : 0;
    }
  } catch {}
  return 0;
}

/**
 * Open history in a separate popout window
 */
export async function openHistoryPopout(state: HistoryState): Promise<void> {
  try {
    const minInterval = state.globalMinInterval || 300_000;
    const base = state.remoteLastFetchAt || state.lastRefreshAt || 0;
    const nextRefreshAt = Math.max(base + minInterval, state.rateLimitUntil || 0);
    const items = (state.items || []).map((it: any) => {
      if (!it.ts) it.ts = canonicalTs(it);
      return it;
    });
    const payload = { 
      items, 
      lastRefreshAt: state.lastRefreshAt, 
      nextRefreshAt, 
      minInterval 
    };
    await (window as any).electronAPI?.openHistoryPopout?.(payload);
  } catch (e) {
    console.error('Failed to open history popout:', e);
  }
}

/**
 * Handle refresh request from popout window
 */
export async function handlePopoutRefreshRequest(
  state: HistoryState,
  refreshCallback: () => Promise<boolean | void>,
  sendCallback: () => void
): Promise<void> {
  try {
    const minInterval = state.globalMinInterval || 300_000;
    const base = state.remoteLastFetchAt || state.lastRefreshAt || 0;
    const nextRefreshAt = Math.max(base + minInterval, state.rateLimitUntil || 0);
    
    if (Date.now() < nextRefreshAt) {
      // Send current data back without refreshing
      sendCallback();
      return;
    }
    
    // Perform refresh
    const result = await refreshCallback();
    
    // Send updated data to popout
    if (result !== false) {
      sendCallback();
    }
  } catch (e) {
    console.error('Failed to handle popout refresh:', e);
  }
}

/**
 * Send current history data to popout window
 */
export function sendHistoryToPopout(state: HistoryState): void {
  try {
    const minInterval = state.globalMinInterval || 300_000;
    const base = state.remoteLastFetchAt || state.lastRefreshAt || 0;
    const nextRefreshAt = Math.max(base + minInterval, state.rateLimitUntil || 0);
    const items = (state.items || []).map((it: any) => {
      if (!it.ts) it.ts = canonicalTs(it);
      return it;
    });
    const payload = { 
      items, 
      lastRefreshAt: state.lastRefreshAt, 
      nextRefreshAt, 
      minInterval 
    };
    (window as any).electronAPI?.sendHistoryToPopout?.(payload);
  } catch (e) {
    console.error('Failed to send history to popout:', e);
  }
}
