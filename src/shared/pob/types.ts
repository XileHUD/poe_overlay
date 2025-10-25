/**
 * Path of Building Integration - Type Definitions
 * 
 * Reference: https://github.com/PathOfBuildingCommunity/PathOfBuilding
 * Format: Base64(Zlib(XML))
 */

export interface ParsedPobBuild {
  className: string;
  ascendancyName: string;
  level: number;
  characterName: string;
  mainSocketGroup: number;
  // Multiple tree specs (Early Game, Act 5, End Game, etc.)
  treeSpecs: TreeSpec[];
  gems: GemSocketGroup[];
  skillSets?: SkillSet[];
  treeVersion: string;
}

export interface TreeSpec {
  title: string; // "Early Game", "Act 5", "End Game", etc.
  nodes: string; // Comma-separated node IDs
  url?: string; // Tree URL in PoB format
  allocatedNodes: number[];
  classId?: number;
  ascendClassId?: number;
  // Parsed URL data
  parsedUrl?: {
    version: number;
    classId: number;
    ascendancyId: number;
    nodes: string[];
    masteries: Record<string, string>;
  };
}

export interface GemSocketGroup {
  slot: string;
  enabled: boolean;
  includeInFullDps: boolean;
  gems: GemInfo[];
  label?: string; // Optional label for the socket group
}

export interface SkillSet {
  title: string;
  socketGroups: GemSocketGroup[];
}

export interface GemInfo {
  nameSpec: string;
  level: number;
  quality: number;
  enabled: boolean;
  skillId?: string;
}

export interface GemRequirement {
  name: string;
  level: number;
  quest?: string;
  act: number;
  availableFrom?: string; // Step ID
  vendor?: string; // NPC name
  isSupport: boolean;
  rewardType?: 'quest' | 'vendor'; // Whether it's a quest reward or vendor purchase
}

export interface QuestGemAssignment {
  gemId: string;
  gemName: string;
  questId: string;
  questName: string;
  questAct: string;
  rewardType: 'quest' | 'vendor';
  npc: string;
  isSupport: boolean;
}

export interface ActTreeProgression {
  actNumber: number;
  recommendedLevel: number;
  nodeIds: number[];
  totalPoints: number;
  newNodesFromPreviousAct: number[];
}

export interface StoredPobBuild {
  code: string;
  className: string;
  ascendancyName: string;
  characterName: string;
  level: number;
  treeSpecs: TreeSpec[];
  allocatedNodes: number[]; // Legacy field for backwards compatibility
  treeProgression: ActTreeProgression[];
  gems: GemRequirement[]; // Flat list of unique gems with quest info
  socketGroups?: GemSocketGroup[]; // Socket groups with quest info enriched
  skillSets?: SkillSet[];
  questGemAssignments?: Record<string, QuestGemAssignment[]>;
  treeVersion: string;
  importedAt: number;
}

export interface PassiveTreeNode {
  id: number;
  name: string;
  icon: string;
  stats: string[];
  isNotable: boolean;
  isKeystone: boolean;
  isMastery: boolean;
  ascendancyName?: string;
  classStartIndex?: number;
  group: number;
  orbit: number;
  orbitIndex: number;
  out: number[];
  in: number[];
}

export interface PassiveTreeData {
  nodes: Record<number, PassiveTreeNode>;
  classes: Record<string, any>;
  groups: Record<number, any>;
  imageRoot: string;
  version: string;
}
