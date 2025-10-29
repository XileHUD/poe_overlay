/**
 * Gem Matcher - Match PoB gems to quest rewards
 * 
 * Maps gems from PoB build to leveling quest steps using quest data
 */

import { GemSocketGroup, GemRequirement } from './types.js';
import { findGemQuest, formatGemQuestInfo, getGemsForQuest } from './gemQuestMatcher.js';
import questsData from '../../data/leveling-data/quests.json';

// Gem metadata (name normalization, support flag, etc.)
interface GemMetadata {
  cleanName: string;
  isSupport: boolean;
  aliases: string[];
}

// Support gem keywords
const SUPPORT_KEYWORDS = [
  'Support',
  'Awakened',
  'Empower',
  'Enlighten',
  'Enhance'
];

function normalizeGemName(nameSpec: string): GemMetadata {
  // Remove quality/corruption prefixes
  let cleanName = nameSpec
    .replace(/^(Anomalous|Divergent|Phantasmal)\s+/i, '')
    .trim();

  // Check if support gem
  const isSupport = SUPPORT_KEYWORDS.some(keyword => 
    cleanName.includes(keyword)
  );

  return {
    cleanName,
    isSupport,
    aliases: [cleanName.toLowerCase()]
  };
}

export function extractUniqueGems(socketGroups: GemSocketGroup[]): GemRequirement[] {
  const gemMap = new Map<string, GemRequirement>();

  for (const group of socketGroups) {
    if (!group.enabled) {
      continue;
    }

    for (const gem of group.gems) {
      if (!gem.enabled) {
        continue;
      }

      const metadata = normalizeGemName(gem.nameSpec);
      const key = metadata.cleanName.toLowerCase();

      // Skip if already added - we only want the FIRST occurrence (earliest skillSet)
      if (gemMap.has(key)) {
        continue;
      }

      gemMap.set(key, {
        name: metadata.cleanName,
        level: gem.level,
        quest: undefined,
        act: 0,
        availableFrom: undefined,
        vendor: undefined,
        isSupport: metadata.isSupport,
        rewardType: undefined as 'quest' | 'vendor' | undefined,
        skillSetTitle: gem.skillSetTitle // Preserve skillSet title from POB parser
      });
    }
  }

  return Array.from(gemMap.values());
}

export function matchGemsToQuestSteps(
  gems: GemRequirement[],
  levelingData: any,
  characterClass: string
): GemRequirement[] {
  // Simply return the gems without pre-matching to quests
  // Matching will happen at render time per-step to properly handle multiple reward offers
  return gems;
}

function extractVendorName(description: string): string {
  const vendors = ['Tarkleigh', 'Nessa', 'Bestel', 'Siosa', 'Lilly', 'Yeena', 'Helena', 'Petarus', 'Vanja'];
  
  for (const vendor of vendors) {
    if (description.includes(vendor)) {
      return vendor;
    }
  }
  
  return 'Vendor';
}
