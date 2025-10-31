/**
 * UIOhook Hotkey Utilities
 * 
 * Provides utilities for working with uiohook-napi keycodes and hotkey strings.
 * Supports proper distinction between regular keys and numpad keys.
 */

import { UiohookKey } from 'uiohook-napi';

/**
 * Mapping from key names to UIOhook enum values
 * Based on Awakened PoE Trade's KeyToCode implementation
 */
export const KeyToUiohook: Record<string, number> = {
  // Numbers (top row) - these are just '0', '1', etc. in UiohookKey
  '0': UiohookKey['0'], '1': UiohookKey['1'], '2': UiohookKey['2'], 
  '3': UiohookKey['3'], '4': UiohookKey['4'], '5': UiohookKey['5'],
  '6': UiohookKey['6'], '7': UiohookKey['7'], '8': UiohookKey['8'], 
  '9': UiohookKey['9'],
  
  // Numpad (distinct from regular numbers!)
  'Numpad0': UiohookKey.Numpad0, 'Numpad1': UiohookKey.Numpad1, 'Numpad2': UiohookKey.Numpad2,
  'Numpad3': UiohookKey.Numpad3, 'Numpad4': UiohookKey.Numpad4, 'Numpad5': UiohookKey.Numpad5,
  'Numpad6': UiohookKey.Numpad6, 'Numpad7': UiohookKey.Numpad7, 'Numpad8': UiohookKey.Numpad8,
  'Numpad9': UiohookKey.Numpad9,
  'NumpadDecimal': UiohookKey.NumpadDecimal,
  'NumpadDivide': UiohookKey.NumpadDivide,
  'NumpadMultiply': UiohookKey.NumpadMultiply,
  'NumpadSubtract': UiohookKey.NumpadSubtract,
  'NumpadAdd': UiohookKey.NumpadAdd,
  
  // Letters
  'A': UiohookKey.A, 'B': UiohookKey.B, 'C': UiohookKey.C, 'D': UiohookKey.D, 
  'E': UiohookKey.E, 'F': UiohookKey.F, 'G': UiohookKey.G, 'H': UiohookKey.H,
  'I': UiohookKey.I, 'J': UiohookKey.J, 'K': UiohookKey.K, 'L': UiohookKey.L,
  'M': UiohookKey.M, 'N': UiohookKey.N, 'O': UiohookKey.O, 'P': UiohookKey.P,
  'Q': UiohookKey.Q, 'R': UiohookKey.R, 'S': UiohookKey.S, 'T': UiohookKey.T,
  'U': UiohookKey.U, 'V': UiohookKey.V, 'W': UiohookKey.W, 'X': UiohookKey.X,
  'Y': UiohookKey.Y, 'Z': UiohookKey.Z,
  
  // Function keys
  'F1': UiohookKey.F1, 'F2': UiohookKey.F2, 'F3': UiohookKey.F3, 'F4': UiohookKey.F4,
  'F5': UiohookKey.F5, 'F6': UiohookKey.F6, 'F7': UiohookKey.F7, 'F8': UiohookKey.F8,
  'F9': UiohookKey.F9, 'F10': UiohookKey.F10, 'F11': UiohookKey.F11, 'F12': UiohookKey.F12,
  'F13': UiohookKey.F13, 'F14': UiohookKey.F14, 'F15': UiohookKey.F15, 'F16': UiohookKey.F16,
  'F17': UiohookKey.F17, 'F18': UiohookKey.F18, 'F19': UiohookKey.F19, 'F20': UiohookKey.F20,
  'F21': UiohookKey.F21, 'F22': UiohookKey.F22, 'F23': UiohookKey.F23, 'F24': UiohookKey.F24,
  
  // Special keys
  'Space': UiohookKey.Space,
  'Enter': UiohookKey.Enter,
  'Tab': UiohookKey.Tab,
  'Escape': UiohookKey.Escape,
  'Backspace': UiohookKey.Backspace,
  'Delete': UiohookKey.Delete,
  'Insert': UiohookKey.Insert,
  'Home': UiohookKey.Home,
  'End': UiohookKey.End,
  'PageUp': UiohookKey.PageUp,
  'PageDown': UiohookKey.PageDown,
  
  // Arrow keys
  'ArrowLeft': UiohookKey.ArrowLeft,
  'ArrowUp': UiohookKey.ArrowUp,
  'ArrowRight': UiohookKey.ArrowRight,
  'ArrowDown': UiohookKey.ArrowDown,
  
  // Punctuation and symbols
  'Semicolon': UiohookKey.Semicolon,
  'Equal': UiohookKey.Equal,
  'Comma': UiohookKey.Comma,
  'Minus': UiohookKey.Minus,
  'Period': UiohookKey.Period,
  'Slash': UiohookKey.Slash,
  'Backquote': UiohookKey.Backquote,
  'BracketLeft': UiohookKey.BracketLeft,
  'Backslash': UiohookKey.Backslash,
  'BracketRight': UiohookKey.BracketRight,
  'Quote': UiohookKey.Quote,
  
  // Modifiers
  'Ctrl': UiohookKey.Ctrl,
  'Alt': UiohookKey.Alt,
  'Shift': UiohookKey.Shift,
};

/**
 * Reverse mapping: UIOhook keycode to key name
 */
export const UiohookToKey: Record<number, string> = Object.fromEntries(
  Object.entries(KeyToUiohook).map(([key, code]) => [code, key])
);

/**
 * Represents a parsed hotkey with modifiers and main key
 */
export interface ParsedHotkey {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  keyCode: number;
  keyName: string;
}

/**
 * Convert a hotkey string like "Ctrl + Shift + Numpad5" to parsed hotkey object
 * 
 * @param hotkeyString - String like "Ctrl + F5", "Numpad3", "Alt + Shift + A"
 * @returns Parsed hotkey object, or null if invalid
 */
export function stringToHotkey(hotkeyString: string): ParsedHotkey | null {
  if (!hotkeyString || hotkeyString === 'Not Set') {
    return null;
  }
  
  const parts = hotkeyString.split(/\s*\+\s*/).map(p => p.trim());
  
  let ctrl = false;
  let alt = false;
  let shift = false;
  let keyName = '';
  
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'ctrl' || lower === 'control') {
      ctrl = true;
    } else if (lower === 'alt') {
      alt = true;
    } else if (lower === 'shift') {
      shift = true;
    } else {
      keyName = part;
    }
  }
  
  if (!keyName) {
    return null;
  }
  
  const keyCode = KeyToUiohook[keyName];
  if (keyCode === undefined) {
    console.warn(`[UIOhook Hotkey] Unknown key: ${keyName}`);
    return null;
  }
  
  return { ctrl, alt, shift, keyCode, keyName };
}

/**
 * Convert a UIOhook keycode + modifiers to a human-readable string
 * 
 * @param keyCode - UIOhook keycode (e.g., UiohookKey.Numpad5)
 * @param ctrl - Ctrl modifier pressed
 * @param alt - Alt modifier pressed
 * @param shift - Shift modifier pressed
 * @returns String like "Ctrl + Numpad5" or "F9"
 */
export function hotkeyToString(keyCode: number, ctrl: boolean, alt: boolean, shift: boolean): string {
  const keyName = UiohookToKey[keyCode];
  if (!keyName) {
    return 'Not Set';
  }
  
  const parts: string[] = [];
  if (ctrl) parts.push('Ctrl');
  if (alt) parts.push('Alt');
  if (shift) parts.push('Shift');
  parts.push(keyName);
  
  return parts.join(' + ');
}

/**
 * Check if two hotkeys match
 * 
 * @param event - UIOhook keyboard event
 * @param hotkey - Parsed hotkey to match against
 * @returns True if the event matches the hotkey
 */
export function hotkeyMatches(
  event: { keycode: number; ctrlKey: boolean; altKey: boolean; shiftKey: boolean },
  hotkey: ParsedHotkey
): boolean {
  return (
    event.keycode === hotkey.keyCode &&
    event.ctrlKey === hotkey.ctrl &&
    event.altKey === hotkey.alt &&
    event.shiftKey === hotkey.shift
  );
}

/**
 * Validate a hotkey string format
 * 
 * @param hotkeyString - String to validate
 * @returns True if valid format
 */
export function isValidHotkeyString(hotkeyString: string): boolean {
  if (!hotkeyString || hotkeyString === 'Not Set') {
    return true; // Empty/not set is valid
  }
  
  return stringToHotkey(hotkeyString) !== null;
}
