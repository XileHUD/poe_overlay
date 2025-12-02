/**
 * Session and login management for merchant history
 */

export interface SessionState {
  loggedIn: boolean;
  cookiePresent: boolean;
  accountName?: string | null;
}

type LoggedOutReason = 'expired' | 'missing';

function showLoggedOutMessaging(reason: LoggedOutReason): void {
  try {
    const infoBadge = document.getElementById('historyInfoBadge') as HTMLElement | null;
    const histList = document.getElementById('historyList') as HTMLElement | null;
    const historyState = (window as any).OverlayHistory?.historyState;
    const hasEntries = Array.isArray(historyState?.store?.entries) && historyState.store.entries.length > 0;

    const infoMessage = reason === 'expired'
      ? 'Session expired • Please login again'
      : 'Not logged in';
    const listMessage = reason === 'expired'
      ? 'Your session has expired. Please log in again to pathofexile.com.'
      : 'Please log in to pathofexile.com to view history.';

    if (!hasEntries && histList) {
      histList.innerHTML = `<div class="no-mods" style="padding:8px;">${listMessage}</div>`;
    }

    if (infoBadge) {
      infoBadge.textContent = infoMessage;
      infoBadge.style.display = '';
      window.setTimeout(() => {
        if (infoBadge.textContent === infoMessage) {
          infoBadge.style.display = 'none';
        }
      }, 6000);
    }
  } catch (err) {
    console.warn('[Session] Failed to show logged-out messaging', err);
  }
}

/**
 * Update session UI based on current login state
 */
export async function updateSessionUI(): Promise<boolean> {
  try {
    const session = await (window as any).electronAPI.poeGetSession();
    const loginBtn = document.getElementById("poeLoginBtn") as HTMLButtonElement | null;
    if (!loginBtn) return !!session?.loggedIn;
    
    // Simple logic: loggedIn=true → Logout button, otherwise → Login button
    if (session?.loggedIn) {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Logout';
      loginBtn.title = 'Logout of pathofexile.com';
      loginBtn.classList.remove('login-state');
      loginBtn.classList.add('logout-state');
      return true;
    }
    
    // Not logged in (either no cookie or unconfirmed)
    loginBtn.disabled = false;
    loginBtn.textContent = 'Login';
    loginBtn.title = 'Login to pathofexile.com';
    loginBtn.classList.remove('logout-state');
    loginBtn.classList.add('login-state');
    showLoggedOutMessaging(session?.cookiePresent ? 'expired' : 'missing');
    return false;
  } catch {
    showLoggedOutMessaging('expired');
    return false;
  }
}

/**
 * Attach login button logic with auto-refresh on success
 */
export function attachLoginButtonLogic(onLoginSuccess: () => void): void {
  const btn = document.getElementById('poeLoginBtn') as HTMLButtonElement | null;
  if (!btn || (btn as any)._loginWired) return;
  (btn as any)._loginWired = true;

  btn.addEventListener('click', async () => {
    try {
      if (btn.disabled) return; // Prevent double-clicks
      
      // Disable button immediately to prevent multiple windows
      btn.disabled = true;
      btn.textContent = 'Opening…';
      
      const result = await (window as any).electronAPI.poeLogin();
      
      // Update UI immediately after login resolves
      await updateSessionUI();
      
      // If login was successful, trigger callback (starts auto-refresh)
      if (result?.loggedIn) {
        onLoginSuccess();
      }
    } catch (e) {
      console.error('Login error:', e);
      btn.disabled = false;
      btn.textContent = 'Login';
    }
  });

  // Watchdog: if stuck in Opening… for >5s revert to Login state
  setInterval(() => {
    if (!btn) return;
    if (btn.textContent?.startsWith('Opening') && btn.disabled) {
      const since = (btn as any)._checkingSince || 0;
      if (!since) { 
        (btn as any)._checkingSince = Date.now(); 
        return; 
      }
      if (Date.now() - since > 5000) {
        (btn as any)._checkingSince = 0;
        btn.disabled = false;
        btn.textContent = 'Login';
      }
    } else {
      (btn as any)._checkingSince = 0;
    }
  }, 1200);
}
