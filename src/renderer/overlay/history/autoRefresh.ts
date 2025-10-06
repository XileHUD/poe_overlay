/**
 * Auto-refresh system for merchant history
 * Manages automatic fetching with smart rate limiting
 */

export class HistoryAutoRefresh {
  private autoRefreshInterval: NodeJS.Timeout | null = null;
  private readonly AUTO_REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
  private readonly INITIAL_DELAY_MS = 3000; // 3 seconds after login

  /**
   * Start auto-refresh after successful login
   */
  startAutoRefresh(refreshCallback: () => Promise<void>): void {
    this.stopAutoRefresh(); // Clear any existing interval

    // Initial fetch after 3 seconds
    setTimeout(async () => {
      try {
        await refreshCallback();
      } catch (e) {
        console.error('Auto-refresh initial fetch failed:', e);
      }
    }, this.INITIAL_DELAY_MS);

    // Then refresh every 15 minutes
    this.autoRefreshInterval = setInterval(async () => {
      try {
        console.log('[Auto-refresh] Fetching history (15min interval)');
        await refreshCallback();
      } catch (e) {
        console.error('Auto-refresh failed:', e);
      }
    }, this.AUTO_REFRESH_INTERVAL_MS);

    console.log('[Auto-refresh] Started (15min interval)');
  }

  /**
   * Stop auto-refresh (e.g., on logout or rate limit)
   */
  stopAutoRefresh(): void {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
      console.log('[Auto-refresh] Stopped');
    }
  }

  /**
   * Check if auto-refresh is currently running
   */
  isRunning(): boolean {
    return this.autoRefreshInterval !== null;
  }

  /**
   * Get human-readable status
   */
  getStatus(): string {
    if (!this.autoRefreshInterval) {
      return 'Auto-refresh: Stopped';
    }
    return `Auto-refresh: Active (every 15min)`;
  }
}

// Singleton instance
export const autoRefreshManager = new HistoryAutoRefresh();
