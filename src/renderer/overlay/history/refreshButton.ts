/**
 * Refresh button UI and confirmation logic
 */

/**
 * Show confirmation dialog before manual refresh
 * Warns users about rate limiting and auto-refresh
 */
export async function confirmManualRefresh(): Promise<boolean> {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  const dialog = document.createElement('div');
  dialog.style.cssText = `
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 24px;
    max-width: 500px;
    color: #fff;
  `;

  dialog.innerHTML = `
    <h3 style="margin: 0 0 16px 0; color: #ff9800;">⚠ Manual Refresh Warning</h3>
    <p style="margin: 0 0 12px 0; line-height: 1.5;">
      GGG's API has strict rate limits:<br>
      <strong>15 requests per 3 hours</strong>
    </p>
    <p style="margin: 0 0 16px 0; line-height: 1.5; color: #aaa;">
      The app automatically refreshes every <strong>15 minutes</strong> to stay within limits.
      Manual refreshes consume your limited budget.
    </p>
    <p style="margin: 0 0 20px 0; line-height: 1.5;">
      Are you sure you want to refresh now?
    </p>
    <div style="display: flex; gap: 12px; justify-content: flex-end;">
      <button id="cancelRefresh" style="
        padding: 8px 16px;
        background: #333;
        border: 1px solid #555;
        border-radius: 4px;
        color: #fff;
        cursor: pointer;
      ">Cancel</button>
      <button id="confirmRefresh" style="
        padding: 8px 16px;
        background: #ff9800;
        border: 1px solid #ff9800;
        border-radius: 4px;
        color: #000;
        font-weight: bold;
        cursor: pointer;
      ">Yes, Refresh Now</button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  return new Promise((resolve) => {
    const confirm = dialog.querySelector('#confirmRefresh') as HTMLButtonElement;
    const cancel = dialog.querySelector('#cancelRefresh') as HTMLButtonElement;

    const cleanup = () => {
      document.body.removeChild(overlay);
    };

    confirm?.addEventListener('click', () => {
      cleanup();
      resolve(true);
    });

    cancel?.addEventListener('click', () => {
      cleanup();
      resolve(false);
    });

    // ESC key to cancel
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cleanup();
        resolve(false);
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  });
}

/**
 * Update refresh button state and tooltip
 */
export function updateRefreshButtonUI(
  canRefresh: boolean, 
  retryAfter?: number,
  autoRefreshActive?: boolean
): void {
  const btn = document.getElementById('historyRefreshBtn') as HTMLButtonElement | null;
  if (!btn) return;

  if (!canRefresh && retryAfter) {
    btn.disabled = true;
    const mins = Math.floor(retryAfter / 60);
    const secs = retryAfter % 60;
    btn.title = `Rate limited. Retry in ${mins}m ${secs}s`;
  } else if (autoRefreshActive) {
    btn.disabled = false;
    btn.title = `Auto-refresh active (every 15min)\nClick to manually refresh now\n⚠ Uses limited API budget (15 per 3h)`;
  } else {
    btn.disabled = false;
    btn.title = 'Refresh merchant history';
  }
}

/**
 * Attach refresh button click handler with confirmation
 */
export function attachRefreshButtonLogic(refreshCallback: () => Promise<void>): void {
  const btn = document.getElementById('historyRefreshBtn') as HTMLButtonElement | null;
  if (!btn || (btn as any)._refreshWired) return;
  (btn as any)._refreshWired = true;

  btn.addEventListener('click', async () => {
    if (btn.disabled) return;

    // Show confirmation dialog
    const confirmed = await confirmManualRefresh();
    if (!confirmed) {
      console.log('[Manual refresh] Cancelled by user');
      return;
    }

    console.log('[Manual refresh] User confirmed, fetching...');
    
    try {
      await refreshCallback();
    } catch (e) {
      console.error('Manual refresh failed:', e);
    }
  });
}
