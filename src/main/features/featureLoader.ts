/**
 * Feature loader orchestrator.
 * Manages conditional loading of features based on user configuration.
 */

import { FeatureService } from '../services/featureService.js';
import { ModifierDatabase } from '../modifier-database.js';

export interface FeatureLoadResult {
  modifierDatabase: ModifierDatabase | null;
}

export class FeatureLoader {
  private modifierDatabase: ModifierDatabase | null = null;

  constructor(
    private featureService: FeatureService,
    private dataPath: string,
    private updateSplash: (msg: string) => void
  ) {}

  /**
   * Load all enabled features.
   * Returns loaded instances for features that were enabled.
   */
  async loadAll(): Promise<FeatureLoadResult> {
    const config = this.featureService.getConfig();
    
    this.updateSplash('Checking enabled features...');

    // Load modifier database if any feature needs it
    if (this.needsModifierDatabase()) {
      await this.loadModifierDatabase();
    } else {
      this.updateSplash('Modifier database not needed (skipping)');
    }

    // Merchant history doesn't require loading (just IPC handlers)
    // Tools (regex) doesn't require loading (just UI)

    return {
      modifierDatabase: this.modifierDatabase
    };
  }

  /**
   * Check if modifier database is needed based on enabled features.
   */
  private needsModifierDatabase(): boolean {
    const config = this.featureService.getConfig();
    
    // ModifierDatabase is needed for:
    // - Modifiers feature
    // - Any crafting subcategory
    // - Any character subcategory (except quest passives)
    // - Any items subcategory
    
    return config.modifiers || 
           config.crafting?.enabled || 
           config.character?.enabled || 
           config.items?.enabled;
  }

  /**
   * Load modifier database with filtered categories.
   */
  private async loadModifierDatabase(): Promise<void> {
    this.updateSplash('Initializing modifier database...');
    
    const categories = this.featureService.getEnabledJsonCategories();
    
    if (categories.length === 0) {
      this.updateSplash('No modifier categories enabled');
      return;
    }

    this.modifierDatabase = new ModifierDatabase(this.dataPath, false);
    
    await this.modifierDatabase.loadAsyncFiltered(
      categories,
      (msg) => this.updateSplash(msg)
    );
  }

  /**
   * Cleanup loaded resources.
   * Call this when switching feature configurations or shutting down.
   */
  cleanup(): void {
    if (this.modifierDatabase) {
      // Clear the in-memory JSON cache
      (this.modifierDatabase as any).jsonCache?.clear();
      this.modifierDatabase = null;
    }
  }
}
