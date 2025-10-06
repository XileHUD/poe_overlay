/**
 * Session and login management for merchant history
 */

export interface SessionState {
  loggedIn: boolean;
  cookiePresent: boolean;
  accountName?: string | null;
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
    return false;
  } catch {
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
