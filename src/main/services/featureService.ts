/**
 * Service for managing feature configuration.
 * Handles loading, saving, and querying enabled features.
 */

import { FeatureConfig, DEFAULT_FEATURES, CraftingSubcategories, CharacterSubcategories, Poe1CharacterSubcategories, ItemsSubcategories, Poe1ItemsSubcategories, Poe1CraftingSubcategories } from '../features/featureTypes.js';
import { SettingsService } from './settingsService.js';

const MODIFIER_CATEGORY_PATTERNS = [
  'Amulets', 'Rings', 'Belts',
  'Body_Armours_*', 'Helmets_*', 'Gloves_*', 'Boots_*', 'Shields_*',
  'Bows', 'Crossbows', 'Wands', 'Daggers', 'Claws', 'Flails', 'Foci',
  'One_Hand_Swords', 'Two_Hand_Swords',
  'One_Hand_Maces', 'Two_Hand_Maces',
  'One_Hand_Axes', 'Two_Hand_Axes',
  'Quarterstaves', 'Staves', 'Sceptres', 'Spears',
  'Quivers', 'Bucklers',
  'ALL', 'DESECRATED', 'ESSENCE', 'CORRUPTED', 'SOCKETABLE',
  'Waystones', 'Waystones_*',
  'Relics', '*_Relic',
  'Life_Flasks', 'Mana_Flasks', 'Charms',
  'Tablet', 'Precursor_Tablet', '*_Precursor_Tablet',
  'Jewels', 'Ruby', 'Emerald', 'Sapphire', 'Time-Lost_*',
  'Stackable_Currency',
  'Strongbox', 'Strongbox_Uniques', 'Expedition_Logbook'
];

const CRAFTING_CATEGORY_MAP: Record<string, keyof CraftingSubcategories> = {
  Liquid_Emotions: 'liquidEmotions',
  Annoints: 'annoints',
  Essences: 'essences',
  Omens: 'omens',
  Currency: 'currency',
  Catalysts: 'catalysts',
  Socketables: 'socketables'
};

const CHARACTER_CATEGORY_MAP: Record<string, keyof CharacterSubcategories> = {
  Keystones: 'keystones',
  Ascendancy_Passives: 'ascendancyPassives',
  Atlas_Nodes: 'atlasNodes',
  Gems: 'gems',
  Keywords: 'glossar'
};

const ITEM_CATEGORY_MAP: Record<string, keyof ItemsSubcategories> = {
  Uniques: 'uniques',
  Bases: 'bases'
};

const POE1_ITEM_CATEGORY_MAP: Record<string, keyof Poe1ItemsSubcategories> = {
  Poe1_Uniques: 'uniques',
  Poe1_Bases: 'bases'
};

export class FeatureService {
  private patternCache = new Map<string, RegExp>();

  constructor(private settings: SettingsService) {}

  /**
   * Get the current feature configuration.
   * Returns default config if none is stored.
   */
  getConfig(): FeatureConfig {
    const stored = this.settings.get('enabledFeatures') as Partial<FeatureConfig> | undefined;

    if (!stored) {
      return DEFAULT_FEATURES;
    }

    return {
      ...DEFAULT_FEATURES,
      ...stored,
      crafting: {
        ...DEFAULT_FEATURES.crafting,
        ...(stored.crafting || {}),
        subcategories: {
          ...DEFAULT_FEATURES.crafting.subcategories,
          ...(stored.crafting?.subcategories || {})
        }
      },
      poe1Crafting: {
        ...DEFAULT_FEATURES.poe1Crafting,
        ...(stored.poe1Crafting || {}),
        subcategories: {
          ...DEFAULT_FEATURES.poe1Crafting.subcategories,
          ...(stored.poe1Crafting?.subcategories || {})
        }
      },
      character: {
        ...DEFAULT_FEATURES.character,
        ...(stored.character || {}),
        subcategories: {
          ...DEFAULT_FEATURES.character.subcategories,
          ...(stored.character?.subcategories || {})
        }
      },
      poe1Character: {
        ...DEFAULT_FEATURES.poe1Character,
        ...(stored.poe1Character || {}),
        subcategories: {
          ...DEFAULT_FEATURES.poe1Character.subcategories,
          ...(stored.poe1Character?.subcategories || {})
        }
      },
      items: {
        ...DEFAULT_FEATURES.items,
        ...(stored.items || {}),
        subcategories: {
          ...DEFAULT_FEATURES.items.subcategories,
          ...(stored.items?.subcategories || {})
        }
      },
      poe1Items: {
        ...DEFAULT_FEATURES.poe1Items,
        ...(stored.poe1Items || {}),
        subcategories: {
          ...DEFAULT_FEATURES.poe1Items.subcategories,
          ...(stored.poe1Items?.subcategories || {})
        }
      },
      tools: {
        ...DEFAULT_FEATURES.tools,
        ...(stored.tools || {}),
        subcategories: {
          ...DEFAULT_FEATURES.tools.subcategories,
          ...(stored.tools?.subcategories || {})
        }
      }
    };
  }

  /**
   * Save feature configuration.
   * Validates before saving.
   */
  saveConfig(config: FeatureConfig): void {
    this.validateConfig(config);
    this.settings.set('enabledFeatures', config);
  }

  /**
   * Check if a top-level feature is enabled.
   */
  isFeatureEnabled(feature: keyof FeatureConfig): boolean {
    const config = this.getConfig();
    const val = config[feature];
    return typeof val === 'boolean' ? val : (val as any)?.enabled || false;
  }

  /**
   * Get list of JSON categories that should be loaded based on enabled features.
   * Returns category names/patterns for ModifierDatabase filtering.
   */
  getEnabledJsonCategories(): string[] {
    const config = this.getConfig();
    const categories: string[] = [];

    // Modifiers (all gear/weapons/etc.)
    if (config.modifiers) {
      categories.push(...MODIFIER_CATEGORY_PATTERNS);
    }

    // Crafting subcategories
    if (config.crafting?.enabled) {
      const c = config.crafting.subcategories;
      for (const [categoryName, key] of Object.entries(CRAFTING_CATEGORY_MAP)) {
        if (c[key]) categories.push(categoryName);
      }
    }

    // Character subcategories
    if (config.character?.enabled) {
      const c = config.character.subcategories;
      for (const [categoryName, key] of Object.entries(CHARACTER_CATEGORY_MAP)) {
        if (c[key]) categories.push(categoryName);
      }
      // Note: questPassives doesn't need a JSON (local state only)
    }

    // Items subcategories
    if (config.items?.enabled) {
      const i = config.items.subcategories;
      for (const [categoryName, key] of Object.entries(ITEM_CATEGORY_MAP)) {
        if (i[key]) categories.push(categoryName);
      }
    }

    // Tools don't require JSON categories (regex is UI-only)

    return categories;
  }

  /**
   * Check if a parsed item category should be available based on feature selection.
   */
  isCategoryEnabled(category: string): boolean {
    if (!category) return false;
    const value = category.trim();
    if (!value) return false;
    const config = this.getConfig();

    if (this.matchesAnyPattern(MODIFIER_CATEGORY_PATTERNS, value)) {
      return !!config.modifiers;
    }

    if (this.matchesMappedCategory(CRAFTING_CATEGORY_MAP, value, () => !!config.crafting?.enabled, config.crafting?.subcategories)) {
      return true;
    }

    if (this.matchesMappedCategory(CHARACTER_CATEGORY_MAP, value, () => !!config.character?.enabled, config.character?.subcategories)) {
      return true;
    }

    if (this.matchesMappedCategory(ITEM_CATEGORY_MAP, value, () => !!config.items?.enabled, config.items?.subcategories)) {
      return true;
    }

    if (/^merchant$/i.test(value)) {
      return !!config.merchant;
    }

    // Fallback: check generated JSON categories (handles wildcard-only patterns)
    const enabledCategories = this.getEnabledJsonCategories();
    return enabledCategories.some(pattern => this.matchesPattern(pattern, value));
  }

  private matchesMappedCategory<T extends Record<string, any>>(map: Record<string, keyof T>, value: string, parentEnabled: () => boolean, subcategories?: T): boolean {
    if (!parentEnabled() || !subcategories) return false;
    for (const [categoryName, key] of Object.entries(map)) {
      if (this.matchesPattern(categoryName, value)) {
        return !!subcategories[key];
      }
    }
    return false;
  }

  private matchesAnyPattern(patterns: string[], value: string): boolean {
    return patterns.some(pattern => this.matchesPattern(pattern, value));
  }

  private matchesPattern(pattern: string, value: string): boolean {
    const regex = this.getPatternRegex(pattern);
    return regex.test(value);
  }

  private getPatternRegex(pattern: string): RegExp {
    let regex = this.patternCache.get(pattern);
    if (!regex) {
      const escaped = pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
      regex = new RegExp(`^${escaped}$`, 'i');
      this.patternCache.set(pattern, regex);
    }
    return regex;
  }

  /**
   * Validate feature configuration.
   * Ensures at least one feature is enabled and parent-child consistency.
   */
  private validateConfig(config: FeatureConfig): void {
    // Ensure at least one feature enabled
    const hasAny = config.modifiers || 
                   config.merchant || 
                   config.crafting?.enabled || 
                   config.character?.enabled || 
                   config.items?.enabled || 
                   config.tools?.enabled;
    
    if (!hasAny) {
      throw new Error('At least one feature must be enabled');
    }

    // Disable all subcategories if parent disabled
    if (!config.crafting?.enabled) {
      config.crafting = {
        enabled: false,
        subcategories: {
          liquidEmotions: false,
          annoints: false,
          essences: false,
          omens: false,
          currency: false,
          catalysts: false,
          socketables: false
        }
      };
    }

    if (!config.poe1Crafting?.enabled) {
      config.poe1Crafting = {
        enabled: false,
        subcategories: {
          scarabs: false,
          currency: false,
          essences: false,
          fossils: false,
          embers: false
        }
      } as { enabled: boolean; subcategories: Poe1CraftingSubcategories };
    }

    if (!config.character?.enabled) {
      config.character = {
        enabled: false,
        subcategories: {
          questPassives: false,
          keystones: false,
          ascendancyPassives: false,
          atlasNodes: false,
          gems: false,
          glossar: false
        }
      };
    }

    if (!config.items?.enabled) {
      config.items = {
        enabled: false,
        subcategories: {
          uniques: false,
          bases: false
        }
      };
    }

    if (!config.poe1Items?.enabled) {
      config.poe1Items = {
        enabled: false,
        subcategories: {
          uniques: false,
          bases: false
        }
      };
    }

    if (!config.tools?.enabled) {
      config.tools = {
        enabled: false,
        subcategories: {
          regex: false
        }
      };
    }
  }
}
