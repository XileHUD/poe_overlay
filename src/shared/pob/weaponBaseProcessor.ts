/**
 * Weapon Base Processor
 * 
 * Extracts weapon type from imported builds and pre-processes matching weapon bases
 * from the PoE2 bases data, sorted by required level (ilvl).
 */

import type { ItemSet, WeaponBaseProgression } from './types.js';

interface BaseItem {
  name: string;
  requiredLevel?: number;
  category?: string;
}

interface BaseGroups {
  [category: string]: BaseItem[];
}

/**
 * Weapon type mapping from base names to category keys
 */
const WEAPON_TYPE_PATTERNS: Record<string, { pattern: RegExp; category: string }> = {
  'Bow': { pattern: /\bbow\b/i, category: 'Bows' },
  'Crossbow': { pattern: /crossbow/i, category: 'Crossbows' },
  'Wand': { pattern: /wand/i, category: 'Wands' },
  'Staff': { pattern: /staff/i, category: 'Staves' },
  'Quarterstaff': { pattern: /quarterstaff/i, category: 'Quarterstaves' },
  'Sword': { pattern: /sword/i, category: 'One_Hand_Swords' },
  'Two Hand Sword': { pattern: /two.hand.*sword/i, category: 'Two_Hand_Swords' },
  'Axe': { pattern: /axe/i, category: 'One_Hand_Axes' },
  'Two Hand Axe': { pattern: /two.hand.*axe/i, category: 'Two_Hand_Axes' },
  'Mace': { pattern: /mace/i, category: 'One_Hand_Maces' },
  'Two Hand Mace': { pattern: /two.hand.*mace/i, category: 'Two_Hand_Maces' },
  'Flail': { pattern: /flail/i, category: 'Flails' },
  'Spear': { pattern: /spear/i, category: 'Spears' },
  'Dagger': { pattern: /dagger/i, category: 'Daggers' },
  'Claw': { pattern: /claw/i, category: 'Claws' },
  'Sceptre': { pattern: /sceptre/i, category: 'Sceptres' },
};

/**
 * Extract the weapon type from itemSets
 */
export function extractWeaponType(itemSets?: ItemSet[]): string | null {
  if (!itemSets || itemSets.length === 0) return null;

  // Check first item set for main weapon
  const firstSet = itemSets[0];
  const weapon = firstSet.items['Weapon'] || firstSet.items['Weapon 1'];
  
  if (!weapon) return null;

  const weaponName = weapon.baseName || weapon.name || '';
  
  // Match against weapon type patterns (order matters - check two-hand before one-hand)
  const twoHandPatterns = ['Two Hand Sword', 'Two Hand Axe', 'Two Hand Mace'];
  for (const type of twoHandPatterns) {
    if (WEAPON_TYPE_PATTERNS[type].pattern.test(weaponName)) {
      return type;
    }
  }
  
  for (const [type, config] of Object.entries(WEAPON_TYPE_PATTERNS)) {
    if (twoHandPatterns.includes(type)) continue; // Already checked
    if (config.pattern.test(weaponName)) {
      return type;
    }
  }

  return null;
}

/**
 * Get the category key for a weapon type
 */
export function getCategoryForWeaponType(weaponType: string): string | null {
  const config = WEAPON_TYPE_PATTERNS[weaponType];
  return config?.category || null;
}

/**
 * Process weapon bases for the detected weapon type
 */
export async function processWeaponBases(
  weaponType: string,
  basesData: BaseGroups
): Promise<WeaponBaseProgression | null> {
  const category = getCategoryForWeaponType(weaponType);
  if (!category) return null;

  const categoryBases = basesData[category];
  if (!categoryBases || categoryBases.length === 0) return null;

  // Extract and sort bases by required level - only include bases WITH requiredLevel
  const bases = categoryBases
    .filter(base => base.requiredLevel !== undefined && base.requiredLevel !== null && base.requiredLevel > 0)
    .map(base => ({
      name: base.name,
      requiredLevel: base.requiredLevel!,
    }))
    .sort((a, b) => a.requiredLevel - b.requiredLevel);

  if (bases.length === 0) return null;

  return {
    weaponType,
    category,
    bases,
  };
}

/**
 * Get the highest available base for a given character level
 */
export function getHighestAvailableBase(
  progression: WeaponBaseProgression | undefined,
  characterLevel: number
): { current: { name: string; requiredLevel: number } | null; next: { name: string; requiredLevel: number } | null } {
  if (!progression || !progression.bases || progression.bases.length === 0) {
    return { current: null, next: null };
  }

  // Find the highest base where requiredLevel <= characterLevel
  let currentBase = null;
  let nextBase = null;

  for (let i = 0; i < progression.bases.length; i++) {
    const base = progression.bases[i];
    
    if (base.requiredLevel <= characterLevel) {
      currentBase = base;
    } else {
      // This is the next upgrade (first base above current level)
      nextBase = base;
      break;
    }
  }

  return { current: currentBase, next: nextBase };
}
