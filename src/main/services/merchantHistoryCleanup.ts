/**
 * Merchant History Cleanup Service
 * 
 * Provides utilities to clean up corrupted/incomplete merchant history entries
 * that may have been stored when GGG's API returned item: null
 */

import * as fs from 'fs';
import * as path from 'path';
import { shell } from 'electron';

export interface HistoryEntry {
  time?: number | string;
  listedAt?: number | string;
  date?: number | string;
  price?: { amount?: number; currency?: string };
  amount?: number;
  currency?: string;
  item?: any;
  data?: { item?: any };
  note?: string;
  ts?: number;
}

export interface HistoryStore {
  entries: HistoryEntry[];
  totals?: Record<string, number>;
  lastSync?: number;
  lastFetchAt?: number;
  league?: string;
}

export interface CleanupResult {
  success: boolean;
  backupPath?: string;
  removedCount: number;
  mergedCount: number;
  totalBefore: number;
  totalAfter: number;
  error?: string;
}

export class MerchantHistoryCleanupService {
  /**
   * Check if an entry has valid item data
   */
  private static isValidEntry(entry: HistoryEntry): boolean {
    const item = entry.item || (entry.data && entry.data.item);
    
    // Null or undefined item
    if (!item || item === null) return false;
    
    // Object with no meaningful data (no name, typeLine, or baseType)
    if (typeof item === 'object' && !item.name && !item.typeLine && !item.baseType) {
      return false;
    }
    
    return true;
  }

  /**
   * Create a timestamped backup of the history file
   */
  private static async createBackup(historyFile: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const backupFile = historyFile.replace(/\.json$/, `-backup-${timestamp}.json`);
    
    // Copy the file
    fs.copyFileSync(historyFile, backupFile);
    console.log(`[HistoryCleanup] Created backup: ${backupFile}`);
    
    return backupFile;
  }

  /**
   * Helper: Generate unique key using item_id + time (same as historyFetch.ts)
   */
  private static getEntryKey(entry: any): string {
    const itemId = entry.item_id || entry.itemId || '';
    const time = entry.time || entry.ts || '';
    return `${itemId}##${time}`;
  }

  /**
   * Clean up merchant history using smart deduplication:
   * - Find duplicate entries (same item_id + time)
   * - Keep complete version, remove incomplete version
   * - If both incomplete or both complete, keep first occurrence
   * 
   * @param configDir - Directory containing merchant history files
   * @param league - League name (optional, will clean all if not specified)
   * @param dryRun - If true, only report what would be changed without actually changing
   * @returns Cleanup result with statistics
   */
  static async cleanupHistory(
    configDir: string,
    league?: string,
    dryRun: boolean = false
  ): Promise<CleanupResult> {
    try {
      // Determine history file path
      const historyFileName = league 
        ? `merchant-history-${league}.json`
        : 'merchant-history.json';
      const historyFile = path.join(configDir, historyFileName);

      // Check if file exists
      if (!fs.existsSync(historyFile)) {
        return {
          success: false,
          removedCount: 0,
          mergedCount: 0,
          totalBefore: 0,
          totalAfter: 0,
          error: 'History file not found'
        };
      }

      // Read current history
      const fileContent = fs.readFileSync(historyFile, 'utf8');
      const store: HistoryStore = JSON.parse(fileContent);

      if (!store.entries || store.entries.length === 0) {
        return {
          success: true,
          removedCount: 0,
          mergedCount: 0,
          totalBefore: 0,
          totalAfter: 0
        };
      }

      const totalBefore = store.entries.length;

      // Build map of entries by unique key (item_id + time)
      const entryMap = new Map<string, any[]>();
      
      for (const entry of store.entries) {
        const key = this.getEntryKey(entry);
        if (!key || key === '##') {
          // Skip entries without proper ID/time (very old format)
          continue;
        }
        
        if (!entryMap.has(key)) {
          entryMap.set(key, []);
        }
        entryMap.get(key)!.push(entry);
      }

      // Process duplicates: Keep complete version, remove incomplete
      const deduplicated: any[] = [];
      let mergedCount = 0;
      let removedCount = 0;

      for (const [key, entries] of entryMap) {
        if (entries.length === 1) {
          // No duplicate - keep as is
          deduplicated.push(entries[0]);
        } else {
          // Duplicates found - apply smart merge logic
          console.log(`[HistoryCleanup] Found ${entries.length} duplicates for key: ${key}`);
          
          // Separate complete and incomplete entries
          const completeEntries = entries.filter(e => this.isValidEntry(e));
          const incompleteEntries = entries.filter(e => !this.isValidEntry(e));
          
          if (completeEntries.length > 0) {
            // Keep first complete entry
            deduplicated.push(completeEntries[0]);
            mergedCount++;
            removedCount += entries.length - 1;
            
            if (incompleteEntries.length > 0) {
              console.log(`[HistoryCleanup]   → Keeping complete, removing ${incompleteEntries.length} incomplete`);
            }
            if (completeEntries.length > 1) {
              console.log(`[HistoryCleanup]   → Multiple complete entries, keeping first`);
            }
          } else {
            // All incomplete - keep first one
            deduplicated.push(incompleteEntries[0]);
            removedCount += entries.length - 1;
            console.log(`[HistoryCleanup]   → All incomplete, keeping first`);
          }
        }
      }

      const totalAfter = deduplicated.length;

      // If nothing changed, return early
      if (removedCount === 0) {
        console.log(`[HistoryCleanup] No duplicates found in ${historyFileName}`);
        return {
          success: true,
          removedCount: 0,
          mergedCount: 0,
          totalBefore,
          totalAfter: totalBefore
        };
      }

      // If dry run, don't modify the file
      if (dryRun) {
        console.log(`[HistoryCleanup] DRY RUN: Would merge ${mergedCount} duplicates, remove ${removedCount} entries from ${historyFileName}`);
        return {
          success: true,
          removedCount,
          mergedCount,
          totalBefore,
          totalAfter
        };
      }

      // Create backup before modifying
      const backupPath = await this.createBackup(historyFile);

      // Update store with deduplicated entries
      store.entries = deduplicated;

      // Recalculate totals from scratch
      const totals: Record<string, number> = {};
      for (const entry of deduplicated) {
        const price = entry.price || (entry.amount ? { amount: entry.amount, currency: entry.currency } : undefined);
        if (price && price.currency && price.amount) {
          const key = price.currency.toLowerCase();
          totals[key] = (totals[key] || 0) + price.amount;
        }
      }
      store.totals = totals;

      // Update lastSync timestamp
      store.lastSync = Date.now();

      // Write cleaned data back to file
      fs.writeFileSync(historyFile, JSON.stringify(store, null, 2), 'utf8');

      console.log(`[HistoryCleanup] Merged ${mergedCount} duplicates, removed ${removedCount} entries from ${historyFileName}`);
      console.log(`[HistoryCleanup] Backup saved to: ${backupPath}`);

      return {
        success: true,
        backupPath,
        removedCount,
        mergedCount,
        totalBefore,
        totalAfter
      };
    } catch (error) {
      console.error('[HistoryCleanup] Failed to cleanup history:', error);
      return {
        success: false,
        removedCount: 0,
        mergedCount: 0,
        totalBefore: 0,
        totalAfter: 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Scan history to count invalid entries (without modifying)
   */
  static async scanHistory(configDir: string, league?: string): Promise<{
    totalEntries: number;
    invalidEntries: number;
    validEntries: number;
  }> {
    try {
      const historyFileName = league 
        ? `merchant-history-${league}.json`
        : 'merchant-history.json';
      const historyFile = path.join(configDir, historyFileName);

      if (!fs.existsSync(historyFile)) {
        return { totalEntries: 0, invalidEntries: 0, validEntries: 0 };
      }

      const fileContent = fs.readFileSync(historyFile, 'utf8');
      const store: HistoryStore = JSON.parse(fileContent);

      if (!store.entries || store.entries.length === 0) {
        return { totalEntries: 0, invalidEntries: 0, validEntries: 0 };
      }

      const totalEntries = store.entries.length;
      const validEntries = store.entries.filter(entry => this.isValidEntry(entry)).length;
      const invalidEntries = totalEntries - validEntries;

      return { totalEntries, invalidEntries, validEntries };
    } catch (error) {
      console.error('[HistoryCleanup] Failed to scan history:', error);
      return { totalEntries: 0, invalidEntries: 0, validEntries: 0 };
    }
  }

  /**
   * Find all merchant history files in the config directory
   */
  private static findAllHistoryFiles(configDir: string): string[] {
    try {
      if (!fs.existsSync(configDir)) {
        return [];
      }

      const files = fs.readdirSync(configDir);
      return files
        .filter(file => file.startsWith('merchant-history-') && file.endsWith('.json'))
        .filter(file => !file.includes('-backup-')) // Exclude backup files
        .map(file => path.join(configDir, file));
    } catch (error) {
      console.error('[HistoryCleanup] Failed to find history files:', error);
      return [];
    }
  }

  /**
   * Clean all league history files (creates backup for each)
   */
  static async cleanupAllLeagues(configDir: string): Promise<{
    success: boolean;
    results: Array<{ file: string; result: CleanupResult }>;
    totalRemoved: number;
    totalMerged: number;
    error?: string;
  }> {
    try {
      const historyFiles = this.findAllHistoryFiles(configDir);

      if (historyFiles.length === 0) {
        return {
          success: true,
          results: [],
          totalRemoved: 0,
          totalMerged: 0,
          error: 'No history files found'
        };
      }

      const results: Array<{ file: string; result: CleanupResult }> = [];
      let totalRemoved = 0;
      let totalMerged = 0;

      for (const historyFile of historyFiles) {
        const fileName = path.basename(historyFile);
        
        // Extract league name from filename
        const leagueMatch = fileName.match(/^merchant-history-(.+)\.json$/);
        const league = leagueMatch ? leagueMatch[1] : undefined;
        
        console.log(`[HistoryCleanup] Processing ${fileName}...`);

        // Use the main cleanupHistory function
        const result = await this.cleanupHistory(configDir, league, false);
        
        if (result.removedCount > 0 || result.mergedCount > 0) {
          results.push({ file: fileName, result });
          totalRemoved += result.removedCount;
          totalMerged += result.mergedCount;
        }
      }

      return {
        success: true,
        results,
        totalRemoved,
        totalMerged
      };
    } catch (error) {
      console.error('[HistoryCleanup] Failed to cleanup all leagues:', error);
      return {
        success: false,
        results: [],
        totalRemoved: 0,
        totalMerged: 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Scan all league history files for invalid entries
   */
  static async scanAllLeagues(configDir: string): Promise<{
    files: Array<{
      fileName: string;
      totalEntries: number;
      invalidEntries: number;
      validEntries: number;
    }>;
    totalInvalid: number;
  }> {
    try {
      const historyFiles = this.findAllHistoryFiles(configDir);
      const files: Array<{
        fileName: string;
        totalEntries: number;
        invalidEntries: number;
        validEntries: number;
      }> = [];
      let totalInvalid = 0;

      for (const historyFile of historyFiles) {
        const fileName = path.basename(historyFile);

        try {
          const fileContent = fs.readFileSync(historyFile, 'utf8');
          const store: HistoryStore = JSON.parse(fileContent);

          if (!store.entries || store.entries.length === 0) {
            continue;
          }

          const totalEntries = store.entries.length;
          const validEntries = store.entries.filter(entry => this.isValidEntry(entry)).length;
          const invalidEntries = totalEntries - validEntries;

          if (invalidEntries > 0) {
            files.push({ fileName, totalEntries, invalidEntries, validEntries });
            totalInvalid += invalidEntries;
          }
        } catch (error) {
          console.error(`[HistoryCleanup] Failed to scan ${fileName}:`, error);
        }
      }

      return { files, totalInvalid };
    } catch (error) {
      console.error('[HistoryCleanup] Failed to scan all leagues:', error);
      return { files: [], totalInvalid: 0 };
    }
  }

  /**
   * Open the backups folder in file explorer
   */
  static openBackupsFolder(configDir: string): void {
    try {
      shell.openPath(configDir);
    } catch (error) {
      console.error('[HistoryCleanup] Failed to open backups folder:', error);
    }
  }
}
