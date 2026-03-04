/**
 * Maxroll Build Converter
 *
 * Converts parsed Maxroll planner data into the overlay's StoredPobBuild shape.
 */

import type { MaxrollBuild, MaxrollSkillStep, MaxrollItemSetup } from './parser.js';
import type { StoredPobBuild, TreeSpec, SkillSet, GemSocketGroup, GemInfo, GemRequirement, ItemSet, Item } from '../pob/types.js';

interface PassiveSnapshot {
  added: string[];
  removed: string[];
}

export async function convertMaxrollToPobBuild(build: MaxrollBuild): Promise<StoredPobBuild> {
  // Convert all passive variants into tree specs
  const treeSpecs: TreeSpec[] = (build.passives || []).map((variant, idx) => {
    const { allocatedNodes, weaponSets, allocationOrder } = historyToAllocated(variant.history || []);
    return {
      title: variant.name || `Variant ${idx + 1}`,
      nodes: allocatedNodes.join(','),
      url: build.url,
      allocatedNodes: allocationOrder, // Use allocation order instead of sorted set
      nodeCount: allocatedNodes.length,
      weaponSets,
      maxrollHistory: variant.history, // Store original history for progressive navigation
    };
  });

  // Use first variant (usually Campaign) as primary tree
  const primaryTree = treeSpecs[0];
  const allocatedNodes = primaryTree?.allocatedNodes || [];

  const skillSets = toSkillSets(build.skills);
  const socketGroups = skillSets[0]?.socketGroups || [];
  const gems = toGemRequirements(skillSets);
  const itemSets = toItemSets(build.equipmentSetups);
  
  // Parse notes into sections
  const notesSections = build.notesMarkdown
    ? build.notesMarkdown.split('\n\n---\n\n').filter(p => p.trim()).map((section, idx) => {
        // Extract heading from markdown bold at start of section
        const headingMatch = section.match(/^\*\*(.+?)\*\*\n\n/);
        if (headingMatch) {
          return {
            title: headingMatch[1],
            content: section.substring(headingMatch[0].length).trim()
          };
        }
        return {
          title: idx === 0 ? 'Overview' : `Section ${idx + 1}`,
          content: section.trim()
        };
      })
    : undefined;

  return {
    code: `maxroll:${build.url || build.title}`,
    className: build.className || 'Unknown',
    ascendancyName: build.ascendancyName || '',
    characterName: formatCharacterName(build),
    level: 90,
    treeSpecs,
    allocatedNodes,
    treeProgression: [],
    gems,
    socketGroups,
    skillSets,
    itemSets,
    treeVersion: '3_28',
    importedAt: Date.now(),
    notes: notesSections && notesSections.length > 0 
      ? `${notesSections.length} sections available - use dropdown to browse`
      : 'No notes available',
    notesSections,
    buildSource: 'maxroll',
  };
}

function formatCharacterName(build: MaxrollBuild): string {
  const author = build.author ? ` by ${build.author}` : '';
  return `${build.title}${author} (Maxroll)`;
}

function historyToAllocated(history: any[]): { allocatedNodes: number[]; weaponSets: Record<number, number>; allocationOrder: number[] } {
  // Maxroll history is a progressive list: simple IDs, {add,remove} objects, and {id,set} for weapon trees
  if (!Array.isArray(history)) return { allocatedNodes: [], weaponSets: {}, allocationOrder: [] };
  
  const allocated = new Set<number>();
  const allocationOrder: number[] = []; // Track order nodes were allocated
  const weaponSets: Record<number, number> = {}; // nodeId -> setNumber (1 or 2)
  
  for (const entry of history) {
    if (typeof entry === 'number') {
      // Simple node ID - add it
      if (!allocated.has(entry)) {
        allocated.add(entry);
        allocationOrder.push(entry);
      }
    } else if (entry && typeof entry === 'object') {
      // Check for add/remove operations
      if (Array.isArray(entry.add)) {
        entry.add.forEach((id: any) => {
          if (typeof id === 'number') {
            if (!allocated.has(id)) {
              allocated.add(id);
              allocationOrder.push(id);
            }
          } else if (id && typeof id === 'object' && typeof id.id === 'number') {
            if (!allocated.has(id.id)) {
              allocated.add(id.id); // Handle {id: X, set: Y} in add array
              allocationOrder.push(id.id);
            }
            if (typeof id.set === 'number') {
              weaponSets[id.id] = id.set;
            }
          }
        });
      }
      if (Array.isArray(entry.remove)) {
        entry.remove.forEach((id: any) => {
          if (typeof id === 'number') {
            allocated.delete(id);
            delete weaponSets[id]; // Remove weapon set info too
            // Remove from allocation order (last occurrence)
            const idx = allocationOrder.lastIndexOf(id);
            if (idx !== -1) {
              allocationOrder.splice(idx, 1);
            }
          }
        });
      }
      // Check for {id, set} format (weapon tree nodes)
      if (typeof entry.id === 'number' && entry.set !== undefined) {
        if (!allocated.has(entry.id)) {
          allocated.add(entry.id);
          allocationOrder.push(entry.id);
        }
        if (typeof entry.set === 'number') {
          weaponSets[entry.id] = entry.set;
        }
      }
    }
  }
  
  return {
    allocatedNodes: Array.from(allocated).sort((a, b) => a - b),
    weaponSets,
    allocationOrder, // Return allocation order for progressive navigation
  };
}

function toSkillSets(steps: MaxrollSkillStep[]): SkillSet[] {
  return (steps || []).map((step, stepIdx) => ({
    title: step.name || `Step ${stepIdx + 1}`,
    socketGroups: (step.skills || []).map((group, groupIdx) => ({
      slot: `Group ${groupIdx + 1}`,
      enabled: true,
      includeInFullDps: stepIdx === 0 && groupIdx === 0,
      label: group.note || step.name || `Group ${groupIdx + 1}`,
      gems: (group.gems || []).map((gem) => ({
        nameSpec: gem.displayName || gem.id || 'Unknown Gem',
        level: gem.level || 1,
        quality: gem.quality || 0,
        enabled: true,
        supportGem: isSupportGem(gem.oldName || gem.displayName || gem.id),
        skillSetTitle: step.name,
        buildSource: 'maxroll' as const,
        gemVersion: gem.version, // Pass version for image lookup
        oldName: gem.oldName,
      } as GemInfo)),
    } as GemSocketGroup)),
  }));
}

function toGemRequirements(skillSets: SkillSet[]): GemRequirement[] {
  const map = new Map<string, GemRequirement>();

  skillSets.forEach((set) => {
    set.socketGroups.forEach((group) => {
      group.gems.forEach((gem) => {
        const key = (gem.nameSpec || '').toLowerCase();
        if (!key) return;
        if (!map.has(key)) {
          map.set(key, {
            name: gem.nameSpec,
            level: gem.level,
            act: 1,
            isSupport: !!gem.supportGem,
            skillSetTitle: set.title,
          });
        }
      });
    });
  });

  return Array.from(map.values());
}

function toItemSets(setups: MaxrollItemSetup[]): ItemSet[] {
  if (!Array.isArray(setups) || setups.length === 0) return [];

  return setups.map((setup, setupIdx) => {
    const items: Record<string, Item> = {};
    const entries = Object.entries(setup.items || {});
    
    entries.forEach(([slot, itemData]: [string, any], itemIdx) => {
      // itemData is now the resolved item object from the database
      if (itemData && typeof itemData === 'object' && 'base' in itemData) {
        const stats = (itemData as any).stats || {};
        const mods: string[] = [];

        // Collect explicit mods and humanize keys
        if (stats.explicit) {
          Object.entries(stats.explicit).forEach(([key, value]) => {
            mods.push(`${humanizeStatKey(key)}: ${value}`);
          });
        }

        const friendlyName = (itemData as any).name || humanizeBase((itemData as any).base) || prettifySlot(slot);
        const baseTypeName = humanizeBase((itemData as any).base) || (itemData as any).base;

        items[slot] = {
          id: setupIdx * 100 + itemIdx + 1,
          rawText: (itemData as any).base || '',
          name: friendlyName,
          baseName: baseTypeName, // Always show base type (e.g., "Body Str Int" below "Enfolding Dawn")
          rarity: (itemData as any).rarity,
          mods,
          implicitMods: stats.implicit ? Object.keys(stats.implicit).map(humanizeStatKey) : undefined,
        };
      } else {
        // Fallback for non-resolved items
        items[slot] = {
          id: setupIdx * 100 + itemIdx + 1,
          rawText: String(itemData ?? ''),
          name: prettifySlot(slot),
        };
      }
    });

    return {
      id: setupIdx + 1,
      title: setup.name || `Setup ${setupIdx + 1}`,
      items,
    } as ItemSet;
  });
}

function isSupportGem(id?: string): boolean {
  if (!id) return false;
  const lower = id.toLowerCase();
  return lower.includes('support');
}

function humanizeBase(base: string | undefined): string | undefined {
  if (!base) return undefined;
  const last = base.split('/').pop() || base;
  // Strip leading numeric/word prefixes like "Four", "Three"
  const stripped = last.replace(/^(Four|Three|Two|One)/, '').replace(/\d+$/, '');
  return stripped
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim();
}

function humanizeStatKey(key: string): string {
  // Remove common prefixes
  const cleaned = key.replace(/^base_/, '').replace(/_$/, '');
  // Replace underscores with spaces and tidy percents
  const spaced = cleaned.replace(/_/g, ' ');
  // Highlight percent stats nicely
  return spaced
    .replace(/%/g, '%')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function prettifySlot(slot: string): string {
  return slot.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function toNumber(value: string | number): number {
  if (typeof value === 'number') return value;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? NaN : parsed;
}
