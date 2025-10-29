/**
 * PoB Integration - Public API
 */

export { decodePobCode, encodePobCode } from './decoder.js';
export { parsePobCode } from './parser.js';
export { extractUniqueGems, matchGemsToQuestSteps } from './gemMatcher.js';
export { findGemQuest, matchPobGemsToQuests, getGemsForQuest, formatGemQuestInfo, matchGemsForStep } from './gemQuestMatcher.js';
export { calculateTreeProgressionByAct, getRecommendedActForLevel } from './treeProgression.js';
export type {
  ParsedPobBuild,
  GemSocketGroup,
  GemInfo,
  GemRequirement,
  ActTreeProgression,
  StoredPobBuild,
  PassiveTreeNode,
  PassiveTreeData,
  TreeSpec
} from './types.js';
