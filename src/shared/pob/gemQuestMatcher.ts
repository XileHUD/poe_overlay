/**
 * Gem-Quest Matcher
 * 
 * Cross-matches PoB gems with our leveling guide using quest data.
 * This enriches our leveling steps with specific gem information from the PoB build.
 */

import questsData from '../../data/leveling-data/quests.json';
import gemsData from '../../data/leveling-data/gems.json';
import { GemRequirement } from './types';

interface QuestGemReward {
  classes: string[];
}

interface QuestRewardOffer {
  quest_npc: string;
  quest: Record<string, QuestGemReward>;
  vendor: Record<string, { classes: string[]; npc: string }>;
}

interface Quest {
  id: string;
  name: string;
  act: string;
  reward_offers: Record<string, QuestRewardOffer>;
}

interface GemData {
  id: string;
  name: string;
  primary_attribute: string;
  required_level: number;
  is_support: boolean;
}

type QuestsData = Record<string, Quest>;
type GemsData = Record<string, GemData>;

const quests = questsData as QuestsData;
const gems = gemsData as GemsData;

export interface GemQuestMatch {
  gemId: string;
  gemName: string;
  questId: string;
  questName: string;
  questAct: string;
  rewardType: 'quest' | 'vendor';
  npc: string;
  isSupport: boolean;
}

/**
 * Finds which quest gives a specific gem as a QUEST REWARD (Take)
 * Following leveling data pattern: check quest rewards first
 */
export function findQuestRewardGem(
  gemName: string,
  characterClass: string
): GemQuestMatch | null {
  // Find gem by name (case-insensitive)
  const gemEntry = Object.entries(gems).find(
    ([_, gemData]) => gemData.name.toLowerCase() === gemName.toLowerCase()
  );

  if (!gemEntry) {
    return null;
  }

  const [gemId, gemData] = gemEntry;

  // Search through all quests for this gem as a QUEST REWARD
  for (const quest of Object.values(quests)) {
    for (const [rewardOfferId, rewardOffer] of Object.entries(quest.reward_offers)) {
      const questReward = rewardOffer.quest[gemId];
      if (questReward) {
        const validClass =
          questReward.classes.length === 0 ||
          questReward.classes.includes(characterClass);

        if (validClass) {
          return {
            gemId,
            gemName: gemData.name,
            questId: quest.id,
            questName: quest.name,
            questAct: quest.act,
            rewardType: 'quest',
            npc: rewardOffer.quest_npc,
            isSupport: gemData.is_support,
          };
        }
      }
    }
  }

  return null;
}

/**
 * Finds which quest gives a specific gem as a VENDOR REWARD (Buy)
 * Following leveling data pattern: check vendor rewards separately
 */
export function findVendorRewardGem(
  gemName: string,
  characterClass: string
): GemQuestMatch | null {
  // Find gem by name (case-insensitive)
  const gemEntry = Object.entries(gems).find(
    ([_, gemData]) => gemData.name.toLowerCase() === gemName.toLowerCase()
  );

  if (!gemEntry) {
    return null;
  }

  const [gemId, gemData] = gemEntry;

  // Search through all quests for this gem as a VENDOR REWARD
  for (const quest of Object.values(quests)) {
    for (const [rewardOfferId, rewardOffer] of Object.entries(quest.reward_offers)) {
      const vendorReward = rewardOffer.vendor[gemId];
      if (vendorReward) {
        const validClass =
          vendorReward.classes.length === 0 ||
          vendorReward.classes.includes(characterClass);

        if (validClass) {
          return {
            gemId,
            gemName: gemData.name,
            questId: quest.id,
            questName: quest.name,
            questAct: quest.act,
            rewardType: 'vendor',
            npc: vendorReward.npc,
            isSupport: gemData.is_support,
          };
        }
      }
    }
  }

  return null;
}

/**
 * Finds which quest/NPC gives a specific gem for a given character class
 * CRITICAL: Checks quest rewards FIRST, only returns vendor if NOT available as quest
 * This matches our priority system
 */
export function findGemQuest(
  gemName: string,
  characterClass: string
): GemQuestMatch | null {
  // First, try to find as quest reward (Take)
  const questReward = findQuestRewardGem(gemName, characterClass);
  if (questReward) {
    return questReward;
  }

  // If not available as quest reward, try vendor (Buy)
  const vendorReward = findVendorRewardGem(gemName, characterClass);
  if (vendorReward) {
    return vendorReward;
  }

  console.warn(`[GemQuestMatcher] No quest found for gem: ${gemName} (${characterClass})`);
  return null;
}

/**
 * Matches all PoB gems with quest rewards for the character class
 */
export function matchPobGemsToQuests(
  pobGems: GemRequirement[],
  characterClass: string
): Map<string, GemQuestMatch[]> {
  const questGemMap = new Map<string, GemQuestMatch[]>();

  for (const pobGem of pobGems) {
    const match = findGemQuest(pobGem.name, characterClass);
    if (match) {
      const questKey = `${match.questAct}_${match.questId}`;
      const existing = questGemMap.get(questKey) || [];
      existing.push(match);
      questGemMap.set(questKey, existing);
    }
  }

  return questGemMap;
}

/**
 * Gets gems available at a specific quest for a character class
 * Following our buildGemSteps pattern:
 * 1. Find FIRST quest reward that matches (you can only pick ONE gem per quest!)
 * 2. Then find vendor rewards, EXCLUDING the gem already obtained as quest reward
 */
export function getGemsForQuest(
  questId: string,
  characterClass: string,
  pobGems: GemRequirement[]
): GemQuestMatch[] {
  const quest = quests[questId];
  if (!quest) return [];

  const matches: GemQuestMatch[] = [];
  let questGemId: string | null = null; // Track THE gem obtained as quest reward (only ONE!)

  // FIRST PASS: Find FIRST quest reward (Take) - you can only pick ONE!
  for (const pobGem of pobGems) {
    const gemEntry = Object.entries(gems).find(
      ([_, gemData]) => gemData.name.toLowerCase() === pobGem.name.toLowerCase()
    );

    if (!gemEntry) continue;

    const [gemId, gemData] = gemEntry;

    // Check all reward offers for this quest
    for (const [rewardOfferId, rewardOffer] of Object.entries(quest.reward_offers)) {
      const questReward = rewardOffer.quest[gemId];
      if (questReward) {
        const validClass =
          questReward.classes.length === 0 ||
          questReward.classes.includes(characterClass);

        if (validClass) {
          matches.push({
            gemId,
            gemName: gemData.name,
            questId: quest.id,
            questName: quest.name,
            questAct: quest.act,
            rewardType: 'quest',
            npc: rewardOffer.quest_npc,
            isSupport: gemData.is_support,
          });
          questGemId = gemId; // Mark as obtained via quest
          break; // Found quest reward, STOP - you can only pick ONE!
        }
      }
    }

    // If we found a quest reward, stop looking
    if (questGemId) break;
  }

  // SECOND PASS: Find vendor rewards (Buy), EXCLUDING quest reward
  for (const pobGem of pobGems) {
    const gemEntry = Object.entries(gems).find(
      ([_, gemData]) => gemData.name.toLowerCase() === pobGem.name.toLowerCase()
    );

    if (!gemEntry) continue;

    const [gemId, gemData] = gemEntry;

    // SKIP if this is the gem we got as quest reward
    if (questGemId && gemId === questGemId) continue;

    // Check all reward offers for this quest
    for (const [rewardOfferId, rewardOffer] of Object.entries(quest.reward_offers)) {
      const vendorReward = rewardOffer.vendor[gemId];
      if (vendorReward) {
        const validClass =
          vendorReward.classes.length === 0 ||
          vendorReward.classes.includes(characterClass);

        if (validClass) {
          matches.push({
            gemId,
            gemName: gemData.name,
            questId: quest.id,
            questName: quest.name,
            questAct: quest.act,
            rewardType: 'vendor',
            npc: vendorReward.npc,
            isSupport: gemData.is_support,
          });
          break; // Found vendor reward, move to next gem
        }
      }
    }
  }

  return matches;
}

/**
 * Formats gem quest info for display
 */
export function formatGemQuestInfo(match: GemQuestMatch): string {
  const type = match.rewardType === 'quest' ? 'Quest' : 'Vendor';
  const supportTag = match.isSupport ? ' (Support)' : '';
  return `${match.gemName}${supportTag} - ${type}: ${match.questName} (${match.npc}, Act ${match.questAct})`;
}

/**
 * Matches PoB gems to a specific quest step, filtering by NPC and quest
 * This is called at render time for each step to ensure proper gem-to-step matching
 */
export function matchGemsForStep(
  pobGems: GemRequirement[],
  questId: string,
  npcName: string | null,
  characterClass: string
): { takeGems: GemQuestMatch[], buyGems: GemQuestMatch[] } {
  const quest = quests[questId];
  if (!quest) {
    return { takeGems: [], buyGems: [] };
  }

  const takeGems: GemQuestMatch[] = [];
  const buyGems: GemQuestMatch[] = [];
  const takenGemIds = new Set<string>();
  let hasSelectedQuestReward = false; // Track if we've already selected a quest reward (only ONE per quest!)

  // Normalize NPC name for comparison
  const normalizedNpcFilter = npcName?.toLowerCase().trim();

  // Process each PoB gem
  for (const pobGem of pobGems) {
    // Normalize gem name - add " Support" if it's a support gem and doesn't have it
    const gemNameToMatch = pobGem.isSupport && !pobGem.name.toLowerCase().includes('support')
      ? pobGem.name + ' Support'
      : pobGem.name;

    // Find gem in database
    const gemEntry = Object.entries(gems).find(
      ([_, gemData]) => gemData.name.toLowerCase() === gemNameToMatch.toLowerCase()
    );

    if (!gemEntry) {
      continue;
    }

    const [gemId, gemData] = gemEntry;

    // FIRST PASS: Check ALL reward offers for quest rewards (TAKE)
    // This ensures we prioritize quest rewards over vendor rewards, even across multiple NPCs
    let foundAsQuestReward = false;
    
    if (!takenGemIds.has(gemId)) {
      for (const [rewardOfferId, rewardOffer] of Object.entries(quest.reward_offers)) {
        const offerNpc = rewardOffer.quest_npc.toLowerCase().trim();
        
        // Skip if we have an NPC filter and this offer doesn't match
        if (normalizedNpcFilter && offerNpc !== normalizedNpcFilter) {
          continue;
        }

        const questReward = rewardOffer.quest[gemId];
        if (questReward) {
          const validClass =
            questReward.classes.length === 0 ||
            questReward.classes.includes(characterClass);

          if (validClass) {
            // Only actually add as TAKE if we haven't already selected a quest reward
            if (!hasSelectedQuestReward) {
              takeGems.push({
                gemId,
                gemName: gemData.name,
                questId: quest.id,
                questName: quest.name,
                questAct: quest.act,
                rewardType: 'quest',
                npc: rewardOffer.quest_npc,
                isSupport: gemData.is_support,
              });
              takenGemIds.add(gemId); // Mark as taken so we don't show it as vendor too
              hasSelectedQuestReward = true;
              foundAsQuestReward = true;
            }
            break; // Found quest reward, move to next gem
          }
        }
      }
    }

    // SECOND PASS: Check vendor rewards (BUY)
    // Show as BUY if: not taken as quest reward AND not already taken
    if (!foundAsQuestReward && !takenGemIds.has(gemId)) {
      for (const [rewardOfferId, rewardOffer] of Object.entries(quest.reward_offers)) {
        const offerNpc = rewardOffer.quest_npc.toLowerCase().trim();
        
        // Skip if we have an NPC filter and this offer doesn't match
        if (normalizedNpcFilter && offerNpc !== normalizedNpcFilter) {
          continue;
        }

        const vendorReward = rewardOffer.vendor[gemId];
        if (vendorReward) {
          const validClass =
            vendorReward.classes.length === 0 ||
            vendorReward.classes.includes(characterClass);

          if (validClass) {
            buyGems.push({
              gemId,
              gemName: gemData.name,
              questId: quest.id,
              questName: quest.name,
              questAct: quest.act,
              rewardType: 'vendor',
              npc: vendorReward.npc,
              isSupport: gemData.is_support,
            });
            break; // Found vendor reward, move to next gem
          }
        }
      }
    }
  }

  return { takeGems, buyGems };
}
