import { historyState } from './historyData';
import { historyVisible } from './historyView';

export type LeagueSource = 'auto' | 'manual';

export interface LeaguePreference {
  league: string;
  source: LeagueSource;
}

export interface LeagueUpdateResult {
  leagueChanged: boolean;
  sourceChanged: boolean;
}

export interface LeagueOption {
  id: string;
  label: string;
  tag?: string;
  hint?: string;
}

export type LeaguePromptReason = 'manual-open' | 'auto-hardcore' | 'empty-data';

// PoE1 leagues
export const POE1_SOFTCORE_LEAGUE = 'Keepers of the Flame';
export const POE1_HARDCORE_LEAGUE = 'Hardcore Keepers of the Flame';
export const POE1_STANDARD_LEAGUE = 'Standard';
export const POE1_LEGACY_HARDCORE_LEAGUE = 'Hardcore';

// PoE2 leagues
export const POE2_SOFTCORE_LEAGUE = 'Rise of the Abyssal';
export const POE2_HARDCORE_LEAGUE = 'HC Rise of the Abyssal';
export const POE2_STANDARD_LEAGUE = 'Standard';
export const POE2_LEGACY_HARDCORE_LEAGUE = 'Hardcore';

// Default exports for backward compatibility (will be version-aware)
export const SOFTCORE_LEAGUE = POE2_SOFTCORE_LEAGUE;
export const HARDCORE_LEAGUE = POE2_HARDCORE_LEAGUE;
export const STANDARD_LEAGUE = POE2_STANDARD_LEAGUE;
export const LEGACY_HARDCORE_LEAGUE = POE2_LEGACY_HARDCORE_LEAGUE;

const POE1_LEAGUE_OPTIONS: LeagueOption[] = [
  { id: POE1_SOFTCORE_LEAGUE, label: 'Keepers of the Flame', tag: 'Softcore', hint: 'Default trade league' },
  { id: POE1_HARDCORE_LEAGUE, label: 'Hardcore Keepers of the Flame', tag: 'Hardcore', hint: 'Deletes characters on death' },
  { id: POE1_STANDARD_LEAGUE, label: 'Standard', tag: 'Legacy', hint: 'Permanent league' },
  { id: POE1_LEGACY_HARDCORE_LEAGUE, label: 'Hardcore', tag: 'Legacy HC', hint: 'Legacy hardcore league' }
];

const POE2_LEAGUE_OPTIONS: LeagueOption[] = [
  { id: POE2_SOFTCORE_LEAGUE, label: 'Rise of the Abyssal', tag: 'Softcore', hint: 'Default trade league' },
  { id: POE2_HARDCORE_LEAGUE, label: 'HC Rise of the Abyssal', tag: 'Hardcore', hint: 'Deletes characters on death' },
  { id: POE2_STANDARD_LEAGUE, label: 'Standard', tag: 'Legacy', hint: 'Permanent league' },
  { id: POE2_LEGACY_HARDCORE_LEAGUE, label: 'Hardcore', tag: 'Legacy HC', hint: 'Legacy hardcore league' }
];

function getOverlayVersionMode(): 'poe1' | 'poe2' {
  return ((window as any).__overlayVersionMode || 'poe2') === 'poe1' ? 'poe1' : 'poe2';
}

type PendingPromptState = { reason: LeaguePromptReason; options?: { previousLeague?: string; newLeague?: string; message?: string; highlight?: string } };

let currentOverlayMode: 'poe1' | 'poe2' = getOverlayVersionMode();
let leagueStateInitialized = false;
let pendingPrompt: PendingPromptState | null = null;

function queuePrompt(reason: LeaguePromptReason, options?: { previousLeague?: string; newLeague?: string; message?: string; highlight?: string }): void {
  pendingPrompt = { reason, options };
}

function flushPendingPrompt(): void {
  if (!pendingPrompt) return;
  const queued = pendingPrompt;
  pendingPrompt = null;
  showPrompt(queued.reason, queued.options);
}

function getLeagueOptionsForMode(mode: 'poe1' | 'poe2'): LeagueOption[] {
  return mode === 'poe1' ? POE1_LEAGUE_OPTIONS : POE2_LEAGUE_OPTIONS;
}

function getDefaultLeagueForMode(mode: 'poe1' | 'poe2'): string {
  return mode === 'poe1' ? POE1_SOFTCORE_LEAGUE : POE2_SOFTCORE_LEAGUE;
}

function normalizeLeagueId(value: string): string {
  return (value || '').trim().toLowerCase();
}

function isLeagueValidForMode(mode: 'poe1' | 'poe2', league: string): boolean {
  if (!league) return false;
  const normalized = normalizeLeagueId(league);
  return getLeagueOptionsForMode(mode).some((option) => normalizeLeagueId(option.id) === normalized);
}

function ensureLeagueValidForMode(mode: 'poe1' | 'poe2'): boolean {
  const current = (historyState.league || '').trim();
  if (current && isLeagueValidForMode(mode, current)) {
    return false;
  }

  const fallback = getDefaultLeagueForMode(mode);
  const changed = historyState.league !== fallback;
  historyState.league = fallback;
  historyState.leagueSource = 'auto';
  historyState.leagueExplicitlySet = false;

  if (changed) {
    resetHistoryStoreForLeagueChange();
  }

  return changed;
}

const LEAGUE_LABELS: Record<string, string> = {
  [normalizeLeagueId(POE1_SOFTCORE_LEAGUE)]: 'Softcore • Keepers of the Flame',
  [normalizeLeagueId(POE2_SOFTCORE_LEAGUE)]: 'Softcore • Rise of the Abyssal',
  [normalizeLeagueId(POE1_HARDCORE_LEAGUE)]: 'Hardcore • Keepers of the Flame',
  [normalizeLeagueId(POE2_HARDCORE_LEAGUE)]: 'Hardcore • Rise of the Abyssal',
  [normalizeLeagueId(POE1_STANDARD_LEAGUE)]: 'Standard',
  [normalizeLeagueId(POE2_STANDARD_LEAGUE)]: 'Standard',
  [normalizeLeagueId(POE1_LEGACY_HARDCORE_LEAGUE)]: 'Hardcore (Legacy)',
  [normalizeLeagueId(POE2_LEGACY_HARDCORE_LEAGUE)]: 'Hardcore (Legacy)'
};

function getActiveLeagueOptions(): LeagueOption[] {
  return getLeagueOptionsForMode(getOverlayVersionMode());
}

interface LeagueUpdateOptions {
  persist?: boolean;
  resetStore?: boolean;
  skipButtonUpdate?: boolean;
  reason?: 'init' | 'manual-selection' | 'auto-detect' | 'sync';
}

type ManualLeagueChangeHandler = (context: { league: string }) => Promise<void> | void;
type ManualChangePrepHandler = (context: { league: string }) => void;

type PendingAutoPrompt = { league: string; previousLeague?: string } | null;

let leagueButton: HTMLButtonElement | null = null;
let promptEl: HTMLDivElement | null = null;
let promptMessageEl: HTMLDivElement | null = null;
let promptButtonsEl: HTMLDivElement | null = null;
let promptDismissBtn: HTMLButtonElement | null = null;
let promptBusy = false;

let manualChangeHandler: ManualLeagueChangeHandler | null = null;
let manualChangePrepHandler: ManualChangePrepHandler | null = null;

let pendingAutoPrompt: PendingAutoPrompt = null;
const autoPromptShownFor = new Set<string>();

function getElectronAPI(): any {
  return (window as any).electronAPI || {};
}

function ensureDomReady(): Promise<void> {
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
  });
}

function ensureElements(): void {
  if (!leagueButton) {
    leagueButton = document.getElementById('historyLeagueBtn') as HTMLButtonElement | null;
  }
  if (!promptEl) {
    promptEl = document.getElementById('historyLeaguePrompt') as HTMLDivElement | null;
  }
  if (!promptMessageEl) {
    promptMessageEl = document.getElementById('historyLeaguePromptMessage') as HTMLDivElement | null;
  }
  if (!promptButtonsEl) {
    promptButtonsEl = document.getElementById('historyLeaguePromptButtons') as HTMLDivElement | null;
  }
  if (!promptDismissBtn) {
    promptDismissBtn = document.getElementById('historyLeaguePromptDismiss') as HTMLButtonElement | null;
  }
}

function resetHistoryStoreForLeagueChange(): void {
  historyState.store = { entries: [], totals: {}, lastSync: 0, lastFetchAt: 0 };
  historyState.items = [];
  historyState.selectedIndex = 0;
  historyState.lastRefreshAt = 0;
  historyState.remoteLastFetchAt = 0;
  historyState.rateLimitUntil = 0;
}

function buildPromptMessage(reason: LeaguePromptReason, opts?: { previousLeague?: string; newLeague?: string; message?: string }): string {
  if (opts?.message) return opts.message;
  if (reason === 'auto-hardcore') {
    const prev = opts?.previousLeague ? formatLeagueLabel(opts.previousLeague) : 'Softcore';
    const next = opts?.newLeague ? formatLeagueLabel(opts.newLeague) : 'Hardcore';
    return `We didn't see any history for ${prev}, so we grabbed ${next}. Pick the league you prefer.`;
  }
  if (reason === 'empty-data') {
    const prev = opts?.previousLeague ? formatLeagueLabel(opts.previousLeague) : 'that league';
    return `No history entries were returned for ${prev}. This often means your character is in a different league (Softcore vs Hardcore). Choose the correct league below to resume syncing.`;
  }
  return 'Pick which trade league you want to track for merchant history.';
}

function hidePrompt(): void {
  if (promptEl) {
    promptEl.style.display = 'none';
    promptEl.classList.remove('active');
  }
}

async function handlePromptSelection(leagueId: string): Promise<void> {
  if (promptBusy) return;
  promptBusy = true;
  try {
    hidePrompt();
    const result = await setLeaguePreference(leagueId, 'manual', { persist: true, resetStore: true, reason: 'manual-selection' });
    if (result.leagueChanged) {
      manualChangePrepHandler?.({ league: leagueId });
      try {
        await manualChangeHandler?.({ league: leagueId });
      } catch (err) {
        console.warn('[HistoryLeague] Manual league change refresh failed', err);
      }
    }
  } finally {
    promptBusy = false;
  }
}

function renderPromptButtons(highlight?: string): void {
  if (!promptButtonsEl) return;
  promptButtonsEl.innerHTML = '';

  getActiveLeagueOptions().forEach((option) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'history-league-option';
    btn.dataset.league = option.id;
    btn.innerHTML = `
      <span class="history-league-option-main">${option.label}</span>
      ${option.tag ? `<span class="history-league-option-tag">${option.tag}</span>` : ''}
      ${option.hint ? `<span class="history-league-option-hint">${option.hint}</span>` : ''}
    `;
    if (highlight && option.id === highlight) {
      btn.classList.add('active');
    }
    btn.addEventListener('click', () => {
      handlePromptSelection(option.id);
    });
    promptButtonsEl?.appendChild(btn);
  });
}

function showPrompt(reason: LeaguePromptReason, opts?: { previousLeague?: string; newLeague?: string; message?: string; highlight?: string }): void {
  ensureElements();
  if (!promptEl || !promptMessageEl || !promptButtonsEl) return;

  promptMessageEl.textContent = buildPromptMessage(reason, opts);
  renderPromptButtons(opts?.highlight || historyState.league);

  if (promptDismissBtn) {
    const dismissLabel = reason === 'auto-hardcore' ? 'Keep current' : 'Not now';
    promptDismissBtn.textContent = dismissLabel;
    promptDismissBtn.onclick = () => {
      hidePrompt();
      if (reason === 'auto-hardcore' && opts?.newLeague) {
        autoPromptShownFor.add(opts.newLeague);
      }
    };
  }

  promptEl.style.display = 'flex';
  promptEl.classList.add('active');

  if (reason === 'auto-hardcore' && opts?.newLeague) {
    autoPromptShownFor.add(opts.newLeague);
  }
}

function updateLeagueButton(): void {
  ensureElements();
  if (!leagueButton) return;
  const source = historyState.leagueSource ?? 'auto';
  leagueButton.textContent = `League: ${formatLeagueLabel(historyState.league)}`;
  leagueButton.dataset.source = source;
  if (source === 'manual') {
    leagueButton.classList.add('is-manual');
  } else {
    leagueButton.classList.remove('is-manual');
  }
}

export function formatLeagueLabel(league: string): string {
  const trimmed = (league || '').trim();
  if (!trimmed) return 'Unknown';
  const normalized = normalizeLeagueId(trimmed);
  if (LEAGUE_LABELS[normalized]) return LEAGUE_LABELS[normalized];
  if (/^hardcore keepers of the flame$/i.test(trimmed)) return 'Hardcore • Keepers of the Flame';
  if (/^hardcore rise of the abyssal$/i.test(trimmed)) return 'Hardcore • Rise of the Abyssal';
  if (/^keepers of the flame$/i.test(trimmed)) return 'Softcore • Keepers of the Flame';
  if (/^rise of the abyssal$/i.test(trimmed)) return 'Softcore • Rise of the Abyssal';
  if (/^Hardcore/i.test(trimmed)) {
    const rest = trimmed.replace(/^Hardcore\s*/i, '').trim();
    return rest ? `Hardcore • ${rest}` : 'Hardcore';
  }
  return trimmed;
}

export function getLeaguePreference(): LeaguePreference {
  const mode = getOverlayVersionMode();
  ensureLeagueValidForMode(mode);
  const fallback = getDefaultLeagueForMode(mode);
  const league = (historyState.league || fallback).trim() || fallback;
  const source = historyState.leagueSource === 'manual' ? 'manual' : 'auto';
  return { league, source };
}

export function getLeagueOptions(): LeagueOption[] {
  return getActiveLeagueOptions().map((opt) => ({ ...opt }));
}

export function setLeaguePreference(league: string, source: LeagueSource, options?: LeagueUpdateOptions): Promise<LeagueUpdateResult> {
  const mode = getOverlayVersionMode();
  const fallback = getDefaultLeagueForMode(mode);
  const requested = (league || '').trim();
  const isValid = requested ? isLeagueValidForMode(mode, requested) : false;
  const trimmed = (isValid ? requested : fallback) || fallback;
  const prevLeague = historyState.league;
  const prevSource: LeagueSource = historyState.leagueSource === 'manual' ? 'manual' : 'auto';

  const leagueChanged = trimmed !== prevLeague;
  const sourceChanged = source !== prevSource;

  historyState.league = trimmed;
  historyState.leagueSource = source;
  
  // Mark as explicitly set when user manually selects or when loaded from persisted preference
  if (source === 'manual') {
    historyState.leagueExplicitlySet = true;
  } else if (!isValid) {
    historyState.leagueExplicitlySet = false;
  }

  if (leagueChanged && options?.resetStore !== false) {
    resetHistoryStoreForLeagueChange();
  }

  if (options?.persist !== false) {
    try {
      getElectronAPI().historySetLeaguePreference?.({ league: trimmed, source }).catch((err: any) => {
        console.warn('[HistoryLeague] Failed to persist league preference', err);
      });
    } catch (err) {
      console.warn('[HistoryLeague] Failed to persist league preference', err);
    }
  }

  if (!options?.skipButtonUpdate) {
    updateLeagueButton();
  }

  return Promise.resolve({ leagueChanged, sourceChanged });
}

export async function initializeHistoryLeagueState(): Promise<void> {
  currentOverlayMode = getOverlayVersionMode();
  
  console.log('[HistoryLeague] initializeHistoryLeagueState - overlayMode:', currentOverlayMode, 'historyState.league:', historyState.league);

  if (leagueStateInitialized) {
    console.log('[HistoryLeague] Already initialized, returning early');
    return;
  }

  try {
    const pref = await getElectronAPI().historyGetLeaguePreference?.();

    const hasStoredPreference = pref && (pref as any).hasStoredPreference === true;
    const mode = currentOverlayMode;
    const fallback = getDefaultLeagueForMode(mode);
    
    console.log('[HistoryLeague] Bootstrap - hasStored:', hasStoredPreference, 'mode:', mode, 'fallback:', fallback, 'pref:', pref);

    if (hasStoredPreference) {
      const rawLeague = typeof pref?.league === 'string' ? pref.league.trim() : '';
      const leagueIsValid = rawLeague ? isLeagueValidForMode(mode, rawLeague) : false;
      const leagueToApply = leagueIsValid ? rawLeague : fallback;
      const source: LeagueSource = leagueIsValid && pref?.source === 'manual' ? 'manual' : 'auto';

      await setLeaguePreference(leagueToApply, source, { persist: false, resetStore: false, reason: 'init', skipButtonUpdate: true });

      if (!leagueIsValid) {
        historyState.leagueExplicitlySet = false;
        console.log(`[HistoryLeague] Stored league "${rawLeague}" is not valid for ${mode}; using default ${leagueToApply}`);
        try {
          getElectronAPI().historySetLeaguePreference?.({ league: leagueToApply, source: 'auto' });
        } catch (err) {
          console.warn('[HistoryLeague] Failed to persist fallback league after validation', err);
        }
        queuePrompt('manual-open', {
          message: 'Pick the trade league you want to track before refreshing history.',
          highlight: historyState.league
        });
      } else {
        historyState.leagueExplicitlySet = source === 'manual';
        console.log('[HistoryLeague] Loaded stored league preference:', leagueToApply, '(source:', source, ')');
      }
    } else {
      console.log('[HistoryLeague] No stored preference - ensuring league valid for mode:', mode);
      const changed = ensureLeagueValidForMode(mode);
      historyState.leagueSource = 'auto';
      historyState.leagueExplicitlySet = false;
      if (changed) {
        console.log(`[HistoryLeague] Set default league to ${historyState.league} for ${mode}`);
      } else {
        console.log(`[HistoryLeague] League already valid: ${historyState.league}`);
      }
      queuePrompt('manual-open', {
        message: 'Pick the trade league you want to track before refreshing history.',
        highlight: historyState.league
      });
    }
  } catch (err) {
    console.warn('[HistoryLeague] Failed to load stored league preference', err);
    const mode = currentOverlayMode;
    ensureLeagueValidForMode(mode);
    historyState.leagueSource = historyState.leagueSource === 'manual' ? 'manual' : 'auto';
    historyState.leagueExplicitlySet = false;
  }

  leagueStateInitialized = true;
  console.log('[HistoryLeague] Bootstrap complete - league:', historyState.league, 'source:', historyState.leagueSource, 'mode:', currentOverlayMode);
}

export async function initializeHistoryLeagueControls(callbacks: { onManualLeagueChange: ManualLeagueChangeHandler; onManualChangePrep: ManualChangePrepHandler }): Promise<void> {
  manualChangeHandler = callbacks.onManualLeagueChange;
  manualChangePrepHandler = callbacks.onManualChangePrep;

  if (!leagueStateInitialized) {
    await initializeHistoryLeagueState();
  }

  await ensureDomReady();
  ensureElements();

  updateLeagueButton();
  flushPendingPrompt();

  try {
    getElectronAPI().onOverlayVersionMode?.((mode: string) => {
      const normalized: 'poe1' | 'poe2' = mode === 'poe1' ? 'poe1' : 'poe2';
      if (normalized === currentOverlayMode) return;
      currentOverlayMode = normalized;

      const leagueChanged = ensureLeagueValidForMode(normalized);
      updateLeagueButton();

      if (leagueChanged) {
        try {
          getElectronAPI().historySetLeaguePreference?.({ league: historyState.league, source: historyState.leagueSource });
        } catch (err) {
          console.warn('[HistoryLeague] Failed to sync league after overlay version change', err);
        }
        showLeaguePrompt('manual-open', {
          message: 'Pick the trade league you want to track before refreshing history.',
          highlight: historyState.league
        });
      }
    });
  } catch (err) {
    console.warn('[HistoryLeague] Failed to subscribe to overlay version changes', err);
  }
}

export function queueAutoLeaguePrompt(newLeague: string, previousLeague?: string): void {
  // Auto-detection removed - users must manually select their league
  console.log('[HistoryLeague] Auto-detection disabled:', newLeague, 'from', previousLeague);
}

export function maybeShowPendingLeaguePrompt(): void {
  // Auto-detection removed - users must manually select their league
}

export function showLeaguePrompt(reason: LeaguePromptReason, opts?: { previousLeague?: string; newLeague?: string; message?: string; highlight?: string }): void {
  if (!manualChangeHandler || document.readyState === 'loading') {
    queuePrompt(reason, opts);
    return;
  }
  showPrompt(reason, opts);
}
