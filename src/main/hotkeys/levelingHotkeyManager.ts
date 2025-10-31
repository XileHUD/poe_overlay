/**
 * Leveling Hotkey Manager
 * 
 * Manages global hotkeys for the leveling overlay using UIOhook.
 * Integrates with existing uiohook-trigger singleton to avoid conflicts with main overlay.
 */

import type { UiohookKeyboardEvent } from 'uiohook-napi';
import { initializeUiohookTrigger } from '../hotkeys/uiohook-trigger.js';
import { stringToHotkey, hotkeyMatches, type ParsedHotkey } from '../utils/uiohookHotkeyUtils.js';

export type HotkeyCallback = () => void;

interface RegisteredHotkey {
  name: string;
  hotkey: ParsedHotkey;
  callback: HotkeyCallback;
}

class LevelingHotkeyManager {
  private registeredHotkeys: RegisteredHotkey[] = [];
  private uiohookInitialized = false;
  private keydownHandler: ((event: UiohookKeyboardEvent) => void) | null = null;

  /**
   * Initialize UIOhook if not already initialized
   */
  async initialize(): Promise<boolean> {
    if (this.uiohookInitialized) {
      return true;
    }

    const success = await initializeUiohookTrigger(() => {});
    if (!success) {
      console.warn('[LevelingHotkeys] Failed to initialize UIOhook');
      return false;
    }

    this.uiohookInitialized = true;
    this.attachKeydownListener();
    return true;
  }

  /**
   * Attach global keydown listener to UIOhook
   */
  private attachKeydownListener(): void {
    if (this.keydownHandler) {
      return; // Already attached
    }

    // Import UIOhook dynamically to access it
    import('uiohook-napi').then((mod) => {
      this.keydownHandler = (event: UiohookKeyboardEvent) => {
        this.handleKeydown(event);
      };
      
      mod.uIOhook.on('keydown', this.keydownHandler);
    }).catch((err) => {
      console.warn('[LevelingHotkeys] Failed to attach keydown listener', err);
    });
  }

  /**
   * Handle global keydown events
   */
  private handleKeydown(event: UiohookKeyboardEvent): void {
    for (const registered of this.registeredHotkeys) {
      if (hotkeyMatches(event, registered.hotkey)) {
        try {
          registered.callback();
        } catch (err) {
          console.error(`[LevelingHotkeys] Error in hotkey callback for ${registered.name}`, err);
        }
        break; // Only trigger first match
      }
    }
  }

  /**
   * Register a hotkey
   * 
   * @param name - Unique name for this hotkey
   * @param hotkeyString - Hotkey string like "Ctrl + F5" or "Numpad3"
   * @param callback - Function to call when hotkey is pressed
   * @returns True if successfully registered
   */
  register(name: string, hotkeyString: string, callback: HotkeyCallback): boolean {
    // Parse hotkey string
    const hotkey = stringToHotkey(hotkeyString);
    if (!hotkey) {
      return false;
    }

    // Check if name already registered
    const existingIndex = this.registeredHotkeys.findIndex(h => h.name === name);
    if (existingIndex !== -1) {
      // Update existing
      this.registeredHotkeys[existingIndex] = { name, hotkey, callback };
    } else {
      // Add new
      this.registeredHotkeys.push({ name, hotkey, callback });
    }

    return true;
  }

  /**
   * Unregister a specific hotkey by name
   */
  unregister(name: string): void {
    const index = this.registeredHotkeys.findIndex(h => h.name === name);
    if (index !== -1) {
      this.registeredHotkeys.splice(index, 1);
    }
  }

  /**
   * Unregister all hotkeys
   */
  unregisterAll(): void {
    this.registeredHotkeys = [];
  }

  /**
   * Clean up resources
   */
  shutdown(): void {
    if (this.keydownHandler) {
      import('uiohook-napi').then((mod) => {
        if (this.keydownHandler) {
          mod.uIOhook.removeListener('keydown', this.keydownHandler);
          this.keydownHandler = null;
        }
      }).catch((err) => {
        console.warn('[LevelingHotkeys] Error detaching keydown listener', err);
      });
    }
    this.unregisterAll();
    this.uiohookInitialized = false;
  }
}

// Singleton instance
export const levelingHotkeyManager = new LevelingHotkeyManager();
