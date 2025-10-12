/**
 * Merchant History CSV Export Service
 * 
 * Provides CSV export functionality for merchant history data.
 * Accessible via tray menu.
 */

import * as fs from 'fs';
import * as path from 'path';
import { shell, BrowserWindow } from 'electron';

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
}

export interface HistoryStore {
  entries: HistoryEntry[];
  totals?: Record<string, number>;
  lastSync?: number;
  lastFetchAt?: number;
  league?: string;
}

export class MerchantHistoryExportService {
  /**
   * Export merchant history to CSV file
   */
  static async exportToCsv(configDir: string, overlayWindow: BrowserWindow | null, league?: string): Promise<void> {
    try {
      // Request data from renderer
      if (!overlayWindow || overlayWindow.isDestroyed()) {
        console.warn('[MerchantHistoryExport] No overlay window available');
        return;
      }

      // Get history data from renderer
      const historyData = await overlayWindow.webContents.executeJavaScript(`
        (function() {
          try {
            if (typeof historyState !== 'undefined' && historyState && historyState.store) {
              return historyState.store;
            }
            return null;
          } catch (e) {
            return null;
          }
        })();
      `);

      if (!historyData || !historyData.entries || historyData.entries.length === 0) {
        console.warn('[MerchantHistoryExport] No history data to export');
        return;
      }

      const store = historyData as HistoryStore;
      const leagueName = league || store.league || 'unknown';
      const safeLeagueName = leagueName.replace(/[^a-zA-Z0-9_-]/g, '_');
      
      // Generate CSV content
      const csvLines: string[] = [];
      csvLines.push('Timestamp,Item Name,Item Type,Rarity,Price Amount,Price Currency,Note');

      for (const entry of store.entries) {
        const timestamp = entry.time || entry.listedAt || entry.date || '';
        const dateStr = timestamp ? new Date(Number(timestamp)).toISOString() : '';
        
        const item = entry.item || (entry.data && entry.data.item);
        const itemName = item?.name || '';
        const itemType = item?.typeLine || item?.baseType || '';
        const rarity = item?.rarity || '';
        
        const priceAmount = entry.price?.amount || entry.amount || '';
        const priceCurrency = entry.price?.currency || entry.currency || '';
        const note = entry.note || '';

        // Escape CSV values
        const escapeCsv = (val: any): string => {
          const str = String(val || '');
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };

        csvLines.push([
          escapeCsv(dateStr),
          escapeCsv(itemName),
          escapeCsv(itemType),
          escapeCsv(rarity),
          escapeCsv(priceAmount),
          escapeCsv(priceCurrency),
          escapeCsv(note)
        ].join(','));
      }

      // Write CSV file
      const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
      const exportFile = path.join(configDir, `merchant-history-export-${safeLeagueName}-${timestamp}.csv`);
      
      fs.writeFileSync(exportFile, csvLines.join('\n'), 'utf8');
      console.log(`[MerchantHistoryExport] Exported ${store.entries.length} entries to ${exportFile}`);

      // Open folder containing the export
      try {
        shell.showItemInFolder(exportFile);
      } catch (e) {
        console.warn('[MerchantHistoryExport] Failed to open folder:', e);
      }
    } catch (e) {
      console.error('[MerchantHistoryExport] Failed to export merchant history:', e);
      throw e;
    }
  }
}
