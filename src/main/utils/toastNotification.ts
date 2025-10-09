/**
 * Toast notification utility.
 * Shows temporary notification messages in the overlay window.
 */

import { BrowserWindow } from 'electron';

export type ToastType = 'info' | 'warning' | 'error' | 'success';

/**
 * Show a toast notification in the overlay window.
 * @param parentWindow The window to show the toast in
 * @param message The message to display
 * @param type The type of toast (affects color)
 */
export function showToast(
  parentWindow: BrowserWindow | null,
  message: string,
  type: ToastType = 'info'
): void {
  if (!parentWindow || parentWindow.isDestroyed()) {
    console.warn('[Toast] Cannot show toast: window destroyed or null');
    return;
  }

  const colors: Record<ToastType, string> = {
    error: '#da3633',
    warning: '#9e6a03',
    success: '#2da44e',
    info: '#1f6feb'
  };

  const backgroundColor = colors[type] || colors.info;

  parentWindow.webContents.executeJavaScript(`
    (() => {
      const toast = document.createElement('div');
      toast.style.cssText = \`
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        background: ${backgroundColor};
        color: #fff;
        padding: 12px 20px;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        font-family: 'Segoe UI', Roboto, Arial, sans-serif;
        font-size: 13px;
        max-width: 350px;
        animation: slideInRight 0.3s ease;
        pointer-events: auto;
        cursor: pointer;
      \`;
      
      toast.textContent = ${JSON.stringify(message)};
      
      // Define animation styles if not already present
      if (!document.getElementById('toast-animations')) {
        const style = document.createElement('style');
        style.id = 'toast-animations';
        style.textContent = \`
          @keyframes slideInRight {
            from {
              transform: translateX(400px);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
          @keyframes slideOutRight {
            from {
              transform: translateX(0);
              opacity: 1;
            }
            to {
              transform: translateX(400px);
              opacity: 0;
            }
          }
        \`;
        document.head.appendChild(style);
      }
      
      document.body.appendChild(toast);
      
      // Click to dismiss
      toast.addEventListener('click', () => {
        toast.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      });
      
      // Auto-dismiss after 3 seconds
      setTimeout(() => {
        if (toast.parentNode) {
          toast.style.animation = 'slideOutRight 0.3s ease';
          setTimeout(() => toast.remove(), 300);
        }
      }, 3000);
    })();
  `).catch((err) => {
    console.error('[Toast] Failed to show toast:', err);
  });
}
