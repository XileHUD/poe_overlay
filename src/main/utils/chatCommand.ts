/**
 * Chat Command Utility
 * 
 * Sends chat commands to Path of Exile using clipboard and keyboard simulation.
 * Based on Awakened PoE Trade's approach for safe logout.
 */

import { clipboard } from 'electron';
import { UiohookKey, uIOhook } from 'uiohook-napi';

/**
 * Type chat text into Path of Exile using clipboard + keyboard simulation
 * 
 * This is the safest method for automated logout (using /exit command)
 * as it doesn't rely on TCP socket manipulation which could violate ToS.
 * 
 * @param command - Chat command to type (e.g., "/exit" or regex pattern)
 * @param pressEnter - Whether to press Enter after pasting:
 *                     - true: Opens chat, pastes, and sends (for commands like /exit, /hideout)
 *                     - false: Just pastes into current field (for stash search regex, etc.)
 */
export async function typeInChat(command: string, pressEnter: boolean = true): Promise<void> {
  // Save current clipboard content
  let previousClipboard = '';
  try {
    previousClipboard = clipboard.readText();
  } catch (err) {
    console.warn('[Chat Command] Failed to read clipboard:', err);
  }
  
  try {
    // Set command to clipboard
    clipboard.writeText(command);
    
    // No delay needed - Awakened PoE Trade fires instantly
    
    if (pressEnter) {
      // For chat commands (/exit, /hideout, etc.):
      // 1. Enter to open chat
      // 2. Ctrl+A to select all (clears the chat input)
      // 3. Ctrl+V to paste
      // 4. Enter to send
      
      uIOhook.keyTap(UiohookKey.Enter);
      uIOhook.keyTap(UiohookKey.A, [UiohookKey.Ctrl]);
      uIOhook.keyTap(UiohookKey.V, [UiohookKey.Ctrl]);
      uIOhook.keyTap(UiohookKey.Enter);
    } else {
      // For regex/search patterns:
      // Just paste into the currently focused field (e.g., stash search)
      // User should already have the search box open
      
      uIOhook.keyTap(UiohookKey.V, [UiohookKey.Ctrl]);
    }
    
  } finally {
    // Restore previous clipboard after a short delay (same as Awakened: 120ms)
    setTimeout(() => {
      try {
        clipboard.writeText(previousClipboard);
      } catch (err) {
        console.warn('[Chat Command] Failed to restore clipboard:', err);
      }
    }, 120);
  }
}

/**
 * Execute /exit command for safe PoE logout
 */
export async function executeLogout(): Promise<void> {
  console.log('[Chat Command] Executing logout via /exit command');
  await typeInChat('/exit');
}
