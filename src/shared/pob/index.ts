/**
 * PoB Integration - Public API
 */

export { decodePobCode, encodePobCode } from './decoder.js';
export { parsePobCode } from './parser.js';
export { extractUniqueGems, matchGemsToQuestSteps } from './gemMatcher.js';
export { findGemQuest, matchPobGemsToQuests, getGemsForQuest, formatGemQuestInfo, matchGemsForStep } from './gemQuestMatcher.js';
export { calculateTreeProgressionByAct, calculateTreeProgressionFromHistory, getRecommendedActForLevel } from './treeProgression.js';
export { nodeLookup326, nodeLookup327, nodeLookupPoe2 } from './treeLoader.js';
export {
  extractWeaponType,
  getCategoryForWeaponType,
  processWeaponBases,
  getHighestAvailableBase
} from './weaponBaseProcessor.js';
export {
  createEmptyBuildsList,
  addBuild,
  deleteBuild,
  renameBuild,
  setActiveBuild,
  getActiveBuild,
  getBuildById,
  getAllBuilds,
  buildNameExists,
  migrateLegacyBuild
} from './buildManager.js';
export type {
  ParsedPobBuild,
  GemSocketGroup,
  GemInfo,
  GemRequirement,
  WeaponBaseProgression,
  ActTreeProgression,
  StoredPobBuild,
  PassiveTreeNode,
  PassiveTreeData,
  TreeSpec,
  PobBuildEntry,
  PobBuildsList
} from './types.js';

