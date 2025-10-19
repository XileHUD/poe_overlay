import { applyFilterChipChrome, type ChipChrome, sanitizeCraftingHtml } from "../../utils";
import { bindImageFallback } from "../../crafting/utils/imageFallback";
import { TRANSPARENT_PLACEHOLDER } from "../../crafting/utils/imagePlaceholder";
import { prepareCharacterPanel } from "../utils";

export type Annoint = {
  name: string;
  description: string;
  emotions?: { name: string; image?: string; imageLocal?: string }[];
};

type AnnointState = {
  panelEl: HTMLElement | null;
  data: Annoint[];
  cards: HTMLElement[];
  searchInput: HTMLInputElement | null;
  selectedTags: Set<string>;
  searchTimer: number | null;
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

const PLACEHOLDER_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14"><rect width="14" height="14" rx="2" fill="#222"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#555" font-size="6" font-family="sans-serif">?</text></svg>`;

const state: AnnointState = {
  panelEl: null,
  data: [],
  cards: [],
  searchInput: null,
  selectedTags: new Set<string>(),
  searchTimer: null,
  tagCounts: Object.fromEntries(TAGS.map(tag => [tag, 0]))
};

function ensurePanel(): HTMLElement {
  const panel = state.panelEl ?? prepareCharacterPanel("Annoints");
  state.panelEl = panel;
  return panel;
}

function deriveTags(entry: Annoint): string[] {
  const text = String(entry.description || "").replace(/<[^>]+>/g, " ");
  const tags = new Set<string>();
  if (/Damage/i.test(text)) tags.add("Damage");
  if (/Ailment|Bleed|Ignite|Chill|Freeze|Shock|Poison|Stun/i.test(text)) tags.add("Ailments");
  if (/Attribute|Strength|Dexterity|Intelligence/i.test(text)) tags.add("Attributes");
  if (/Energy Shield|\bES\b/i.test(text)) tags.add("Energy Shield");
  if (/Armour|Armor|Evasion/i.test(text)) tags.add("Defences");
  if (/\bLife\b/i.test(text)) tags.add("Life");
  if (/\bMana\b/i.test(text)) tags.add("Mana");
  if (/\bFire\b/i.test(text)) tags.add("Fire");
  if (/\bCold\b/i.test(text)) tags.add("Cold");
  if (/Lightning/i.test(text)) tags.add("Lightning");
  if (/\bChaos\b/i.test(text)) tags.add("Chaos");
  if (/Resistance/i.test(text)) tags.add("Resistances");
  if (/Projectile/i.test(text)) tags.add("Projectile");
  if (/\bArea\b/i.test(text)) tags.add("Area");
  if (/Critical/i.test(text)) tags.add("Critical");
  if (/Cast|Spell/i.test(text)) tags.add("Spell");
  if (/\bAttack\b/i.test(text)) tags.add("Attack");
  if (/Minion/i.test(text)) tags.add("Minion");
  if (/Trap|Totem|Trigger/i.test(text)) tags.add("Mechanics");
  return Array.from(tags);
}

function chipChrome(tag: string, active: boolean): ChipChrome {
  const key = tag.toLowerCase();
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
  const [r, g, b] = palette[key] ?? [120, 144, 156];
  const background = active ? `rgba(${r},${g},${b},0.9)` : `rgba(${r},${g},${b},0.22)`;
  const border = `1px solid rgba(${r},${g},${b},0.6)`;
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const color = active ? (luma > 180 ? "#000" : "#fff") : "var(--text-primary)";
  return { border, background, color };
}

function renderTagFilters(tagWrap: HTMLElement): void {
  tagWrap.innerHTML = "";
  TAGS.forEach(tag => {
    const key = tag.toLowerCase();
    const count = state.tagCounts[tag] || 0;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.tag = key;
    btn.textContent = count ? `${tag} (${count})` : tag;
    applyFilterChipChrome(btn, chipChrome(tag, state.selectedTags.has(key)), {
      padding: "3px 10px",
      fontWeight: state.selectedTags.has(key) ? "600" : "500",
      textTransform: "none"
    });
    btn.style.margin = "0 4px 4px 0";
    btn.addEventListener("click", () => {
      if (state.selectedTags.has(key)) {
        state.selectedTags.delete(key);
      } else {
        state.selectedTags.add(key);
      }
      renderTagFilters(tagWrap);
      applyFilter();
    });
    tagWrap.appendChild(btn);
  });
  if (state.selectedTags.size) {
    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "Reset";
    applyFilterChipChrome(reset, { border: "1px solid var(--accent-red)", background: "var(--accent-red)", color: "#fff" }, {
      padding: "3px 10px",
      fontWeight: "600",
      textTransform: "none"
    });
    reset.style.margin = "0 4px 4px 0";
    reset.addEventListener("click", () => {
      state.selectedTags.clear();
      renderTagFilters(tagWrap);
      applyFilter();
    });
    tagWrap.appendChild(reset);
  }
}

function renderCards(cardsEl: HTMLElement): void {
  cardsEl.innerHTML = "";
  const cards: HTMLElement[] = [];
  state.data.forEach(entry => {
    const tags = deriveTags(entry);
    const searchBlob = [
      entry.name,
      sanitizeCraftingHtml(entry.description),
      ...(entry.emotions || []).map(e => e.name)
    ].join(" ").toLowerCase();
    const card = document.createElement("div");
    card.className = "annoint-card";
    card.dataset.name = entry.name;
    card.dataset.search = searchBlob;
    card.dataset.tags = tags.map(t => t.toLowerCase()).join("|");
    card.style.background = "var(--bg-card)";
    card.style.border = "1px solid var(--border-color)";
    card.style.borderRadius = "6px";
    card.style.padding = "8px";
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.gap = "6px";

    const title = document.createElement("div");
    title.textContent = entry.name;
    title.style.fontWeight = "600";

    const emotionRow = document.createElement("div");
    emotionRow.style.display = "flex";
    emotionRow.style.flexWrap = "wrap";
    emotionRow.style.gap = "4px";
    (entry.emotions || []).forEach(emotion => {
      const chip = document.createElement("span");
      chip.style.display = "inline-flex";
      chip.style.alignItems = "center";
      chip.style.gap = "3px";
      chip.style.background = "var(--bg-tertiary)";
      chip.style.padding = "1px 6px";
      chip.style.borderRadius = "4px";
      chip.style.fontSize = "11px";
      if (emotion.image || emotion.imageLocal) {
        const img = document.createElement("img");
        img.src = TRANSPARENT_PLACEHOLDER;
        img.setAttribute("data-orig-src", emotion.imageLocal || emotion.image || "");
        img.style.width = "14px";
        img.style.height = "14px";
        img.style.objectFit = "contain";
        chip.appendChild(img);
      }
      chip.append(emotion.name);
      emotionRow.appendChild(chip);
    });

    const desc = document.createElement("div");
    desc.style.fontSize = "11px";
    desc.innerHTML = sanitizeCraftingHtml(entry.description);

    card.appendChild(title);
    if (emotionRow.childElementCount) {
      card.appendChild(emotionRow);
    }
    card.appendChild(desc);
    cardsEl.appendChild(card);
    cards.push(card);
  });
  state.cards = cards;
  bindImageFallback(cardsEl, ".annoint-card img", PLACEHOLDER_ICON, 0.5);
}

async function fetchAnnoints(): Promise<Annoint[]> {
  const payload = await (window as any).electronAPI.getAnnoints();
  if (!payload || payload.error) {
    throw new Error(payload?.error || "unknown error");
  }
  return (payload.annoints || []) as Annoint[];
}

export async function show(): Promise<void> {
  console.log('[Annoints] show() called');
  (window as any).__lastPanel = "annoints";
  const panel = ensurePanel();
  console.log('[Annoints] Panel element:', panel, 'ID:', panel.id, 'Display:', panel.style.display);
  panel.innerHTML = "<div class='no-mods'>Loading...</div>";
  try {
    console.log('[Annoints] Fetching data...');
    state.data = await fetchAnnoints();
    console.log('[Annoints] Fetched', state.data.length, 'annoints');
    state.tagCounts = Object.fromEntries(TAGS.map(tag => [tag, 0]));
    state.data.forEach(entry => {
      const tags = deriveTags(entry);
      tags.forEach(tag => {
        if (state.tagCounts[tag] != null) {
          state.tagCounts[tag] += 1;
        }
      });
    });
    console.log('[Annoints] Rendering...');
    render(panel);
    applyFilter();
    console.log('[Annoints] Render complete');
  } catch (err) {
    console.error('[Annoints] Error:', err);
    panel.innerHTML = `<div class='no-mods' style='color:var(--accent-red);'>Failed to load Annoints (${(err as Error).message})</div>`;
  }
}

export function hide(): void {
  if (state.panelEl) {
    state.panelEl.style.display = "none";
  }
}

function render(panel: HTMLElement): void {
  panel.innerHTML = "";
  const wrapper = document.createElement("div");
  wrapper.className = "page-inner annoints-view";
  wrapper.style.maxWidth = "980px";
  wrapper.style.margin = "0 auto";
  wrapper.style.display = "flex";
  wrapper.style.flexDirection = "column";
  wrapper.style.gap = "12px";

  const topbar = document.createElement("div");
  topbar.style.display = "flex";
  topbar.style.alignItems = "center";
  topbar.style.flexWrap = "wrap";
  topbar.style.gap = "8px";

  const countEl = document.createElement("span");
  countEl.id = "annointsCount";
  countEl.textContent = `Annoints (${state.data.length})`;

  const searchInput = document.createElement("input");
  searchInput.id = "annointsSearch";
  searchInput.type = "text";
  searchInput.placeholder = "Search annoints...";
  searchInput.style.flex = "1 1 240px";
  searchInput.style.minWidth = "200px";
  searchInput.style.padding = "3px 8px";
  searchInput.style.fontSize = "12px";
  searchInput.style.background = "var(--bg-tertiary)";
  searchInput.style.color = "var(--text-primary)";
  searchInput.style.border = "1px solid var(--border-color)";
  searchInput.style.borderRadius = "4px";

  const clearBtn = document.createElement("button");
  clearBtn.id = "annointsClear";
  clearBtn.type = "button";
  clearBtn.textContent = "Clear";
  applyFilterChipChrome(clearBtn, { border: "1px solid var(--border-color)", background: "var(--bg-tertiary)", color: "var(--text-primary)" }, {
    padding: "3px 10px",
    fontWeight: "500",
    textTransform: "none"
  });

  topbar.append(countEl, searchInput, clearBtn);

  const tagShell = document.createElement("div");
  tagShell.style.background = "var(--bg-secondary)";
  tagShell.style.padding = "8px";
  tagShell.style.borderRadius = "6px";

  const tagWrap = document.createElement("div");
  tagWrap.id = "annointsTagBar";
  tagWrap.style.display = "flex";
  tagWrap.style.flexWrap = "wrap";
  tagWrap.style.gap = "6px";
  tagShell.appendChild(tagWrap);

  const cards = document.createElement("div");
  cards.id = "annointsCards";
  cards.style.display = "grid";
  cards.style.gridTemplateColumns = "repeat(auto-fit, minmax(300px, 1fr))";
  cards.style.gap = "12px";
  cards.style.margin = "0 auto 16px";
  cards.style.width = "100%";
  cards.style.maxWidth = "980px";

  wrapper.append(topbar, tagShell, cards);
  panel.appendChild(wrapper);

  state.searchInput = searchInput;
  searchInput.addEventListener("input", () => scheduleFilter());

  clearBtn.addEventListener("click", () => {
    if (state.searchInput) {
      state.searchInput.value = "";
    }
    state.selectedTags.clear();
    renderTagFilters(tagWrap);
    applyFilter();
    state.searchInput?.focus();
  });

  renderCards(cards);
  renderTagFilters(tagWrap);
}

export function scheduleFilter(): void {
  if (state.searchTimer) {
    window.clearTimeout(state.searchTimer);
  }
  state.searchTimer = window.setTimeout(() => {
    applyFilter();
  }, 130);
}

export function applyFilter(): void {
  const query = (state.searchInput?.value || "").trim().toLowerCase();
  const tags = Array.from(state.selectedTags);
  let shown = 0;
  state.cards.forEach(card => {
    const blob = card.dataset.search || "";
    const tagList = (card.dataset.tags || "").split("|").filter(Boolean);
    const matchesQuery = !query || blob.includes(query);
    const matchesTags = !tags.length || tags.every(tag => tagList.includes(tag));
    card.style.display = matchesQuery && matchesTags ? "" : "none";
    if (matchesQuery && matchesTags) {
      shown += 1;
    }
  });
  const countEl = state.panelEl?.querySelector<HTMLSpanElement>("#annointsCount");
  const total = state.data.length;
  const label = !query && !tags.length ? `Annoints (${total})` : `Annoints (${shown} / ${total})`;
  if (countEl) {
    countEl.textContent = label;
  }
  if (state.panelEl) {
    state.panelEl.scrollTop = 0;
  }
}

export async function reload(): Promise<void> {
  const panel = ensurePanel();
  panel.innerHTML = "<div class='no-mods'>Reloading...</div>";
  try {
    state.data = await fetchAnnoints();
    state.tagCounts = Object.fromEntries(TAGS.map(tag => [tag, 0]));
    state.data.forEach(entry => {
      const tags = deriveTags(entry);
      tags.forEach(tag => {
        if (state.tagCounts[tag] != null) {
          state.tagCounts[tag] += 1;
        }
      });
    });
    render(panel);
    applyFilter();
  } catch (err) {
    panel.innerHTML = `<div class='no-mods' style='color:var(--accent-red);'>Reload failed (${(err as Error).message})</div>`;
  }
}
