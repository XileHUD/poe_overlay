/**
 * Merchant History Backup Service
 * 
 * Creates timestamped backups of merchant history files on app startup.
 * Maintains a rolling window of the last 10 backups per game version/league.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface BackupResult {
    success: boolean;
    backedUpFiles: string[];
    errors: string[];
    totalBackups: number;
    cleanedOldBackups: number;
}

/**
 * Backup all merchant history files in the config directory
 * @param configDir - Path to the config directory (e.g., %APPDATA%/XileHUD)
 * @param maxBackupsPerFile - Maximum number of backups to keep per file (default: 10)
 */
export async function backupMerchantHistories(
    configDir: string,
    maxBackupsPerFile: number = 10
): Promise<BackupResult> {
    const result: BackupResult = {
        success: true,
        backedUpFiles: [],
        errors: [],
        totalBackups: 0,
        cleanedOldBackups: 0
    };

    try {
        // Create backup directory if it doesn't exist
        const backupDir = path.join(configDir, 'merchant-history-backups');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        // Find all merchant history files (pattern: merchant-history-{gameVersion}-{league}.json)
        const files = fs.readdirSync(configDir);
        const historyPattern = /^merchant-history-(poe[12])-(.+)\.json$/;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0];

        for (const file of files) {
            const match = file.match(historyPattern);
            if (!match) continue;

            const filePath = path.join(configDir, file);
            
            // Skip empty files (0 bytes)
            try {
                const stats = fs.statSync(filePath);
                if (stats.size === 0) {
                    console.log(`[Backup] Skipping empty file: ${file}`);
                    continue;
                }
            } catch (err) {
                result.errors.push(`Failed to stat ${file}: ${err}`);
                continue;
            }

            // Create backup with timestamp
            const gameVersion = match[1]; // 'poe1' or 'poe2'
            const league = match[2]; // e.g., 'Keepers_of_the_Flame'
            const backupFileName = `merchant-history-${gameVersion}-${league}-${timestamp}.json`;
            const backupPath = path.join(backupDir, backupFileName);

            try {
                fs.copyFileSync(filePath, backupPath);
                result.backedUpFiles.push(file);
                result.totalBackups++;
                console.log(`[Backup] Created backup: ${backupFileName}`);
            } catch (err) {
                result.errors.push(`Failed to backup ${file}: ${err}`);
                result.success = false;
                continue;
            }

            // Clean up old backups for this specific game version/league
            try {
                const cleaned = await cleanOldBackups(backupDir, gameVersion, league, maxBackupsPerFile);
                result.cleanedOldBackups += cleaned;
            } catch (err) {
                console.warn(`[Backup] Failed to clean old backups for ${gameVersion}-${league}:`, err);
            }
        }

        if (result.backedUpFiles.length === 0) {
            console.log('[Backup] No merchant history files found to backup');
        } else {
            console.log(`[Backup] Successfully backed up ${result.backedUpFiles.length} file(s), cleaned ${result.cleanedOldBackups} old backup(s)`);
        }

    } catch (err) {
        console.error('[Backup] Fatal error during backup:', err);
        result.success = false;
        result.errors.push(`Fatal error: ${err}`);
    }

    return result;
}

/**
 * Clean up old backups, keeping only the most recent N backups per game version/league
 */
async function cleanOldBackups(
    backupDir: string,
    gameVersion: string,
    league: string,
    maxBackups: number
): Promise<number> {
    try {
        const files = fs.readdirSync(backupDir);
        
        // Pattern: merchant-history-{gameVersion}-{league}-{timestamp}.json
        const backupPattern = new RegExp(`^merchant-history-${gameVersion}-${league.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(.+)\\.json$`);
        
        const backups = files
            .filter(file => backupPattern.test(file))
            .map(file => ({
                name: file,
                path: path.join(backupDir, file),
                mtime: fs.statSync(path.join(backupDir, file)).mtime.getTime()
            }))
            .sort((a, b) => b.mtime - a.mtime); // Sort newest first

        // Keep only the most recent N backups
        const toDelete = backups.slice(maxBackups);
        
        let deletedCount = 0;
        for (const backup of toDelete) {
            try {
                fs.unlinkSync(backup.path);
                console.log(`[Backup] Cleaned old backup: ${backup.name}`);
                deletedCount++;
            } catch (err) {
                console.warn(`[Backup] Failed to delete old backup ${backup.name}:`, err);
            }
        }

        return deletedCount;
    } catch (err) {
        console.warn('[Backup] Error during cleanup:', err);
        return 0;
    }
}

/**
 * Get backup statistics for a specific game version and league
 */
export function getBackupStats(
    configDir: string,
    gameVersion?: string,
    league?: string
): { count: number; totalSize: number; oldestBackup?: Date; newestBackup?: Date } {
    const stats = {
        count: 0,
        totalSize: 0,
        oldestBackup: undefined as Date | undefined,
        newestBackup: undefined as Date | undefined
    };

    try {
        const backupDir = path.join(configDir, 'merchant-history-backups');
        if (!fs.existsSync(backupDir)) {
            return stats;
        }

        const files = fs.readdirSync(backupDir);
        let pattern: RegExp;

        if (gameVersion && league) {
            pattern = new RegExp(`^merchant-history-${gameVersion}-${league.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(.+)\\.json$`);
        } else if (gameVersion) {
            pattern = new RegExp(`^merchant-history-${gameVersion}-(.+)\\.json$`);
        } else {
            pattern = /^merchant-history-(poe[12])-(.+)\.json$/;
        }

        const backups = files
            .filter(file => pattern.test(file))
            .map(file => {
                const filePath = path.join(backupDir, file);
                const stat = fs.statSync(filePath);
                return {
                    mtime: stat.mtime,
                    size: stat.size
                };
            });

        stats.count = backups.length;
        stats.totalSize = backups.reduce((sum, b) => sum + b.size, 0);

        if (backups.length > 0) {
            const times = backups.map(b => b.mtime.getTime());
            stats.oldestBackup = new Date(Math.min(...times));
            stats.newestBackup = new Date(Math.max(...times));
        }
    } catch (err) {
        console.warn('[Backup] Error getting backup stats:', err);
    }

    return stats;
}
