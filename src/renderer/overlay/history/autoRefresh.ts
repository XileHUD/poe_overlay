/**
 * Auto-refresh system for merchant history
 * Manages automatic fetching with smart rate limiting
 */

export class HistoryAutoRefresh {
  private initialTimeout: NodeJS.Timeout | null = null;
  private scheduledTimeout: NodeJS.Timeout | null = null;
  private refreshCallback: (() => Promise<void>) | null = null;
  private nextAllowedProvider: (() => number) | null = null;
  private readonly AUTO_REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
  private readonly INITIAL_DELAY_MS = 3000; // 3 seconds after login

  /**
   * Start auto-refresh after successful login
   */
  startAutoRefresh(
    refreshCallback: () => Promise<void>,
    nextAllowedProvider?: () => number
  ): void {
    this.stopAutoRefresh(); // Clear any existing timers

    this.refreshCallback = refreshCallback;
    this.nextAllowedProvider = nextAllowedProvider ?? null;

    this.initialTimeout = setTimeout(() => {
      this.executeRefresh('initial');
    }, this.INITIAL_DELAY_MS);

    console.log('[Auto-refresh] Started (dynamic interval, base 15min)');
  }

  private async executeRefresh(reason: 'initial' | 'scheduled'): Promise<void> {
    if (reason === 'initial') {
      this.initialTimeout = null;
    }
    const callback = this.refreshCallback;
    if (!callback) return;

    try {
      if (reason === 'scheduled') {
        console.log('[Auto-refresh] Fetching history (scheduled run)');
      }
      await callback();
    } catch (e) {
      console.error('Auto-refresh run failed:', e);
    } finally {
      this.scheduleNextRun();
    }
  }

  private scheduleNextRun(): void {
    if (!this.refreshCallback) return;

    const now = Date.now();
    let delay = this.AUTO_REFRESH_INTERVAL_MS;

    if (this.nextAllowedProvider) {
      try {
        const nextAllowedAt = this.nextAllowedProvider();
        if (typeof nextAllowedAt === 'number' && !Number.isNaN(nextAllowedAt)) {
          delay = Math.max(delay, Math.max(0, nextAllowedAt - now));
        }
      } catch (e) {
        console.warn('[Auto-refresh] nextAllowedProvider threw', e);
      }
    }

    if (delay < this.AUTO_REFRESH_INTERVAL_MS) {
      delay = this.AUTO_REFRESH_INTERVAL_MS;
    }

    if (this.scheduledTimeout) {
      clearTimeout(this.scheduledTimeout);
    }
    this.scheduledTimeout = setTimeout(() => this.executeRefresh('scheduled'), delay);
  }

  /**
   * Stop auto-refresh (e.g., on logout or rate limit)
   */
  stopAutoRefresh(): void {
    if (this.initialTimeout) {
      clearTimeout(this.initialTimeout);
      this.initialTimeout = null;
    }
    if (this.scheduledTimeout) {
      clearTimeout(this.scheduledTimeout);
      this.scheduledTimeout = null;
    }
    this.refreshCallback = null;
    this.nextAllowedProvider = null;
    console.log('[Auto-refresh] Stopped');
  }

  /**
   * Check if auto-refresh is currently running
   */
  isRunning(): boolean {
    return this.initialTimeout !== null || this.scheduledTimeout !== null;
  }

  /**
   * Get human-readable status
   */
  getStatus(): string {
    if (!this.isRunning()) {
      return 'Auto-refresh: Stopped';
    }
    return `Auto-refresh: Active (dynamic cadence)`;
  }
}

// Singleton instance
export const autoRefreshManager = new HistoryAutoRefresh();
