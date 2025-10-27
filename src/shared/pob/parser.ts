/**
 * Path of Building XML Parser
 * 
 * Parses decoded PoB XML to extract build information
 */

import { DOMParser } from '@xmldom/xmldom';
import { ParsedPobBuild, TreeSpec, GemSocketGroup, GemInfo, SkillSet } from './types';
import { parseTreeUrl } from './treeParser';
import { decodePobCode } from './decoder.js';
import { nodeLookup, nodeLookupPoe2 } from './treeLoader';  // Import both lookups

export async function parsePobCode(code: string, gameVersion: 'poe1' | 'poe2' = 'poe1'): Promise<ParsedPobBuild | null> {
  try {
    // Use the correct node lookup based on game version
    const lookup = gameVersion === 'poe2' ? nodeLookupPoe2 : nodeLookup;
    
    // Decode Base64 + Zlib (now handles pobb.in URLs)
    const xmlString = await decodePobCode(code);
    if (!xmlString) {
      return null;
    }

    // Parse XML
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');

    // Extract build info
    const build = doc.getElementsByTagName('Build')[0];
    if (!build) {
      console.error('[PoB Parser] No <Build> element found');
      return null;
    }

    const className = build.getAttribute('className') || '';
    const ascendancyName = build.getAttribute('ascendClassName') || '';
    const level = parseInt(build.getAttribute('level') || '1', 10);
    const mainSocketGroup = parseInt(build.getAttribute('mainSocketGroup') || '1', 10);

    // Extract character name from PathOfBuilding tag
    const pobRoot = doc.getElementsByTagName('PathOfBuilding')[0];
    const characterName = pobRoot?.getAttribute('characterName') || '';

    // Extract ALL passive tree specs (Early Game, Act 5, End Game, etc.)
    const specElements = doc.getElementsByTagName('Spec');
    const treeSpecs: TreeSpec[] = [];
    let treeVersion = '3_25';
    
    for (let i = 0; i < specElements.length; i++) {
      const spec = specElements[i];
      const title = spec.getAttribute('title') || `Tree ${i + 1}`;
      const nodes = spec.getAttribute('nodes') || '';
      const allocatedNodes = nodes
        .split(',')
        .map(n => parseInt(n, 10))
        .filter(n => !isNaN(n));
      
      // Get URL if present
      const urlElement = spec.getElementsByTagName('URL')[0];
      const url = urlElement?.textContent?.trim();
      
      // Parse tree URL to extract version, class, nodes
      let parsedUrl;
      if (url) {
        try {
          parsedUrl = parseTreeUrl(url);
          // Filter nodes to only include ones that exist in the tree (like exile-leveling does)
          parsedUrl.nodes = parsedUrl.nodes.filter(nodeId => lookup[nodeId] !== undefined);
          console.log(`[PoB Parser] Parsed tree "${title}": ${parsedUrl.nodes.length} valid nodes (filtered from tree)`);
        } catch (error) {
          console.error(`[PoB Parser] Failed to parse tree URL for "${title}":`, error);
        }
      }
      
      treeSpecs.push({
        title,
        nodes,
        url,
        allocatedNodes,
        classId: parseInt(spec.getAttribute('classId') || '0', 10),
        ascendClassId: parseInt(spec.getAttribute('ascendClassId') || '0', 10),
        parsedUrl
      });
      
      // Use tree version from first spec
      if (i === 0) {
        treeVersion = spec.getAttribute('treeVersion') || '3_25';
      }
    }

    if (treeSpecs.length === 0) {
      console.error('[PoB Parser] No <Spec> elements found');
      return null;
    }

    // Extract gem skill sets (per-act presets)
    const skillSets = extractSkillSets(doc);

    // Use the first skill set's socket groups as the default gem list (fallback to legacy <Skills>)
    const gems = skillSets.length > 0
      ? skillSets[0].socketGroups
      : extractSocketGroups(doc.getElementsByTagName('Skills')[0] || null);

    console.log(`[PoB Parser] Found ${treeSpecs.length} tree specs:`, treeSpecs.map(s => s.title));

    return {
      className,
      ascendancyName,
      level,
      characterName,
      mainSocketGroup,
      treeSpecs,
      gems,
      skillSets,
      treeVersion
    };
  } catch (error) {
    console.error('[PoB Parser] Failed to parse:', error);
    return null;
  }
}

function extractSkillSets(doc: Document): SkillSet[] {
  const result: SkillSet[] = [];
  const skillSetElements = Array.from(doc.getElementsByTagName('SkillSet'));

  skillSetElements.forEach((skillSetElement, index) => {
    const title =
      skillSetElement.getAttribute('title') ||
      skillSetElement.getAttribute('name') ||
      `Skill Set ${index + 1}`;

    const socketGroups = extractSocketGroups(skillSetElement);
    if (socketGroups.length > 0) {
      result.push({ title, socketGroups });
    }
  });

  return result;
}

function extractSocketGroups(container: Element | null): GemSocketGroup[] {
  const socketGroups: GemSocketGroup[] = [];
  if (!container) {
    return socketGroups;
  }

  const skillElements = Array.from(container.getElementsByTagName('Skill'));

  skillElements.forEach((skillElement) => {
    // Only consider direct children to avoid duplicates from nested skill groups
    if (skillElement.parentNode !== container) {
      return;
    }

    const slot = skillElement.getAttribute('slot') || '';
    const enabled = skillElement.getAttribute('enabled') !== 'false';
    const includeInFullDps = skillElement.getAttribute('includeInFullDPS') !== 'false';

    const gems: GemInfo[] = [];
    const gemElements = Array.from(skillElement.getElementsByTagName('Gem'));

    gemElements.forEach((gemElement) => {
      if (gemElement.parentNode !== skillElement) {
        return;
      }

      const nameSpec =
        gemElement.getAttribute('nameSpec') ||
        gemElement.getAttribute('gemId') ||
        '';
      const level = parseInt(gemElement.getAttribute('level') || '1', 10);
      const quality = parseInt(gemElement.getAttribute('quality') || '0', 10);
      const gemEnabled = gemElement.getAttribute('enabled') !== 'false';
      const skillId = gemElement.getAttribute('skillId') || undefined;
      const supportGem = gemElement.getAttribute('supportGem') === 'true';

      if (!nameSpec) {
        return;
      }

      gems.push({
        nameSpec,
        level,
        quality,
        enabled: gemEnabled,
        skillId,
        supportGem
      });
    });

    if (gems.length === 0) {
      return;
    }

    // Create label based on main gem (first non-support gem, or first gem)
    const mainGem = gems.find(g => !g.nameSpec.startsWith('Support:')) || gems[0];
    const label = mainGem.nameSpec.replace(/^Support:\s*/, '');

    socketGroups.push({
      slot,
      enabled,
      includeInFullDps,
      gems,
      label
    });
  });

  return socketGroups;
}
