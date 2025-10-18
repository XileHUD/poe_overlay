// Simple map mod data with working regex patterns
import { MAP_MODS_DATA, type MapMod } from './mods/map-mods-data';

export type { MapMod };

// All available map mods
export const MAP_MODS: MapMod[] = MAP_MODS_DATA;

// Helper to get mod by ID
export function getModById(id: number): MapMod | undefined {
  return MAP_MODS.find(m => m.id === id);
}

// Helper to search mods by text
export function searchMods(query: string): MapMod[] {
  const q = query.toLowerCase();
  return MAP_MODS.filter(m => m.text.toLowerCase().includes(q));
}

// Get all unique mods (by text)
export function getUniqueMods(): MapMod[] {
  const seen = new Set<string>();
  return MAP_MODS.filter(m => {
    if (seen.has(m.text)) return false;
    seen.add(m.text);
    return true;
  });
}
