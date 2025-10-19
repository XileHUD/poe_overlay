import { applyFilterChipChrome, type ChipChrome, sanitizeCraftingHtml } from "../../utils";
import { bindImageFallback } from "../../crafting/utils/imageFallback";
import { TRANSPARENT_PLACEHOLDER } from "../../crafting/utils/imagePlaceholder";
import { resolveLocalImage } from "../../crafting/utils/localImage";
import { prepareCharacterPanel } from "../utils";
import { buildPoe2ChipChrome } from "../../shared/filterChips";

export type Keystone = {
  name: string;
  description?: string;
  image?: string;
  imageLocal?: string;
};

type KeystoneEntry = Keystone & {
  __tags?: string[];
  __search?: string;
};

type State = {
  panelEl: HTMLElement | null;
  data: KeystoneEntry[];
  searchInput: HTMLInputElement | null;
  tagWrap: HTMLElement | null;
  cardsWrap: HTMLElement | null;
  selectedTags: Set<string>;
  tagCounts: Record<string, number>;
};

const TAGS = [
  "Damage",
  "Ailments",
  "Attributes",
  "Energy Shield",
  "Defences",
  "Life",
  "Mana",
  "Fire",
  "Cold",
  "Lightning",
  "Chaos",
  "Resistances",
  "Projectile",
  "Area",
  "Critical",
  "Spell",
  "Attack",
  "Minion",
  "Mechanics"
];

const PLACEHOLDER_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30"><rect width="30" height="30" rx="6" fill="#222"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#555" font-size="9" font-family="sans-serif">?</text></svg>`;

const state: State = {
  panelEl: null,
  data: [],
  searchInput: null,
  tagWrap: null,
  cardsWrap: null,
  selectedTags: new Set<string>(),
  tagCounts: Object.fromEntries(TAGS.map(tag => [tag, 0]))
};

const palette: Record<string, [number, number, number]> = {
  damage: [96, 125, 139],
  ailments: [156, 39, 176],
  attributes: [38, 166, 154],
  "energy shield": [0, 188, 212],
  defences: [121, 134, 203],
  life: [220, 68, 61],
  mana: [66, 165, 245],
  fire: [244, 81, 30],
  cold: [66, 165, 245],
  lightning: [255, 213, 79],
  chaos: [156, 39, 176],
  resistances: [255, 112, 67],
  projectile: [255, 179, 0],
  area: [171, 71, 188],
  critical: [255, 202, 40],
  spell: [92, 107, 192],
  attack: [121, 85, 72],
  minion: [142, 68, 173],
  mechanics: [96, 125, 139]
};

function chipChrome(tag: string, active: boolean): ChipChrome {
  const key = tag.toLowerCase();
  return buildPoe2ChipChrome(palette[key] ?? [120, 144, 156], active);
}

function paintTagChip(el: HTMLElement, tag: string, active: boolean, count: number): void {
  el.dataset.tag = tag.toLowerCase();
  el.dataset.count = String(count);
  el.textContent = count ? `${tag} (${count})` : tag;
  applyFilterChipChrome(el, chipChrome(tag, active), {
    padding: "3px 10px",
    fontWeight: active ? "600" : "500",
  });
  el.style.margin = "0 4px 4px 0";
}

function deriveTags(entry: Keystone): string[] {
  const text = `${entry.name || ""} ${String(entry.description || "")}`;
  const tags = new Set<string>();
  if (/Damage/i.test(text)) tags.add("Damage");
  if (/Ailment|Bleed|Ignite|Chill|Freeze|Shock|Poison|Stun|Electrocute/i.test(text)) tags.add("Ailments");
  if (/Attribute|Strength|Dexterity|Intelligence/i.test(text)) tags.add("Attributes");
  if (/Energy Shield|\bES\b/i.test(text)) tags.add("Energy Shield");
  if (/Armour|Armor|Evasion/i.test(text)) tags.add("Defences");
  if (/\bLife\b/i.test(text)) tags.add("Life");
  if (/\bMana\b/i.test(text)) tags.add("Mana");
  if (/\bFire\b/i.test(text)) tags.add("Fire");
  if (/\bCold\b/i.test(text)) tags.add("Cold");
  if (/Lightning|Electrocute/i.test(text)) tags.add("Lightning");
  if (/\bChaos\b/i.test(text)) tags.add("Chaos");
  if (/Resist/i.test(text)) tags.add("Resistances");
  if (/Projectile/i.test(text)) tags.add("Projectile");
  if (/\bArea\b/i.test(text)) tags.add("Area");
  if (/Critical/i.test(text)) tags.add("Critical");
  if (/Cast|Spell/i.test(text)) tags.add("Spell");
  if (/\bAttack\b/i.test(text)) tags.add("Attack");
  if (/Minion/i.test(text)) tags.add("Minion");
  if (/Trap|Totem|Trigger/i.test(text)) tags.add("Mechanics");
  return Array.from(tags);
}

function ensurePanel(): HTMLElement {
  const panel = prepareCharacterPanel("Keystones");
  state.panelEl = panel;
  return panel;
}

function computeSearchBlob(entry: Keystone): string {
  return [entry.name, entry.description]
    .filter(Boolean)
    .map(value => String(value).toLowerCase())
    .join(" ");
}

function computeTagCounts(data: KeystoneEntry[]): Record<string, number> {
  const counts = Object.fromEntries(TAGS.map(tag => [tag, 0]));
  data.forEach(entry => {
    (entry.__tags || []).forEach(tag => {
      if (counts[tag] != null) counts[tag] += 1;
    });
  });
  return counts;
}

function renderShell(panel: HTMLElement): void {
  panel.innerHTML = "";
  const wrapper = document.createElement("div");
  wrapper.className = "page-inner";

  const topbar = document.createElement("div");
  topbar.style.display = "flex";
  topbar.style.gap = "6px";
  topbar.style.alignItems = "center";
  topbar.style.marginBottom = "8px";

  const searchInput = document.createElement("input");
  searchInput.id = "keystoneSearch";
  searchInput.type = "text";
  searchInput.placeholder = "Search keystones...";
  searchInput.style.flex = "1";
  searchInput.style.padding = "4px 8px";
  searchInput.style.background = "var(--bg-tertiary)";
  searchInput.style.border = "1px solid var(--border-color)";
  searchInput.style.borderRadius = "4px";
  searchInput.style.color = "var(--text-primary)";
  searchInput.style.fontSize = "12px";

  const clearBtn = document.createElement("button");
  clearBtn.id = "keystoneClear";
  clearBtn.type = "button";
  clearBtn.className = "pin-btn";
  clearBtn.textContent = "Clear";
  clearBtn.style.padding = "4px 8px";

  topbar.append(searchInput, clearBtn);

  const tagShell = document.createElement("div");
  tagShell.style.background = "var(--bg-secondary)";
  tagShell.style.padding = "8px";
  tagShell.style.borderRadius = "6px";
  tagShell.style.marginBottom = "8px";

  const tagWrap = document.createElement("div");
  tagWrap.id = "keystoneTagFilters";
  tagWrap.style.display = "flex";
  tagWrap.style.flexWrap = "wrap";
  tagWrap.style.gap = "6px";
  tagWrap.style.justifyContent = "center";
  tagWrap.style.width = "100%";

  tagShell.appendChild(tagWrap);

  const cardsWrap = document.createElement("div");
  cardsWrap.id = "keystoneWrap";
  cardsWrap.style.display = "grid";
  cardsWrap.style.gridTemplateColumns = "repeat(auto-fit,minmax(260px,1fr))";
  cardsWrap.style.gap = "10px";
  cardsWrap.style.alignItems = "stretch";

  wrapper.append(topbar, tagShell, cardsWrap);
  panel.appendChild(wrapper);

  state.searchInput = searchInput;
  state.tagWrap = tagWrap;
  state.cardsWrap = cardsWrap;

  searchInput.addEventListener("input", () => applyFilter());
  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    state.selectedTags.clear();
    renderTagFilters();
    applyFilter();
    searchInput.focus();
  });
}

function renderTagFilters(): void {
  if (!state.tagWrap) return;
  state.tagWrap.innerHTML = "";
  TAGS.forEach(tag => {
    const key = tag.toLowerCase();
    const count = state.tagCounts[tag] || 0;
    if (!count) return;
    const chip = document.createElement("div");
    const active = state.selectedTags.has(key);
    paintTagChip(chip, tag, active, count);
    chip.addEventListener("click", () => {
      if (state.selectedTags.has(key)) {
        state.selectedTags.delete(key);
      } else {
        state.selectedTags.add(key);
      }
      renderTagFilters();
      applyFilter();
    });
    state.tagWrap?.appendChild(chip);
  });
  if (state.selectedTags.size) {
    const reset = document.createElement("div");
    reset.textContent = "Reset";
    applyFilterChipChrome(reset, { border: "1px solid var(--accent-red)", background: "var(--accent-red)", color: "#fff" }, {
      padding: "3px 10px",
      fontWeight: "600"
    });
    reset.style.margin = "0 4px 4px 0";
    reset.addEventListener("click", () => {
      state.selectedTags.clear();
      renderTagFilters();
      applyFilter();
    });
    state.tagWrap.appendChild(reset);
  }
}

function matchesTags(entry: KeystoneEntry): boolean {
  if (!state.selectedTags.size) return true;
  const tags = (entry.__tags || []).map(tag => tag.toLowerCase());
  return Array.from(state.selectedTags).every(tag => tags.includes(tag));
}

function buildCard(entry: KeystoneEntry): HTMLElement {
  const card = document.createElement("div");
  card.className = "keystone-card";
  card.style.background = "var(--bg-card)";
  card.style.border = "1px solid var(--border-color)";
  card.style.borderRadius = "6px";
  card.style.padding = "6px";
  card.style.display = "flex";
  card.style.flexDirection = "column";
  card.style.gap = "4px";
  card.style.height = "100%";

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.gap = "6px";
  header.style.alignItems = "center";

  const img = document.createElement("img");
  img.className = "keystone-img";
  img.alt = "";
  img.src = TRANSPARENT_PLACEHOLDER;
  img.style.width = "30px";
  img.style.height = "30px";
  img.style.objectFit = "contain";
  const imgPath = resolveLocalImage(entry.imageLocal, entry.image);
  if (imgPath) img.setAttribute("data-orig-src", imgPath);
  header.appendChild(img);

  const title = document.createElement("div");
  title.textContent = entry.name;
  title.style.fontWeight = "600";
  header.appendChild(title);

  const body = document.createElement("div");
  body.style.fontSize = "11px";
  body.innerHTML = sanitizeCraftingHtml(entry.description || "");

  card.append(header, body);
  return card;
}

function applyFilter(): void {
  if (!state.cardsWrap) return;
  const query = (state.searchInput?.value || "").trim().toLowerCase();
  state.cardsWrap.innerHTML = "";
  const filtered = state.data.filter(entry => {
    const matchesSearch = !query || (entry.__search || "").includes(query);
    return matchesSearch && matchesTags(entry);
  });
  filtered.forEach(entry => {
    const card = buildCard(entry);
    state.cardsWrap?.appendChild(card);
  });
  if (state.cardsWrap.childElementCount) {
    bindImageFallback(state.cardsWrap, ".keystone-img", PLACEHOLDER_ICON, 0.5);
  }
  if (state.panelEl) {
    state.panelEl.scrollTop = 0;
  }
}

async function fetchKeystones(): Promise<KeystoneEntry[]> {
  const payload = await (window as any).electronAPI?.getKeystones?.();
  if (!payload || payload.error) {
    throw new Error(payload?.error || "unknown error");
  }
  const entries = (payload.keystones || []) as KeystoneEntry[];
  entries.forEach(entry => {
    entry.__tags = deriveTags(entry);
    entry.__search = computeSearchBlob(entry);
  });
  return entries;
}

export async function show(): Promise<void> {
  (window as any).__lastPanel = "keystones";
  const panel = ensurePanel();
  panel.innerHTML = "<div class='no-mods'>Loading...</div>";
  try {
    state.data = await fetchKeystones();
    state.tagCounts = computeTagCounts(state.data);
    renderShell(panel);
    renderTagFilters();
    applyFilter();
  } catch (err) {
    panel.innerHTML = `<div class='no-mods' style='color:var(--accent-red);'>Failed to load Keystones (${(err as Error).message})</div>`;
  }
}

export async function reload(): Promise<void> {
  if (!state.panelEl) return;
  state.panelEl.innerHTML = "<div class='no-mods'>Reloading...</div>";
  try {
    state.data = await fetchKeystones();
    state.tagCounts = computeTagCounts(state.data);
    renderShell(state.panelEl);
    renderTagFilters();
    applyFilter();
  } catch (err) {
    state.panelEl.innerHTML = `<div class='no-mods' style='color:var(--accent-red);'>Failed to reload Keystones (${(err as Error).message})</div>`;
  }
}

export function hide(): void {
  if (state.panelEl) {
    state.panelEl.style.display = "none";
  }
}
