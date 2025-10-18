import { MAP_MODS, type MapMod } from './mapModData';

export interface RegexMod {
  readonly id: number;
  readonly regex: string;
  readonly text: string;
  readonly display: string;
  readonly searchText: string;
  readonly scary: number;
  readonly isT17: boolean;
}

export const REGEX_MODS: RegexMod[] = MAP_MODS.map(mod => ({
  id: mod.id,
  regex: mod.regex,
  text: mod.text,
  display: mod.text,
  searchText: mod.text.toLowerCase(),
  scary: mod.scary,
  isT17: mod.tier17
}));

// Empty arrays for compatibility (not used anymore)
export const MAP_NAMES: string[] = [];
export const MAP_AFFIXES: string[] = [];
