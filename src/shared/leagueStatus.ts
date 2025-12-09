/**
 * Global League Status Configuration
 * 
 * IMPORTANT: Update this when leagues change!
 * 
 * When a new league launches:
 * 1. Set the appropriate LEAGUE_ENDED flag to false (POE1 or POE2)
 * 2. Update league constants in historyLeague.ts
 * 3. Push update
 * 
 * When a league ends:
 * 1. Set the appropriate LEAGUE_ENDED flag to true (POE1 or POE2)
 * 2. Push update (stops all fetches immediately for that game version)
 */

/**
 * Global flag to instantly disable POE1 league fetches across all instances.
 * 
 * Set to TRUE when PoE1 league season has ended.
 * Set to FALSE when new PoE1 league launches.
 */
export const POE1_LEAGUE_ENDED = false; // ⚠️ CHANGE THIS when PoE1 league status changes

/**
 * Global flag to instantly disable POE2 league fetches across all instances.
 * 
 * Set to TRUE when PoE2 league season has ended.
 * Set to FALSE when new PoE2 league launches.
 */
export const POE2_LEAGUE_ENDED = true; // ⚠️ CHANGE THIS when PoE2 league status changes

/**
 * Message shown to users when league has ended
 */
export const LEAGUE_ENDED_MESSAGE = 'League ended';

/**
 * Tooltip/detailed message for ended league
 */
export const LEAGUE_ENDED_TOOLTIP = 'The current league has ended. The new league will be available directly on launch (update required)';
