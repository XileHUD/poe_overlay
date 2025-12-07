/**
 * History Item Grouping
 * 
 * Groups consecutive identical sales for cleaner display.
 * 
 * Logic:
 * - Groups items with matching name + price
 * - Allows gaps of up to 15 minutes for ongoing bulk sales
 * - Displays as "6x Citadel Map" instead of 6 separate rows
 */

import type { HistoryEntryRaw } from './historyData';
import { normalizeCurrency } from '../utils';

const GROUPING_TIME_WINDOW = 60 * 60 * 1000; // 60 minutes in milliseconds (increased from 15)

export interface GroupedHistoryEntry {
  /** Original entry or first entry in group */
  entry: HistoryEntryRaw;
  /** Number of items in this group (1 if not grouped) */
  count: number;
  /** All original indices that belong to this group */
  originalIndices: number[];
  /** All entries in this group (for calculating totals and expansion) */
  entries: HistoryEntryRaw[];
  /** Is this a grouped entry? */
  isGrouped: boolean;
  /** Is this group currently expanded? */
  isExpanded: boolean;
  /** Total price for all items in group */
  totalPrice: number;
  /** Currency for the group */
  currency: string;
}

/**
 * Get a unique key for an item based on name and currency only
 * (ignoring individual price - groups items with same name regardless of price variation)
 */
function getItemKey(entry: HistoryEntryRaw): string {
  const name = entry?.item?.name || entry?.item?.typeLine || entry?.item?.baseType || "Item";
  const currency = normalizeCurrency(entry?.price?.currency ?? entry?.currency ?? "");
  
  // Group by name + currency only (not price)
  if (currency) {
    return `${name}|||${currency}`;
  }
  
  return `${name}|||NO_PRICE`;
}

/**
 * Get timestamp from entry
 */
function getTimestamp(entry: HistoryEntryRaw): number {
  const ts = entry?.time || entry?.listedAt || entry?.date || 0;
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    return isNaN(parsed) ? 0 : parsed;
  }
  return typeof ts === 'number' ? ts : 0;
}

/**
 * Calculate total price for a group of entries
 */
function calculateTotalPrice(entries: HistoryEntryRaw[]): number {
  let total = 0;
  for (const entry of entries) {
    const amountRaw = entry?.price?.amount ?? entry?.amount;
    const numericAmount = typeof amountRaw === 'number' ? amountRaw : Number(amountRaw);
    if (Number.isFinite(numericAmount)) {
      total += numericAmount;
    }
  }
  return total;
}

/**
 * Group sales by name + currency with time-based window tolerance.
 * 
 * Algorithm:
 * 1. Build groups by scanning forward within time windows
 * 2. For each ungrouped entry, collect all matching items within the time window
 * 3. Groups can skip over different items in between
 * 
 * Groups items with same name + currency regardless of individual price differences.
 * Calculates total price for the entire group.
 * 
 * @param entries - Array of history entries (should be sorted by time)
 * @returns Array of grouped entries
 */
export function groupHistoryEntries(entries: HistoryEntryRaw[]): GroupedHistoryEntry[] {
  if (!entries || entries.length === 0) {
    return [];
  }

  const grouped: GroupedHistoryEntry[] = [];
  const processed = new Set<number>(); // Track which indices have been grouped

  for (let i = 0; i < entries.length; i++) {
    // Skip if already in a group
    if (processed.has(i)) continue;

    const entry = entries[i];
    const key = getItemKey(entry);
    const timestamp = getTimestamp(entry);
    const currency = normalizeCurrency(entry?.price?.currency ?? entry?.currency ?? "");

    // Start a new group with this entry
    const groupEntries: HistoryEntryRaw[] = [entry];
    const groupIndices: number[] = [i];
    processed.add(i);

    // Look ahead for matching items within time window
    for (let j = i + 1; j < entries.length; j++) {
      if (processed.has(j)) continue;

      const nextEntry = entries[j];
      const nextKey = getItemKey(nextEntry);
      const nextTimestamp = getTimestamp(nextEntry);
      const timeDiff = Math.abs(nextTimestamp - timestamp);

      // If same item + currency and within time window, add to group
      if (nextKey === key && timeDiff <= GROUPING_TIME_WINDOW) {
        groupEntries.push(nextEntry);
        groupIndices.push(j);
        processed.add(j);
      }
    }

    // Create group entry
    const group: GroupedHistoryEntry = {
      entry,
      count: groupEntries.length,
      originalIndices: groupIndices,
      entries: groupEntries,
      isGrouped: groupEntries.length > 1,
      isExpanded: false,
      totalPrice: calculateTotalPrice(groupEntries),
      currency,
    };

    grouped.push(group);
  }

  return grouped;
}

/**
 * Get the original index from a grouped entry index
 * Used when clicking on a grouped row to show the first item's details
 */
export function getOriginalIndexFromGrouped(
  groupedEntries: GroupedHistoryEntry[],
  groupedIndex: number
): number {
  if (groupedIndex < 0 || groupedIndex >= groupedEntries.length) {
    return 0;
  }
  
  // Return the first original index in the group
  return groupedEntries[groupedIndex].originalIndices[0];
}

/**
 * Find which grouped index corresponds to an original index
 * Used to maintain selection when regrouping
 */
export function findGroupedIndexForOriginal(
  groupedEntries: GroupedHistoryEntry[],
  originalIndex: number
): number {
  for (let i = 0; i < groupedEntries.length; i++) {
    if (groupedEntries[i].originalIndices.includes(originalIndex)) {
      return i;
    }
  }
  return 0;
}

/**
 * Toggle expansion state of a grouped entry
 * Returns new array with updated expansion state
 */
export function toggleGroupExpansion(
  groupedEntries: GroupedHistoryEntry[],
  groupIndex: number
): GroupedHistoryEntry[] {
  const newGroups = [...groupedEntries];
  if (groupIndex >= 0 && groupIndex < newGroups.length) {
    newGroups[groupIndex] = {
      ...newGroups[groupIndex],
      isExpanded: !newGroups[groupIndex].isExpanded
    };
  }
  return newGroups;
}

/**
 * Expand grouped entries into flat list for display
 * If a group is expanded, show parent row followed by individual items
 */
export function expandGroupsForDisplay(groupedEntries: GroupedHistoryEntry[]): any[] {
  const result: any[] = [];
  
  for (let i = 0; i < groupedEntries.length; i++) {
    const group = groupedEntries[i];
    
    // Always show the parent group row
    result.push({
      ...group,
      parentGroupIndex: i,
      isSubItem: false,
    });
    
    // If expanded and grouped, also show individual items
    if (group.isExpanded && group.isGrouped) {
      group.entries.forEach((entry, subIndex) => {
        result.push({
          entry,
          count: 1,
          originalIndices: [group.originalIndices[subIndex]],
          entries: [entry],
          isGrouped: false,
          isExpanded: false,
          totalPrice: 0,
          currency: group.currency,
          parentGroupIndex: i,
          subIndex,
          isSubItem: true,
        });
      });
    }
  }
  
  return result;
}
