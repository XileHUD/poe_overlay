import * as fs from 'fs';
import * as path from 'path';
import type { FeatureConfig } from '../features/featureTypes.js';

export interface UserSettings {
  enabledFeatures?: FeatureConfig;
  seenFeatureSplash?: boolean; // Track if user has seen feature selection splash at least once
  floatingButton?: {
    enabled: boolean;
    position?: { x: number; y: number };
    pinned?: boolean;
  };
  hotkey?: {
    key: string; // e.g., "Q", "E", "1", "F1", etc.
    useCtrl?: boolean; // when true (default), register as Ctrl/Cmd + key; when false, register as single key
  };
  fontSize?: number; // Font size percentage (80-150), default 100
  clipboardDelay?: number; // Delay in ms before checking clipboard after Ctrl+C (default 300ms)
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
}
