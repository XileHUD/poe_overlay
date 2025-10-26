/**
 * Passive Tree Template Loader
 * 
 * Loads processed tree JSON and generates SVG templates + node lookups.
 * This runs at build time (imported by main process).
 * Supports both PoE1 and PoE2 trees.
 */

import { SkillTreeData, NodeLookup, buildTemplate } from './treeSvg';
import tree326 from '../../data/leveling-data/trees/3_26_processed.json';
import treePoe2 from '../../data/leveling-data/trees/poe2_processed.json';

// Type assertion for imported JSON
const tree: SkillTreeData = tree326 as unknown as SkillTreeData;
const treePoe2Data: SkillTreeData = treePoe2 as unknown as SkillTreeData;

// Build node lookups (flatten all graphs)
export const nodeLookup: NodeLookup = Object.assign(
  {},
  ...tree.graphs.map((graph) => graph.nodes)
);

export const nodeLookupPoe2: NodeLookup = Object.assign(
  {},
  ...treePoe2Data.graphs.map((graph) => graph.nodes)
);

// Generate SVG templates for PoE1
export const { svg, viewBox, styleTemplate } = buildTemplate(tree, nodeLookup);

// Generate SVG templates for PoE2
export const poe2Template = buildTemplate(treePoe2Data, nodeLookupPoe2);

// Export tree data for reference
export const skillTree = tree;
export const skillTreePoe2 = treePoe2Data;

console.log(`[Tree Loader] Loaded PoE1 3_26 tree: ${Object.keys(nodeLookup).length} nodes`);
console.log(`[Tree Loader] Loaded PoE2 tree: ${Object.keys(nodeLookupPoe2).length} nodes`);
