/**
 * Passive Tree Template Loader
 * 
 * Loads processed tree JSON and generates SVG templates + node lookups.
 * This runs at build time (imported by main process).
 */

import { SkillTreeData, NodeLookup, buildTemplate } from './treeSvg';
import tree326 from '../../data/leveling-data/trees/3_26_processed.json';

// Type assertion for imported JSON
const tree: SkillTreeData = tree326 as unknown as SkillTreeData;

// Build node lookup (flatten all graphs)
export const nodeLookup: NodeLookup = Object.assign(
  {},
  ...tree.graphs.map((graph) => graph.nodes)
);

// Generate SVG template
export const { svg, viewBox, styleTemplate } = buildTemplate(tree, nodeLookup);

// Export tree data for reference
export const skillTree = tree;

console.log(`[Tree Loader] Loaded 3_26 tree: ${Object.keys(nodeLookup).length} nodes`);
