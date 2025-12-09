/**
 * Tree Progression Calculator
 * 
 * Splits PoB passive tree allocations into act-by-act progression
 */

import { ActTreeProgression } from './types.js';

// Quest passive point rewards per act (PoE1)
const QUEST_REWARDS_POE1: Record<number, number> = {
  1: 2,  // Dweller of the Deep + Marooned Mariner
  2: 2,  // Way Forward + Apex of Sacrifice
  3: 2,  // Fixture of Fate + Sever the Right Hand
  4: 1,  // Breaking the Seal (if not done in Act 3)
  5: 2,  // In Service to Science + Kitava's Torments
  6: 1,  // Fallen from Grace
  7: 2,  // Queen of Despair + Kishara's Star
  8: 1,  // Reflection of Terror
  9: 1,  // Queen of the Sands
  10: 1  // Vilenta's Vengeance
};

// Recommended level ranges per act
const ACT_LEVEL_RANGES = [
  { act: 1, minLevel: 1, maxLevel: 12 },
  { act: 2, minLevel: 12, maxLevel: 20 },
  { act: 3, minLevel: 20, maxLevel: 30 },
  { act: 4, minLevel: 30, maxLevel: 40 },
  { act: 5, minLevel: 40, maxLevel: 50 },
  { act: 6, minLevel: 50, maxLevel: 60 },
  { act: 7, minLevel: 60, maxLevel: 68 },
  { act: 8, minLevel: 68, maxLevel: 75 },
  { act: 9, minLevel: 75, maxLevel: 80 },
  { act: 10, minLevel: 80, maxLevel: 100 }
];

function getQuestPointsUpToAct(actNumber: number): number {
  let total = 0;
  for (let act = 1; act <= actNumber; act++) {
    total += QUEST_REWARDS_POE1[act] || 0;
  }
  return total;
}

export function calculateTreeProgressionByAct(
  allNodes: number[],
  buildLevel: number
): ActTreeProgression[] {
  const progression: ActTreeProgression[] = [];

  for (const range of ACT_LEVEL_RANGES) {
    // Calculate available points at end of this act
    const levelAtActEnd = Math.min(range.maxLevel, buildLevel);
    const pointsFromLevels = levelAtActEnd - 1; // Level 2 = first point
    const pointsFromQuests = getQuestPointsUpToAct(range.act);
    const totalAvailable = pointsFromLevels + pointsFromQuests;

    // Take first N nodes from PoB (assumes they're in allocation order)
    const nodesForThisAct = allNodes.slice(0, Math.min(totalAvailable, allNodes.length));

    // Find new nodes added in this act
    const previousActNodes = range.act > 1 
      ? progression[range.act - 2].nodeIds 
      : [];
    const newNodes = nodesForThisAct.filter(n => !previousActNodes.includes(n));

    progression.push({
      actNumber: range.act,
      recommendedLevel: range.maxLevel,
      nodeIds: nodesForThisAct,
      totalPoints: totalAvailable,
      newNodesFromPreviousAct: newNodes
    });

    // Stop if we've allocated all nodes from the build
    if (totalAvailable >= allNodes.length) {
      break;
    }
  }

  return progression;
}

export function getRecommendedActForLevel(level: number): number {
  for (const range of ACT_LEVEL_RANGES) {
    if (level <= range.maxLevel) {
      return range.act;
    }
  }
  return 10; // Maps/endgame
}

/**
 * Generate tree progression from Maxroll history (respects allocation order).
 * This ensures that when navigating with arrows, nodes are added/removed in the correct order.
 */
export function calculateTreeProgressionFromHistory(
  history: any[],
  buildLevel: number
): ActTreeProgression[] {
  if (!Array.isArray(history) || history.length === 0) {
    return [];
  }

  // Replay history to get allocation order
  const allocationOrder: number[] = [];
  const allocated = new Set<number>();

  for (const entry of history) {
    if (typeof entry === 'number') {
      if (!allocated.has(entry)) {
        allocated.add(entry);
        allocationOrder.push(entry);
      }
    } else if (entry && typeof entry === 'object') {
      if (Array.isArray(entry.add)) {
        entry.add.forEach((id: any) => {
          const nodeId = typeof id === 'number' ? id : (id && typeof id === 'object' && typeof id.id === 'number' ? id.id : null);
          if (nodeId !== null && !allocated.has(nodeId)) {
            allocated.add(nodeId);
            allocationOrder.push(nodeId);
          }
        });
      }
      if (Array.isArray(entry.remove)) {
        entry.remove.forEach((id: any) => {
          if (typeof id === 'number' && allocated.has(id)) {
            allocated.delete(id);
            // Remove from the LAST occurrence to maintain allocation order
            const idx = allocationOrder.lastIndexOf(id);
            if (idx !== -1) {
              allocationOrder.splice(idx, 1);
            }
          }
        });
      }
      if (typeof entry.id === 'number' && entry.set !== undefined) {
        if (!allocated.has(entry.id)) {
          allocated.add(entry.id);
          allocationOrder.push(entry.id);
        }
      }
    }
  }

  // Now use allocation order instead of arbitrary node order
  const progression: ActTreeProgression[] = [];

  for (const range of ACT_LEVEL_RANGES) {
    const levelAtActEnd = Math.min(range.maxLevel, buildLevel);
    const pointsFromLevels = levelAtActEnd - 1;
    const pointsFromQuests = getQuestPointsUpToAct(range.act);
    const totalAvailable = pointsFromLevels + pointsFromQuests;

    // Take first N nodes from ALLOCATION ORDER (not arbitrary sorted order)
    const nodesForThisAct = allocationOrder.slice(0, Math.min(totalAvailable, allocationOrder.length));

    const previousActNodes = range.act > 1 
      ? progression[range.act - 2].nodeIds 
      : [];
    const newNodes = nodesForThisAct.filter(n => !previousActNodes.includes(n));

    progression.push({
      actNumber: range.act,
      recommendedLevel: range.maxLevel,
      nodeIds: nodesForThisAct,
      totalPoints: totalAvailable,
      newNodesFromPreviousAct: newNodes
    });

    if (totalAvailable >= allocationOrder.length) {
      break;
    }
  }

  return progression;
}
