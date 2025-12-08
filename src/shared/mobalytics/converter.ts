/**
 * Mobalytics Build Converter
 * 
 * Converts Mobalytics build data into StoredPobBuild format
 * compatible with the overlay's PoB system.
 */

import type { MobalyticsBuild, MobalyticsVariant, MobalyticsNote, MobalyticsSkill } from './parser.js';
import type { StoredPobBuild, TreeSpec, ItemSet, SkillSet, GemSocketGroup, GemInfo, GemRequirement } from '../pob/types.js';

/**
 * Convert a Mobalytics build into StoredPobBuild format
 */
export function convertMobalyticsToPobBuild(mobaBuild: MobalyticsBuild): StoredPobBuild {
  console.log('[Mobalytics Converter] Converting build:', mobaBuild.title);
  console.log('[Mobalytics Converter] Variants:', mobaBuild.variants.length);

  // Use first variant as primary (user can switch variants later via UI)
  const primaryVariant = mobaBuild.variants[0];
  if (!primaryVariant) {
    throw new Error('Build has no variants');
  }

  // Convert all variants to SkillSets
  const skillSets: SkillSet[] = mobaBuild.variants.map(variant => ({
    title: variant.title,
    socketGroups: convertSkillsToSocketGroups(variant.skills),
  }));

  // Convert all variants to ItemSets
  const itemSets: ItemSet[] = mobaBuild.variants
    .filter(v => v.gear)
    .map((variant, idx) => convertGearToItemSet(variant.gear, variant.title, idx + 1));

  // Convert all variants to TreeSpecs
  const treeSpecs: TreeSpec[] = mobaBuild.variants.map(variant => 
    convertPassivesToTreeSpec(variant.passives, variant.title)
  );

  // Extract all unique gems from all variants for flat gem list
  const allGems: GemRequirement[] = extractAllGems(mobaBuild.variants);

  // Convert notes to structured sections for dropdown
  const notesSections = convertNotesToSections(mobaBuild.notes, mobaBuild.variants);

  // Format character name: "Build Title by Creator (Mobalytics)"
  let characterName = mobaBuild.title;
  if (mobaBuild.author) {
    characterName = `${mobaBuild.title} by ${mobaBuild.author} (Mobalytics)`;
  } else {
    characterName = `${mobaBuild.title} (Mobalytics)`;
  }

  // Build the StoredPobBuild
  const pobBuild: StoredPobBuild = {
    code: `mobalytics:${mobaBuild.title}`, // Use title as pseudo-code since there's no PoB code
    className: mobaBuild.className || 'Unknown',
    ascendancyName: mobaBuild.ascendancyName || '',
    characterName: characterName,
    level: 90, // Default level, could be inferred from tree if needed
    treeSpecs: treeSpecs,
    allocatedNodes: treeSpecs[0]?.allocatedNodes || [],
    treeProgression: [], // Mobalytics variants are alternatives, not progressions
    gems: allGems,
    socketGroups: skillSets[0]?.socketGroups || [],
    skillSets: skillSets,
    itemSets: itemSets,
    treeVersion: '3_26', // Default to latest, would need detection logic
    notes: notesSections.length > 0 ? `${notesSections.length} sections available - use dropdown to browse` : 'No notes available',
    notesSections: notesSections, // Use structured sections instead
    importedAt: Date.now(),
    buildSource: 'mobalytics', // Mark as Mobalytics import for node progression UI
  };

  console.log('[Mobalytics Converter] Conversion complete:', {
    skillSets: skillSets.length,
    itemSets: itemSets.length,
    treeSpecs: treeSpecs.length,
    totalGems: allGems.length,
  });

  return pobBuild;
}

/**
 * Convert Mobalytics skills to GemSocketGroups
 */
function convertSkillsToSocketGroups(skills: MobalyticsSkill[]): GemSocketGroup[] {
  return skills.map((skill, idx) => {
    const gems: GemInfo[] = [];

    // Add active gem
    if (skill.active.name) {
      gems.push({
        nameSpec: skill.active.name,
        level: skill.active.level || 1,
        quality: 0,
        enabled: true,
        skillId: skill.active.slug || undefined,
        supportGem: false,
      });
    }

    // Add support gems
    skill.supports.forEach(support => {
      if (support.name) {
        gems.push({
          nameSpec: support.name,
          level: 1,
          quality: 0,
          enabled: true,
          skillId: support.slug || undefined,
          supportGem: true,
        });
      }
    });

    return {
      slot: `Socket Group ${idx + 1}`,
      enabled: true,
      includeInFullDps: idx === 0, // First group is main skill
      gems: gems,
      label: skill.active.name || `Group ${idx + 1}`,
    };
  });
}

/**
 * Convert Mobalytics gear to ItemSet
 */
function convertGearToItemSet(gear: any, variantTitle: string, setId: number): ItemSet {
  const items: Record<string, any> = {};

  if (!gear) {
    return {
      id: setId,
      title: variantTitle,
      items: {},
    };
  }

  // Map Mobalytics slots to PoB slots
  const slotMap: Record<string, string> = {
    'weapon1': 'Weapon 1',
    'weapon2': 'Weapon 2',
    'helmet': 'Helmet',
    'body': 'Body Armour',
    'gloves': 'Gloves',
    'boots': 'Boots',
    'amulet': 'Amulet',
    'ring': 'Ring 1',
    'ring2': 'Ring 2',
    'belt': 'Belt',
    'flask1': 'Flask 1',
    'flask2': 'Flask 2',
    'flask3': 'Flask 3',
    'flask4': 'Flask 4',
    'flask5': 'Flask 5',
  };

  // Convert each gear slot
  for (const [mobaSlot, pobSlot] of Object.entries(slotMap)) {
    const gearItem = (gear as any)[mobaSlot];
    if (gearItem?.commonItem) {
      const item = gearItem.commonItem;
      items[pobSlot] = {
        id: setId * 100 + Object.keys(items).length,
        rawText: '', // Would need to reconstruct from Mobalytics data
        name: item.name || '',
        baseName: item.name || '',
        rarity: item.isUnique ? 'Unique' : 'Rare',
        mods: (item.explicitDescriptions || []).map((desc: any) => desc.description),
        implicitMods: (item.implicitDescriptions || []).map((desc: any) => desc.description),
      };
    }
  }

  return {
    id: setId,
    title: variantTitle,
    items: items,
  };
}

/**
 * Convert Mobalytics passives to TreeSpec
 */
function convertPassivesToTreeSpec(passives: any, variantTitle: string): TreeSpec {
  // Combine main tree and ascendancy passives
  const allPassiveSlugs = [
    ...(passives.main || []),
    ...(passives.ascendancy || []),
  ];

  // Mobalytics uses slug format like "node-7576", we need to extract the numeric ID
  const allocatedNodes = allPassiveSlugs.map((slug: string) => {
    // If already numeric, use it directly
    if (/^\d+$/.test(slug)) {
      return parseInt(slug, 10);
    }
    
    // Extract numeric ID from "node-XXXX" format
    const match = slug.match(/node-(\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }
    
    // Fallback: try parsing the whole string as a number
    const numericId = parseInt(slug, 10);
    if (!isNaN(numericId)) return numericId;
    
    // Last resort: log warning and return 0 (should not happen with valid Mobalytics data)
    console.warn('[Mobalytics Converter] Could not parse node ID from slug:', slug);
    return 0;
  });

  return {
    title: variantTitle,
    nodes: allocatedNodes.join(','), // Use numeric IDs instead of slugs
    url: `https://poe2db.tw/us/passive-tree/${allocatedNodes.join('-')}`, // Generate URL for compatibility
    allocatedNodes: allocatedNodes,
    nodeCount: allocatedNodes.length,
    parsedUrl: {
      version: 4, // PoE2 tree version
      classId: 0,
      ascendancyId: 0,
      nodes: allocatedNodes.map(n => n.toString()), // Store as string array of numeric IDs
      masteries: {},
    },
  };
}

/**
 * Extract all unique gems from all variants
 */
function extractAllGems(variants: MobalyticsVariant[]): GemRequirement[] {
  const gemMap = new Map<string, GemRequirement>();

  variants.forEach(variant => {
    variant.skills.forEach(skill => {
      // Add active gem
      if (skill.active.name) {
        const key = skill.active.name.toLowerCase();
        if (!gemMap.has(key)) {
          gemMap.set(key, {
            name: skill.active.name,
            level: skill.active.level || 1,
            act: 1, // Would need quest mapping
            isSupport: false,
            skillSetTitle: variant.title,
          });
        }
      }

      // Add support gems
      skill.supports.forEach(support => {
        if (support.name) {
          const key = support.name.toLowerCase();
          if (!gemMap.has(key)) {
            gemMap.set(key, {
              name: support.name,
              level: 1,
              act: 1, // Would need quest mapping
              isSupport: true,
              skillSetTitle: variant.title,
            });
          }
        }
      });
    });
  });

  return Array.from(gemMap.values());
}

/**
 * Convert Mobalytics notes to structured sections for dropdown display
 */
function convertNotesToSections(notes: MobalyticsNote[], variants: MobalyticsVariant[]): Array<{ title: string; content: string }> {
  const sections: Array<{ title: string; content: string }> = [];

  // Add overview section from richtext notes
  const overviewParts: string[] = [];
  notes.forEach(note => {
    if (note.type === 'richtext' && note.body) {
      if (note.title) {
        overviewParts.push(`## ${note.title}\n`);
      }
      overviewParts.push(note.body);
      overviewParts.push(''); // Empty line
    }
  });
  if (overviewParts.length > 0) {
    sections.push({
      title: 'Overview',
      content: overviewParts.join('\n').trim(),
    });
  }

  // Add Strengths & Weaknesses section
  notes.forEach(note => {
    if (note.type === 'strengths-weaknesses') {
      const parts: string[] = [];
      
      if (note.strengths && note.strengths.length > 0) {
        parts.push('## Strengths\n');
        note.strengths.forEach(s => parts.push(`✓ ${s}`));
        parts.push('');
      }
      
      if (note.weaknesses && note.weaknesses.length > 0) {
        parts.push('## Weaknesses\n');
        note.weaknesses.forEach(w => parts.push(`✗ ${w}`));
        parts.push('');
      }
      
      if (parts.length > 0) {
        sections.push({
          title: note.title || 'Strengths & Weaknesses',
          content: parts.join('\n').trim(),
        });
      }
    }
  });

  // Add variant-specific guide sections (skills and passive tree descriptions)
  variants.forEach((variant, idx) => {
    // Add skills/gems guide text if available
    if (variant.skillsGuide) {
      sections.push({
        title: `${variant.title} - Skills`,
        content: variant.skillsGuide,
      });
    }

    // Add passive tree guide text if available
    if (variant.passiveTreeGuide) {
      sections.push({
        title: `${variant.title} - Passive Tree`,
        content: variant.passiveTreeGuide,
      });
    }
  });

  return sections;
}

