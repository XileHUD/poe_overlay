import * as fs from 'fs';
import * as path from 'path';
import type { FeatureConfig } from '../features/featureTypes.js';
import type { OverlayVersion } from '../../types/overlayVersion.js';

export interface UserSettings {
  enabledFeatures?: FeatureConfig;
  seenFeatureSplash?: boolean; // Track if user has seen feature selection splash at least once
  featureSplashSeen?: Partial<Record<OverlayVersion, boolean>>; // Per-overlay-version splash tracking
  overlayVersion?: OverlayVersion;
  floatingButton?: {
    enabled: boolean;
    position?: { x: number; y: number };
    pinned?: boolean;
  };
  levelingWindow?: {
    enabled?: boolean;
    position?: { x: number; y: number };
    size?: { width: number; height: number };
    wideMode?: boolean;
    progress?: string[]; // Array of completed step IDs
    currentActIndex?: number; // Currently selected act (0-based index)
    actTimers?: Record<number, number>; // Completion time for each act: { 1: 123456, 2: 234567, ... }
    uiSettings?: {
      opacity?: number;
      fontSize?: number;
      zoom?: number;
      minimalMode?: string;
      mode?: string;
      visibleSteps?: number;
      showHints?: boolean;
      showOptional?: boolean;
      groupByZone?: boolean;
    };
  };
  // Game-specific leveling window state (POE1)
  levelingWindowPoe1?: {
    enabled?: boolean;
    position?: { x: number; y: number };
    size?: { width: number; height: number };
    wideMode?: boolean;
    progress?: string[]; // Array of completed step IDs
    currentActIndex?: number; // Currently selected act (0-based index)
    actTimers?: Record<number, number>; // Completion time for each act: { 1: 123456, 2: 234567, ... }
    uiSettings?: {
      opacity?: number;
      fontSize?: number;
      zoom?: number;
      minimalMode?: string;
      mode?: string;
      visibleSteps?: number;
      showHints?: boolean;
      showOptional?: boolean;
      groupByZone?: boolean;
    };
  };
  // Game-specific leveling window state (POE2)
  levelingWindowPoe2?: {
    enabled?: boolean;
    position?: { x: number; y: number };
    size?: { width: number; height: number };
    wideMode?: boolean;
    progress?: string[]; // Array of completed step IDs
    currentActIndex?: number; // Currently selected act (0-based index)
    actTimers?: Record<number, number>; // Completion time for each act: { 1: 123456, 2: 234567, ... }
    uiSettings?: {
      opacity?: number;
      fontSize?: number;
      zoom?: number;
      minimalMode?: string;
      mode?: string;
      visibleSteps?: number;
      showHints?: boolean;
      showOptional?: boolean;
      groupByZone?: boolean;
    };
  };
  hotkey?: {
    key: string; // e.g., "Q", "E", "1", "F1", etc.
    useCtrl?: boolean; // when true (default), register as Ctrl/Cmd + key; when false, register as single key
  };
  fontSize?: number; // Font size percentage (80-150), default 100
  fontSizeInitialized?: boolean; // Flag to track if font size has been initialized on first install
  clipboardDelay?: number | null; // Additional delay before clipboard polling (ms)
  clipboardDelayMigrated?: boolean; // Internal flag to avoid repeating clipboard delay resets
  clipboardDelayMigratedV2?: boolean; // Flag for 2025-10 migration to new hotkey system defaults
  clipboardDelayMigratedV3?: boolean; // Flag for resetting all clipboard delays to Auto (2025-10-11)
  // Legacy merchant history settings (deprecated - use version-specific ones below)
  merchantHistoryLeague?: string; // Preferred league for merchant history fetches
  merchantHistoryLeagueSource?: 'auto' | 'manual'; // Whether league was auto-detected or manually chosen
  // Version-specific merchant history settings
  merchantHistoryLeaguePoe1?: string; // PoE1-specific league for merchant history
  merchantHistoryLeagueSourcePoe1?: 'auto' | 'manual'; // PoE1 league source
  merchantHistoryLeaguePoe2?: string; // PoE2-specific league for merchant history
  merchantHistoryLeagueSourcePoe2?: 'auto' | 'manual'; // PoE2 league source
  merchantHistoryAutoFetch?: boolean; // Enable/disable automatic history fetching (default: true)
  merchantHistoryRefreshInterval?: number; // Auto-fetch interval in minutes (default: 30, min: 15)
  historyAutoCleanupDone?: boolean; // Flag to track if auto-cleanup has been performed on first start
  // Rate limit persistence
  rateLimitRules?: string; // Last known rate limit rules (e.g., "5:60:60,10:600:120")
  rateLimitState?: string; // Last known rate limit state (e.g., "0:60:55,3:600:510")
  rateLimitTimestamp?: number; // Timestamp when rate limit info was saved (ms since epoch)
  // Client.txt path settings for zone auto-detection - separate for POE1 and POE2
  clientTxtPathPoe1?: string; // POE1 Client.txt path
  clientTxtPathPoe2?: string; // POE2 Client.txt path
  clientTxtAutoDetectedPoe1?: boolean; // Whether POE1 path was auto-detected
  clientTxtAutoDetectedPoe2?: boolean; // Whether POE2 path was auto-detected
  clientTxtLastCheckedPoe1?: number; // Timestamp of last POE1 auto-detection
  clientTxtLastCheckedPoe2?: number; // Timestamp of last POE2 auto-detection
  clientTxtDetectionAttemptedPoe1?: boolean; // Flag for POE1 auto-detection attempt
  clientTxtDetectionAttemptedPoe2?: boolean; // Flag for POE2 auto-detection attempt
  clientTxtNotificationShownPoe1?: boolean; // Flag for POE1 "not found" notification
  clientTxtNotificationShownPoe2?: boolean; // Flag for POE2 "not found" notification
  // Legacy settings (kept for migration)
  clientTxtPath?: string;
  clientTxtAutoDetected?: boolean;
  clientTxtLastChecked?: number;
  clientTxtDetectionAttempted?: boolean;
  clientTxtNotificationShown?: boolean;
}

export class SettingsService {
  private settings: UserSettings = {};
  private configPath: string;

  constructor(configDir: string) {
    this.configPath = path.join(configDir, 'settings.json');
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf8');
        this.settings = JSON.parse(raw);
      }
    } catch (error) {
      console.warn('Failed to load settings:', error);
      this.settings = {};
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.settings, null, 2));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  get<K extends keyof UserSettings>(key: K): UserSettings[K] {
    return this.settings[key];
  }

  set<K extends keyof UserSettings>(key: K, value: UserSettings[K]): void {
    this.settings[key] = value;
    this.save();
  }

  update<K extends keyof UserSettings>(key: K, updater: (current: UserSettings[K]) => UserSettings[K]): void {
    this.settings[key] = updater(this.settings[key]);
    this.save();
  }

  clear<K extends keyof UserSettings>(key: K): void {
    delete this.settings[key];
    this.save();
  }
}
