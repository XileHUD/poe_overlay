/**
 * Passive Tree Template Loader
 * 
 * Loads processed tree JSON and generates SVG templates + node lookups.
 * This runs at build time (imported by main process).
 * Supports both PoE1 (3.26, 3.27) and PoE2 trees.
 */

import { SkillTreeData, NodeLookup, buildTemplate } from './treeSvg';
import tree326 from '../../data/leveling-data/trees/3_26_processed.json';
import tree327 from '../../data/leveling-data/trees/3_27_processed.json';
import treePoe2 from '../../data/leveling-data/trees/poe2_processed.json';

// Type assertions for imported JSON
const tree326Data: SkillTreeData = tree326 as unknown as SkillTreeData;
const tree327Data: SkillTreeData = tree327 as unknown as SkillTreeData;
const treePoe2Data: SkillTreeData = treePoe2 as unknown as SkillTreeData;

// Build node lookups for 3.26 (flatten all graphs)
export const nodeLookup326: NodeLookup = Object.assign(
  {},
  ...tree326Data.graphs.map((graph) => graph.nodes)
);

// Build node lookups for 3.27 (flatten all graphs)
export const nodeLookup327: NodeLookup = Object.assign(
  {},
  ...tree327Data.graphs.map((graph) => graph.nodes)
);

// Build node lookups for PoE2
export const nodeLookupPoe2: NodeLookup = Object.assign(
  {},
  ...treePoe2Data.graphs.map((graph) => graph.nodes)
);

// Generate SVG templates for PoE1 3.26
export const template326 = buildTemplate(tree326Data, nodeLookup326);

// Generate SVG templates for PoE1 3.27
export const template327 = buildTemplate(tree327Data, nodeLookup327);

// Generate SVG templates for PoE2
export const poe2Template = buildTemplate(treePoe2Data, nodeLookupPoe2);

// Export tree data for reference
export const skillTree326 = tree326Data;
export const skillTree327 = tree327Data;
export const skillTreePoe2 = treePoe2Data;

// Legacy exports (default to 3.26 for backward compatibility)
export const nodeLookup = nodeLookup326;
export const { svg, viewBox, styleTemplate } = template326;
export const skillTree = tree326Data;

console.log(`[Tree Loader] Loaded PoE1 3.26 tree: ${Object.keys(nodeLookup326).length} nodes`);
console.log(`[Tree Loader] Loaded PoE1 3.27 tree: ${Object.keys(nodeLookup327).length} nodes`);
console.log(`[Tree Loader] Loaded PoE2 tree: ${Object.keys(nodeLookupPoe2).length} nodes`);
