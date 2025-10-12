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

export const SOFTCORE_LEAGUE = 'Rise of the Abyssal';
export const HARDCORE_LEAGUE = 'Hardcore Rise of the Abyssal';
export const STANDARD_LEAGUE = 'Standard';
export const LEGACY_HARDCORE_LEAGUE = 'Hardcore';

const LEAGUE_OPTIONS: LeagueOption[] = [
  { id: SOFTCORE_LEAGUE, label: 'Rise of the Abyssal', tag: 'Softcore', hint: 'Default trade league' },
  { id: HARDCORE_LEAGUE, label: 'Hardcore Rise of the Abyssal', tag: 'Hardcore', hint: 'Deletes characters on death' },
  { id: STANDARD_LEAGUE, label: 'Standard', tag: 'Legacy', hint: 'Permanent league' },
  { id: LEGACY_HARDCORE_LEAGUE, label: 'Hardcore', tag: 'Legacy HC', hint: 'Legacy hardcore league' }
];

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

  LEAGUE_OPTIONS.forEach((option) => {
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
  if (trimmed === HARDCORE_LEAGUE) return 'Hardcore • Rise of the Abyssal';
  if (trimmed === SOFTCORE_LEAGUE) return 'Softcore • Rise of the Abyssal';
  if (trimmed === STANDARD_LEAGUE) return 'Standard';
  if (trimmed === LEGACY_HARDCORE_LEAGUE) return 'Hardcore (Legacy)';
  if (/^Hardcore/i.test(trimmed)) {
    const rest = trimmed.replace(/^Hardcore\s*/i, '').trim();
    return rest ? `Hardcore • ${rest}` : 'Hardcore';
  }
  return trimmed;
}

export function getLeaguePreference(): LeaguePreference {
  const league = (historyState.league || SOFTCORE_LEAGUE).trim() || SOFTCORE_LEAGUE;
  const source = historyState.leagueSource === 'manual' ? 'manual' : 'auto';
  return { league, source };
}

export function getLeagueOptions(): LeagueOption[] {
  return LEAGUE_OPTIONS.map((opt) => ({ ...opt }));
}

export function setLeaguePreference(league: string, source: LeagueSource, options?: LeagueUpdateOptions): Promise<LeagueUpdateResult> {
  const trimmed = (league || '').trim() || SOFTCORE_LEAGUE;
  const prevLeague = historyState.league;
  const prevSource: LeagueSource = historyState.leagueSource === 'manual' ? 'manual' : 'auto';

  const leagueChanged = trimmed !== prevLeague;
  const sourceChanged = source !== prevSource;

  historyState.league = trimmed;
  historyState.leagueSource = source;
  
  // Mark as explicitly set when user manually selects or when loaded from persisted preference
  if (source === 'manual' || options?.reason === 'init') {
    historyState.leagueExplicitlySet = true;
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

  return Promise.resolve({ leagueChanged, sourceChanged });
}

export async function initializeHistoryLeagueControls(callbacks: { onManualLeagueChange: ManualLeagueChangeHandler; onManualChangePrep: ManualChangePrepHandler }): Promise<void> {
  manualChangeHandler = callbacks.onManualLeagueChange;
  manualChangePrepHandler = callbacks.onManualChangePrep;

  await ensureDomReady();

  try {
    const pref = await getElectronAPI().historyGetLeaguePreference?.();
    
    // Use the hasStoredPreference flag from main process to determine if user has actually saved a preference
    const hasStoredPreference = pref && (pref as any).hasStoredPreference === true;
    
    if (hasStoredPreference) {
      // User has a real stored preference - use it and mark as explicitly set
      const league = (pref?.league || SOFTCORE_LEAGUE).trim() || SOFTCORE_LEAGUE;
      const source: LeagueSource = pref?.source === 'manual' ? 'manual' : 'auto';
      await setLeaguePreference(league, source, { persist: false, resetStore: false, reason: 'init' });
      console.log('[HistoryLeague] Loaded stored league preference:', league, '(source:', source, ')');
    } else {
      // No stored preference - set default but DON'T mark as explicitly set
      console.log('[HistoryLeague] No stored league preference - using default (user must confirm in Settings)');
      historyState.league = SOFTCORE_LEAGUE;
      historyState.leagueSource = 'auto';
      historyState.leagueExplicitlySet = false; // Force user to select league
      // Surface the prompt immediately so the user knows to pick a league
      showLeaguePrompt('manual-open', {
        message: 'Pick the trade league you want to track before refreshing history.',
        highlight: historyState.league
      });
    }
  } catch (err) {
    console.warn('[HistoryLeague] Failed to load stored league preference', err);
    // On error, use current state but don't mark as explicitly set
    historyState.league = historyState.league || SOFTCORE_LEAGUE;
    historyState.leagueSource = historyState.leagueSource === 'manual' ? 'manual' : 'auto';
    historyState.leagueExplicitlySet = false;
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
  showPrompt(reason, opts);
}
