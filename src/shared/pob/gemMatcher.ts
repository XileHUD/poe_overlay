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

      // Skip if already added
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
        rewardType: undefined as 'quest' | 'vendor' | undefined
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
  const matched = [...gems];

  console.log(`[GemMatcher] Matching ${gems.length} gems for class: ${characterClass}`);

  // Step 1: Group gems by quest using findGemQuest (to know which quest each gem comes from)
  const gemsByQuest = new Map<string, GemRequirement[]>();
  
  for (const gem of matched) {
    const questMatch = findGemQuest(gem.name, characterClass);
    if (questMatch) {
      const questKey = questMatch.questId;
      if (!gemsByQuest.has(questKey)) {
        gemsByQuest.set(questKey, []);
      }
      gemsByQuest.get(questKey)!.push(gem);
    } else {
      // Fallback for unmapped gems
      gem.act = 1;
      gem.quest = 'Unknown - Check vendor';
      gem.vendor = 'Various NPCs';
      gem.rewardType = 'vendor';
      gem.availableFrom = `${gem.name} - Check quest rewards or vendors`;
      console.warn(`[GemMatcher] NO MATCH: ${gem.name} for ${characterClass}`);
    }
  }

  // Step 2: For each quest, use getGemsForQuest to properly determine Take vs Buy
  for (const [questId, questGems] of gemsByQuest.entries()) {
    const properMatches = getGemsForQuest(questId, characterClass, questGems);
    
    // Update each gem with the correct rewardType and NPC from getGemsForQuest
    for (const gem of questGems) {
      const properMatch = properMatches.find(m => m.gemName.toLowerCase() === gem.name.toLowerCase());
      if (properMatch) {
        gem.act = parseInt(properMatch.questAct);
        gem.quest = properMatch.questName;
        gem.vendor = properMatch.npc; // Correct NPC from getGemsForQuest
        gem.rewardType = properMatch.rewardType; // Correct Take/Buy from getGemsForQuest
        gem.availableFrom = formatGemQuestInfo(properMatch);
        
        console.log(`[GemMatcher] ${gem.name} -> Act ${properMatch.questAct}, ${properMatch.questName}, ${properMatch.rewardType.toUpperCase()} from ${properMatch.npc}`);
      }
    }
  }

  const questCount = matched.filter(g => g.rewardType === 'quest').length;
  const vendorCount = matched.filter(g => g.rewardType === 'vendor').length;
  console.log(`[GemMatcher] Results: ${questCount} quest rewards (TAKE), ${vendorCount} vendor purchases (BUY)`);

  return matched;
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
