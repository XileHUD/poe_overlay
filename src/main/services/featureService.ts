/**
 * Service for managing feature configuration.
 * Handles loading, saving, and querying enabled features.
 */

import { FeatureConfig, DEFAULT_FEATURES } from '../features/featureTypes.js';
import { SettingsService } from './settingsService.js';

export class FeatureService {
  constructor(private settings: SettingsService) {}

  /**
   * Get the current feature configuration.
   * Returns default config if none is stored.
   */
  getConfig(): FeatureConfig {
    const stored = this.settings.get('enabledFeatures');
    return stored || DEFAULT_FEATURES;
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
      categories.push(
        // Jewelry
        'Amulets', 'Rings', 'Belts',
        // Armour (with attribute variants)
        'Body_Armours_*', 'Helmets_*', 'Gloves_*', 'Boots_*', 'Shields_*',
        // Weapons
        'Bows', 'Crossbows', 'Wands', 'Daggers', 'Claws', 'Flails', 'Foci',
        'One_Hand_Swords', 'Two_Hand_Swords', 
        'One_Hand_Maces', 'Two_Hand_Maces',
        'One_Hand_Axes', 'Two_Hand_Axes', 
        'Quarterstaves', 'Staves', 'Sceptres', 'Spears',
        // Offhand
        'Quivers', 'Bucklers',
        // Aggregated modifier views
        'ALL', 'DESECRATED', 'ESSENCE', 'CORRUPTED', 'SOCKETABLE',
        // Waystones, relics, flasks, etc.
        'Waystones_*', '*_Relic', 
        'Life_Flasks', 'Mana_Flasks', 'Charms',
        '*_Precursor_Tablet', 
        'Ruby', 'Emerald', 'Sapphire', 'Time-Lost_*',
        'Strongbox', 'Strongbox_Uniques', 'Expedition_Logbook'
      );
    }

    // Crafting subcategories
    if (config.crafting?.enabled) {
      const c = config.crafting.subcategories;
      if (c.liquidEmotions) categories.push('Liquid_Emotions');
      if (c.annoints) categories.push('Annoints');
      if (c.essences) categories.push('Essences');
      if (c.omens) categories.push('Omens');
      if (c.currency) categories.push('Currency');
      if (c.catalysts) categories.push('Catalysts');
      if (c.socketables) categories.push('Socketables');
    }

    // Character subcategories
    if (config.character?.enabled) {
      const c = config.character.subcategories;
      if (c.keystones) categories.push('Keystones');
      if (c.ascendancyPassives) categories.push('Ascendancy_Passives');
      if (c.atlasNodes) categories.push('Atlas_Nodes');
      if (c.gems) categories.push('Gems');
      if (c.glossar) categories.push('Keywords'); // Glossar maps to Keywords.json
      // Note: questPassives doesn't need a JSON (local state only)
    }

    // Items subcategories
    if (config.items?.enabled) {
      const i = config.items.subcategories;
      if (i.uniques) categories.push('Uniques');
      if (i.bases) categories.push('Bases');
    }

    // Tools don't require JSON categories (regex is UI-only)

    return categories;
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
      config.crafting.subcategories = {
        liquidEmotions: false,
        annoints: false,
        essences: false,
        omens: false,
        currency: false,
        catalysts: false,
        socketables: false
      };
    }

    if (!config.character?.enabled) {
      config.character.subcategories = {
        questPassives: false,
        keystones: false,
        ascendancyPassives: false,
        atlasNodes: false,
        gems: false,
        glossar: false
      };
    }

    if (!config.items?.enabled) {
      config.items.subcategories = {
        uniques: false,
        bases: false
      };
    }

    if (!config.tools?.enabled) {
      config.tools.subcategories = {
        regex: false
      };
    }
  }
}
