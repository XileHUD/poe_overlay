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
  autoRefreshActive?: boolean,
  rateLimitInfo?: { limits: string; state: string; budget: string }
): void {
  const btn = document.getElementById('historyRefreshBtn') as HTMLButtonElement | null;
  if (!btn) return;

  // Store retryAfter for click handler to use
  (btn as any)._retryAfter = retryAfter || 0;
  
  // Build rate limit display from actual headers
  let rateLimitText = '';
  if (rateLimitInfo) {
    rateLimitText = `\n\n📊 Current Rate Limits:\n${rateLimitInfo.limits || 'Unknown'}\n\n📈 Usage:\n${rateLimitInfo.state || 'Unknown'}\n\n💰 Budget: ${rateLimitInfo.budget || 'Unknown'}`;
  } else {
    rateLimitText = '\n\n⚠ GGG API limits: 15 requests per 3 hours';
  }

  if (!canRefresh && retryAfter) {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
    const mins = Math.floor(retryAfter / 60);
    const secs = retryAfter % 60;
    btn.title = `⏱ Rate Limited\n\nNext refresh available in: ${mins}m ${secs}s${rateLimitText}`;
  } else if (autoRefreshActive) {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
    btn.title = `🔄 Auto-Refresh Active\n\nRefreshes every 15 minutes to stay within limits${rateLimitText}\n\nClick to manually refresh now`;
  } else {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
    btn.title = `Refresh merchant history${rateLimitText}\n\nClick to manually refresh`;
  }
}

/**
 * Show toast notification for rate limit feedback
 */
function showRateLimitToast(retryAfter: number): void {
  const toast = document.createElement('div');
  const mins = Math.floor(retryAfter / 60);
  const secs = retryAfter % 60;
  
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #ff5252;
    color: #fff;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    z-index: 10001;
    font-size: 14px;
    line-height: 1.5;
    max-width: 350px;
    animation: slideIn 0.3s ease-out;
  `;
  
  toast.innerHTML = `
    <strong style="display: block; margin-bottom: 8px;">⏱ Rate Limited</strong>
    <div>Next refresh available in: <strong>${mins}m ${secs}s</strong></div>
    <div style="margin-top: 8px; font-size: 12px; opacity: 0.9;">
      GGG API limits: 15 requests per 3 hours<br>
      Auto-refresh runs every 15 minutes
    </div>
  `;
  
  document.body.appendChild(toast);
  
  // Add slide-in animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(400px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  
  // Auto-remove after 4 seconds
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-out';
    toast.style.transform = 'translateX(400px)';
    toast.style.opacity = '0';
    setTimeout(() => {
      document.body.removeChild(toast);
      document.head.removeChild(style);
    }, 300);
  }, 4000);
}

/**
 * Attach refresh button click handler with confirmation
 */
export function attachRefreshButtonLogic(refreshCallback: () => Promise<void>): void {
  const btn = document.getElementById('historyRefreshBtn') as HTMLButtonElement | null;
  if (!btn || (btn as any)._refreshWired) return;
  (btn as any)._refreshWired = true;

  btn.addEventListener('click', async () => {
    // If disabled, show toast with rate limit info
    if (btn.disabled) {
      const retryAfter = (btn as any)._retryAfter || 0;
      if (retryAfter > 0) {
        showRateLimitToast(retryAfter);
      }
      return;
    }

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
