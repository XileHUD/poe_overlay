/**
 * Path of Building XML Parser
 * 
 * Parses decoded PoB XML to extract build information
 */

import { DOMParser } from '@xmldom/xmldom';
import { ParsedPobBuild, TreeSpec, GemSocketGroup, GemInfo, SkillSet, ItemSet, Item } from './types';
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
          // Filter nodes to only include ones that exist in the tree
          parsedUrl.nodes = parsedUrl.nodes.filter(nodeId => lookup[nodeId] !== undefined);
          console.log(`[PoB Parser] Parsed tree "${title}": ${parsedUrl.nodes.length} valid nodes (filtered from tree)`);
        } catch (error) {
          console.error(`[PoB Parser] Failed to parse tree URL for "${title}":`, error);
        }
      }
      
      // Skip header-only specs
      // If a URL exists, require parsedUrl.nodes > 0 (after lookup filtering).
      // Only fall back to allocatedNodes when no URL is present.
      const hasAnyNodes = url
        ? (Array.isArray((parsedUrl as any)?.nodes) && (parsedUrl as any).nodes.length > 0)
        : (allocatedNodes.length > 0);
      if (!hasAnyNodes) {
        console.log(`[PoB Parser] Skipping header-only tree spec: "${title}"`);
      } else {
        // Count allocated nodes (use parsedUrl nodes if available, otherwise allocatedNodes)
        const nodeCount = url && parsedUrl?.nodes
          ? parsedUrl.nodes.length
          : allocatedNodes.length;
        
        treeSpecs.push({
          title,
          nodes,
          url,
          allocatedNodes,
          nodeCount, // Store node count for smart naming and fallback detection
          classId: parseInt(spec.getAttribute('classId') || '0', 10),
          ascendClassId: parseInt(spec.getAttribute('ascendClassId') || '0', 10),
          parsedUrl
        });
        // Use tree version from first included spec
        if (treeSpecs.length === 1) {
          treeVersion = spec.getAttribute('treeVersion') || '3_25';
        }
      }
    }

    if (treeSpecs.length === 0) {
      console.error('[PoB Parser] No <Spec> elements found');
      return null;
    }

    // Extract gem skill sets (per-act presets)
    const skillSets = extractSkillSets(doc);

    // Collect ALL gems from ALL skill sets (not just the first), fallback to legacy <Skills>
    let gems: GemSocketGroup[] = [];
    if (skillSets.length > 0) {
      // Flatten all socketGroups from all skillSets into one array
      gems = skillSets.flatMap(skillSet => skillSet.socketGroups);
    } else {
      // Fallback to legacy <Skills> element if no skillSets found
      gems = extractSocketGroups(doc.getElementsByTagName('Skills')[0] || null);
    }

    // Extract notes from <Notes> element
    const notesElement = doc.getElementsByTagName('Notes')[0];
    const notes = notesElement?.textContent?.trim() || undefined;

    // Extract item sets
    const itemSets = extractItemSets(doc);

    console.log(`[PoB Parser] Found ${treeSpecs.length} tree specs:`, treeSpecs.map(s => s.title));
    if (notes) {
      console.log(`[PoB Parser] Found notes (${notes.length} characters)`);
    }
    if (itemSets.length > 0) {
      console.log(`[PoB Parser] Found ${itemSets.length} item sets`);
    }

    return {
      className,
      ascendancyName,
      level,
      characterName,
      mainSocketGroup,
      treeSpecs,
      gems,
      skillSets,
      itemSets,
      treeVersion,
      notes
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

    const socketGroups = extractSocketGroups(skillSetElement, title); // Pass title to extractSocketGroups
    if (socketGroups.length > 0) {
      result.push({ title, socketGroups });
    }
  });

  return result;
}

/**
 * Extract gem socket groups from a given container element (could be <Skills> or <SkillSet>).
 * @param container The XML element containing <Skill> elements
 * @param skillSetTitle Optional title of the skillSet this belongs to (e.g. "Act 1", "Early maps")
 * @returns Array of GemSocketGroup objects
 */
function extractSocketGroups(container: Element | null, skillSetTitle?: string): GemSocketGroup[] {
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
        supportGem,
        skillSetTitle // Add the skillSet title to each gem
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

function extractItemSets(doc: Document): ItemSet[] {
  const result: ItemSet[] = [];
  const itemSetElements = Array.from(doc.getElementsByTagName('ItemSet'));

  itemSetElements.forEach((itemSetElement) => {
    const id = parseInt(itemSetElement.getAttribute('id') || '1', 10);
    const title = itemSetElement.getAttribute('title') || `Gear Set ${id}`;
    const useSecondWeaponSet = itemSetElement.getAttribute('useSecondWeaponSet') === 'true';

  const items: Record<string, Item> = {};
  const usedItemIds = new Set<number>();
    const slotElements = Array.from(itemSetElement.getElementsByTagName('Slot'));

    slotElements.forEach((slotElement) => {
      const slotName = slotElement.getAttribute('name') || '';
      const itemId = parseInt(slotElement.getAttribute('itemId') || '0', 10);

      if (!slotName || !itemId) {
        return;
      }

      // Find the corresponding item element
      const itemElement = findItemById(doc, itemId);
      if (!itemElement) {
        return;
      }

      const rawText = itemElement.textContent || '';
      const item = parseItemText(itemId, rawText);
      items[slotName] = item;
      usedItemIds.add(itemId);
    });

    // Merge in tree-slotted jewels from the best-matching Spec's <Sockets>
    // This keeps ONLY actually slotted jewels for the selected set (no synthetic unslotted jewels),
    // and captures Cluster/Unique/Timeless jewels placed on the passive tree.
    try {
      const itemSetTitle = title;
      const normalize = (s: string) => (s || '')
        .toLowerCase()
        .replace(/[()\[\]]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const isJewelish = (name?: string, base?: string) => {
        const n = (name || '').toLowerCase();
        const b = (base || '').toLowerCase();
        return n.includes('jewel') || b.includes('jewel');
      };

      const normalizedSet = normalize(itemSetTitle);
      const specEls = Array.from(doc.getElementsByTagName('Spec'));
      let bestSpec: Element | null = null;
      let bestScore = -1;
      const setTokens = new Set(normalizedSet.split(' ').filter(Boolean));
      for (const sp of specEls) {
        const st = normalize(sp.getAttribute('title') || '');
        let score = 0;
        if (st === normalizedSet) {
          score = 100; // exact
        } else {
          const tokens = new Set(st.split(' ').filter(Boolean));
          for (const t of setTokens) if (tokens.has(t)) score++;
        }
        if (score > bestScore) { bestScore = score; bestSpec = sp; }
      }
      if (bestSpec) {
        const socketsEl = bestSpec.getElementsByTagName('Sockets')[0];
        if (socketsEl) {
          const socketEls = Array.from(socketsEl.getElementsByTagName('Socket'));
          // Start numbering after existing Jewels to keep stable ordering
          let jewelIndex = Object.keys(items).filter(k => k.startsWith('Jewel')).length + 1;
          for (const se of socketEls) {
            const idAttr = se.getAttribute('itemId');
            if (!idAttr) continue;
            const jid = parseInt(idAttr, 10);
            if (!jid || usedItemIds.has(jid)) continue; // avoid duping abyssal socket items etc.
            const itemElement = findItemById(doc, jid);
            if (!itemElement) continue;
            const rawText = itemElement.textContent || '';
            const parsed = parseItemText(jid, rawText);
            if (!isJewelish(parsed.name, parsed.baseName)) continue; // safety: only jewels
            const key = `Jewel ${jewelIndex++}`;
            items[key] = parsed;
            usedItemIds.add(jid);
          }
        }
      }
    } catch {}

    result.push({
      id,
      title,
      useSecondWeaponSet,
      items
    });
  });

  return result;
}

function findItemById(doc: Document, itemId: number): Element | null {
  const items = Array.from(doc.getElementsByTagName('Item'));
  return items.find(item => parseInt(item.getAttribute('id') || '0', 10) === itemId) || null;
}

function parseItemText(id: number, rawText: string): Item {
  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  // Helper: remove PoB decorator tokens like {variant:}, {range:}, {crafted}, {exarch}, etc.
  const cleanDecorators = (s: string) => s.replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();

  // Helper: determine if a line is metadata/noise that shouldn't be displayed as a mod
  const isNoiseLine = (line: string) => {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();
    // Drop lines that are ONLY decorator tokens like {range:...} or {tags:...}
    if (/^\{[^}]+\}$/.test(trimmed)) return true;
    return (
      // PoB inline metadata and tags (plain forms). We intentionally DO NOT drop lines that START with
      // brace-wrapped tokens like {range:}{tags:} when they also contain real mod text; those will be
      // cleaned by cleanDecorators below.
      lower.startsWith('tags:') ||
      lower.startsWith('range:') ||
      lower.startsWith('levelreq:') || lower.startsWith('radius:') ||
      lower.startsWith('limited to:') || lower.startsWith('unique id:') ||
      lower.startsWith('league:') ||
      // Influences / flags
      lower.startsWith('shaper item') || lower.startsWith('elder item') ||
      lower.startsWith('crusader item') || lower.startsWith('hunter item') ||
      lower.startsWith('redeemer item') || lower.startsWith('warlord item') ||
      lower.startsWith('searing exarch item') || lower.startsWith('eater of worlds item') ||
      lower === 'corrupted' || lower === 'mirrored' || lower === 'unidentified' ||
      // Crafting/affix metadata
      lower.startsWith('crafted:') || lower.startsWith('prefix:') || lower.startsWith('suffix:') ||
      // Requirements block
      lower.startsWith('requirements:') || lower.startsWith('requires ') ||
      // PoE2 Rune display boilerplate
      lower.startsWith('rune:') ||
      // Variant/catalyst metadata lines (NOT the inline {variant:} tokens already stripped above)
      lower.startsWith('variant:') || lower.startsWith('selected variant:') ||
      lower.startsWith('catalyst:') || lower.startsWith('catalystquality:') ||
      // Base percentile/stat scaffolding often emitted by PoB exports
      lower.startsWith('armourbasepercentile:') || lower.startsWith('evasionbasepercentile:') ||
      lower.startsWith('energyshieldbasepercentile:') || lower.startsWith('wardbasepercentile:') ||
      // Base defence lines (not real mods)
      lower.startsWith('armour:') || lower.startsWith('evasion:') ||
      lower.startsWith('energy shield:') || lower.startsWith('ward:')
    );
  };
  
  let name: string | undefined;
  let baseName: string | undefined;
  let rarity: string | undefined;
  let itemLevel: number | undefined;
  let quality: number | undefined;
  let sockets: string | undefined;
  let variant: number | undefined;
  const mods: string[] = [];
  const implicitMods: string[] = [];
  const craftedMods: string[] = [];

  let section: 'header' | 'implicit' | 'explicit' | 'crafted' = 'header';
  let implicitRemaining: number | undefined;
  let nameLineCount = 0;
  let selectedVariant: number | undefined;

  // Helper: check if a line with {variant:x[,y]} includes the selected variant
  const matchesSelectedVariant = (line: string) => {
    if (!selectedVariant) return true; // If none selected, keep the line
    const variantMatches = line.match(/\{variant:([^}]+)\}/g);
    if (!variantMatches) return true; // No variant gating on this line
    // If any variant group includes the selected one, keep
    for (const m of variantMatches) {
      const list = m.replace(/\{variant:|\}/g, '').split(',').map(v => parseInt(v.trim(), 10)).filter(n => !isNaN(n));
      if (list.includes(selectedVariant)) return true;
    }
    return false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Capture selected variant number early (don't keep the line)
    if (/^Selected Variant:/i.test(line)) {
      const m = line.match(/Selected Variant:\s*(\d+)/i);
      if (m) selectedVariant = parseInt(m[1], 10);
      continue;
    }

    // Skip metadata/noise lines entirely
    if (isNoiseLine(line)) {
      continue;
    }
    
    // Metadata lines
    if (line.startsWith('Rarity:')) {
      rarity = line.substring(7).trim();
      continue;
    }
    if (line.startsWith('Item Level:')) {
      itemLevel = parseInt(line.substring(11).trim(), 10);
      continue;
    }
    if (line.startsWith('Quality:')) {
      const match = line.match(/Quality:\s*\+?(\d+)/);
      if (match) {
        quality = parseInt(match[1], 10);
      }
      continue;
    }
    if (line.startsWith('Sockets:')) {
      sockets = line.substring(8).trim();
      continue;
    }
    // Capture inline variant marker but don't drop the rest of the line (mods often follow)
    if (line.includes('{variant:')) {
      const match = line.match(/\{variant:(\d+)\}/);
      if (match) {
        variant = parseInt(match[1], 10);
      }
      // don't continue; we'll clean decorators below and keep the remaining text as a mod
    }
    if (line.startsWith('Implicits:') || line.startsWith('Implicit:')) {
      // Use the count to determine how many subsequent lines belong to implicits
      const m = line.match(/Implicits?:\s*(\d+)/i);
      if (m) {
        implicitRemaining = parseInt(m[1], 10);
        // If there are zero implicits, do NOT enter implicit section
        section = implicitRemaining > 0 ? 'implicit' : 'explicit';
      } else {
        // Fallback: if no count found, assume implicit block begins
        section = 'implicit';
      }
      continue;
    }
    if (line.startsWith('{crafted}')) {
      section = 'crafted';
      continue;
    }
    
    // Separator line (dashes) indicates transition from implicits to explicits
    if (line.match(/^-+$/)) {
      if (section === 'implicit') {
        section = 'explicit';
      }
      continue;
    }
    
    // Name lines (first 1-2 lines after rarity, before any separator)
    if (section === 'header' && nameLineCount < 2 && !line.includes(':') && !line.includes('+') && !line.includes('%') && !line.match(/^\d/)) {
      if (nameLineCount === 0) {
        name = line;
      } else if (nameLineCount === 1) {
        baseName = name;
        name = line;
      }
      nameLineCount++;
      continue;
    }
    
    // Once we have the name(s), transition to explicit section
    if (section === 'header' && nameLineCount > 0) {
      section = 'explicit';
    }
    
    // Mod lines - only add if not a metadata line
    // Respect selected variant gating
    if (!matchesSelectedVariant(line)) {
      continue;
    }

    const cleaned = cleanDecorators(line);
    if (!cleaned) {
      continue;
    }
    if (section === 'implicit') {
      implicitMods.push(cleaned);
      if (typeof implicitRemaining === 'number') {
        implicitRemaining = Math.max(0, implicitRemaining - 1);
        if (implicitRemaining === 0) {
          section = 'explicit';
        }
      }
    } else if (section === 'explicit') {
      mods.push(cleaned);
    } else if (section === 'crafted') {
      craftedMods.push(cleaned);
    }
  }

  // De-duplicate mods within each section after cleaning
  const uniq = (arr: string[]) => Array.from(new Set(arr));
  const finalImplicit = uniq(implicitMods);
  const finalMods = uniq(mods);
  const finalCrafted = uniq(craftedMods);

  return {
    id,
    rawText,
    name,
    baseName,
    rarity,
    itemLevel,
    quality,
    sockets,
    variant,
    mods: finalMods.length > 0 ? finalMods : undefined,
    implicitMods: finalImplicit.length > 0 ? finalImplicit : undefined,
    craftedMods: finalCrafted.length > 0 ? finalCrafted : undefined
  };
}
