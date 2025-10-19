import { applyFilterChipChrome, type ChipChrome } from "../../../utils";
import { bindImageFallback } from "../../../crafting/utils/imageFallback";
import { TRANSPARENT_PLACEHOLDER } from "../../../crafting/utils/imagePlaceholder";
import { resolveLocalImage } from "../../../crafting/utils/localImage";

type RawOil = {
  name?: string;
  slug?: string;
  image?: string;
  imageLocal?: string;
};

type RawAmulet = {
  slug?: string;
  oils?: RawOil[];
  result?: { name?: string };
  effects?: string[];
};

type RawRing = {
  slug?: string;
  oils?: RawOil[];
  title?: string;
};

type RawPayload = {
  error?: string;
  amulets?: { items?: RawAmulet[]; [key: string]: any } | { error?: string };
  rings?: { items?: RawRing[]; [key: string]: any } | { error?: string };
};

type AnointmentEntry = {
  slug: string;
  itemType: "amulet" | "ring";
  name: string;
  oils: RawOil[];
  effects: string[];
  tags: string[];
  searchBlob: string;
};

type State = {
  panelEl: HTMLElement | null;
  data: AnointmentEntry[];
  cards: HTMLElement[];
  tagButtons: HTMLElement[];
  searchInput: HTMLInputElement | null;
  selectedTags: Set<string>;
  searchTimer: number | null;
};

const state: State = {
  panelEl: null,
  data: [],
  cards: [],
  tagButtons: [],
  searchInput: null,
  selectedTags: new Set<string>(),
  searchTimer: null
};

const curatedTags = [
  "Amulet",
  "Ring",
  "Tower",
  "Retaliation",
  "Damage",
  "Defences",
  "Attributes",
  "Life",
  "Mana",
  "Energy Shield",
  "Resistances",
  "Critical",
  "Speed",
  "Area",
  "Projectile",
  "Spell",
  "Attack",
  "Minion",
  "Mechanics",
  "Flask",
  "Charges",
  "Fire",
  "Cold",
  "Lightning",
  "Chaos"
];

function ensurePanel(): HTMLElement {
  if (state.panelEl && document.body.contains(state.panelEl)) {
    return state.panelEl;
  }
  const existing = document.getElementById("craftingPanel") as HTMLElement | null;
  if (existing) {
    state.panelEl = existing;
    return existing;
  }
  const el = document.createElement("div");
  el.id = "craftingPanel";
  el.className = "content";
  el.style.padding = "8px";
  const footer = document.getElementById("footer");
  if (footer && footer.parentNode) {
    footer.parentNode.insertBefore(el, footer);
  }
  state.panelEl = el;
  return el;
}

function setCharacterTabActive(): void {
  const tabMod = document.getElementById("tabModifier") as HTMLElement | null;
  const tabHist = document.getElementById("tabHistory") as HTMLElement | null;
  const craftingTab = document.getElementById("craftingTab") as HTMLElement | null;
  const itemsTab = document.getElementById("itemsTab") as HTMLElement | null;
  const charTab = document.getElementById("characterTab") as HTMLElement | null;
  const contentMod = document.getElementById("content") as HTMLElement | null;
  const contentHist = document.getElementById("historyContent") as HTMLElement | null;

  if (tabMod) {
    tabMod.classList.remove("active");
    tabMod.style.background = "var(--bg-tertiary)";
    tabMod.style.color = "var(--text-primary)";
  }
  if (tabHist) {
    tabHist.classList.remove("active");
    tabHist.style.background = "var(--bg-tertiary)";
    tabHist.style.color = "var(--text-primary)";
  }
  if (craftingTab) {
    craftingTab.style.background = "var(--bg-tertiary)";
    craftingTab.style.color = "var(--text-primary)";
  }
  if (itemsTab) {
    itemsTab.style.background = "var(--bg-tertiary)";
    itemsTab.style.color = "var(--text-primary)";
  }
  if (charTab) {
    charTab.style.background = "var(--accent-blue)";
    charTab.style.color = "#fff";
  }
  if (contentMod) contentMod.style.display = "none";
  if (contentHist) contentHist.style.display = "none";
  document.getElementById("modifierHeaderInfo")?.setAttribute("style", "display:none");
  document.getElementById("whittlingInfo")?.setAttribute("style", "display:none");
  const ann = document.getElementById("annointsPanel");
  if (ann) (ann as HTMLElement).style.display = "none";
  document.body.classList.add("crafting-mode");
}

function escapeHtml(input: string): string {
  return (input || "").replace(/[&<>"]|'/g, (match) => {
    switch (match) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return match;
    }
  });
}

function escapeAttr(input: string): string {
  return escapeHtml(input);
}

function deriveTags(entry: AnointmentEntry): string[] {
  const tags = new Set<string>();
  const text = `${entry.name} ${entry.effects.join(" ")}`.toLowerCase();
  if (entry.itemType === "amulet") tags.add("Amulet");
  if (entry.itemType === "ring") tags.add("Ring");
  if (text.includes("tower")) tags.add("Tower");
  if (text.includes("retaliation") || text.includes("counter")) tags.add("Retaliation");
  if (/damage|hit|harm/.test(text)) tags.add("Damage");
  if (/armour|armor|block|ward|fortify|defence|defense|mitigation/.test(text)) tags.add("Defences");
  if (/attribute|strength|dexterity|intelligence/.test(text)) tags.add("Attributes");
  if (text.includes("life")) tags.add("Life");
  if (text.includes("mana")) tags.add("Mana");
  if (/energy shield|es\b/.test(text)) tags.add("Energy Shield");
  if (/resist/.test(text)) tags.add("Resistances");
  if (/crit/.test(text)) tags.add("Critical");
  if (/speed/.test(text)) tags.add("Speed");
  if (/area/.test(text)) tags.add("Area");
  if (/projectile/.test(text)) tags.add("Projectile");
  if (/spell/.test(text)) tags.add("Spell");
  if (/attack/.test(text)) tags.add("Attack");
  if (/minion|summon|sentinel|scout/.test(text)) tags.add("Minion");
  if (/trap|totem|tower|mechanic|ballista/.test(text)) tags.add("Mechanics");
  if (/flask|tincture/.test(text)) tags.add("Flask");
  if (/charge/.test(text)) tags.add("Charges");
  if (/ignite|burning|fire/.test(text)) tags.add("Fire");
  if (/chill|freeze|cold/.test(text)) tags.add("Cold");
  if (/shock|lightning/.test(text)) tags.add("Lightning");
  if (/chaos/.test(text)) tags.add("Chaos");
  return Array.from(tags);
}

function tagRGB(tag: string): [number, number, number] {
  const t = tag.toLowerCase();
  if (t === "amulet") return [139, 195, 74];
  if (t === "ring") return [126, 87, 194];
  if (t === "tower") return [255, 193, 7];
  if (t === "retaliation") return [255, 112, 67];
  if (t === "damage") return [239, 83, 80];
  if (t === "defences") return [120, 144, 156];
  if (t === "attributes") return [32, 178, 170];
  if (t === "life") return [229, 57, 53];
  if (t === "mana") return [66, 165, 245];
  if (t === "energy shield") return [38, 198, 218];
  if (t === "resistances") return [255, 167, 38];
  if (t === "critical") return [255, 179, 0];
  if (t === "speed") return [102, 187, 106];
  if (t === "area") return [171, 71, 188];
  if (t === "projectile") return [255, 202, 40];
  if (t === "spell") return [92, 107, 192];
  if (t === "attack") return [121, 85, 72];
  if (t === "minion") return [156, 39, 176];
  if (t === "mechanics") return [96, 125, 139];
  if (t === "flask") return [0, 188, 212];
  if (t === "charges") return [100, 221, 23];
  if (t === "fire") return [244, 81, 30];
  if (t === "cold") return [41, 121, 255];
  if (t === "lightning") return [255, 213, 79];
  if (t === "chaos") return [123, 31, 162];
  return [120, 120, 120];
}

function chipChrome(tag: string, active: boolean): ChipChrome {
  const [r, g, b] = tagRGB(tag);
  const background = active ? `rgba(${r},${g},${b},0.9)` : `rgba(${r},${g},${b},0.2)`;
  const border = `1px solid rgba(${r},${g},${b},0.6)`;
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const color = active ? (luma > 180 ? "#000" : "#fff") : "var(--text-primary)";
  return { border, background, color };
}

function normalizePayload(payload: RawPayload | undefined): AnointmentEntry[] {
  const entries: AnointmentEntry[] = [];
  if (!payload || payload.error) return entries;

  const amuletItems = payload.amulets && typeof payload.amulets === "object" && "items" in payload.amulets && Array.isArray((payload.amulets as any).items)
    ? (payload.amulets as any).items as RawAmulet[]
    : [];
  for (const item of amuletItems) {
    const name = item?.result?.name || item?.slug || "Unknown Anointment";
    const oils = Array.isArray(item?.oils) ? item.oils : [];
    const effects = Array.isArray(item?.effects) ? item.effects : [];
    const entry: AnointmentEntry = {
      slug: item?.slug || name,
      itemType: "amulet",
      name,
      oils,
      effects,
      tags: [],
      searchBlob: ""
    };
    const oilNames = oils.map((o) => o.name || "").join(" ");
    entry.searchBlob = `${name} ${effects.join(" ")} ${oilNames}`.toLowerCase();
    entry.tags = deriveTags(entry);
    entries.push(entry);
  }

  const ringItems = payload.rings && typeof payload.rings === "object" && "items" in payload.rings && Array.isArray((payload.rings as any).items)
    ? (payload.rings as any).items as RawRing[]
    : [];
  for (const item of ringItems) {
    const title = item?.title || item?.slug || "Unknown Ring Anointment";
    const oils = Array.isArray(item?.oils) ? item.oils : [];
    const entry: AnointmentEntry = {
      slug: item?.slug || title,
      itemType: "ring",
      name: title,
      oils,
      effects: [],
      tags: [],
      searchBlob: ""
    };
    const oilNames = oils.map((o) => o.name || "").join(" ");
    entry.searchBlob = `${title} ${oilNames}`.toLowerCase();
    entry.tags = deriveTags(entry);
    entries.push(entry);
  }

  return entries;
}

function buildTagList(): { label: string; count: number }[] {
  const tagCounts = new Map<string, number>();
  for (const entry of state.data) {
    for (const tag of entry.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }
  const curatedSet = new Set(curatedTags);
  const dynamicTags = Array.from(tagCounts.keys()).filter((tag) => !curatedSet.has(tag)).sort();
  const ordered = curatedTags.filter((tag) => (tagCounts.get(tag) || 0) > 0);
  const fullList = [...ordered, ...dynamicTags];
  return fullList.map((label) => ({ label, count: tagCounts.get(label) || 0 }));
}

function renderTags(container: HTMLElement): void {
  const tags = buildTagList();
  container.innerHTML = tags.map(({ label, count }) => {
    const key = label.toLowerCase();
    return `<button class="poe1-anoint-tag" data-tag="${escapeAttr(key)}" data-label="${escapeAttr(label)}">${escapeHtml(label)} <span style='opacity:.75;'>(${count})</span></button>`;
  }).join(" ");
  state.tagButtons = Array.from(container.querySelectorAll<HTMLElement>(".poe1-anoint-tag"));
  state.tagButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = (btn.getAttribute("data-tag") || "").toLowerCase();
      if (!key) return;
      if (state.selectedTags.has(key)) {
        state.selectedTags.delete(key);
      } else {
        state.selectedTags.add(key);
      }
      updateTagStyles();
      applyFilter();
    });
  });
  updateTagStyles();
}

function updateTagStyles(): void {
  state.tagButtons.forEach((btn) => {
    const key = (btn.getAttribute("data-tag") || "").toLowerCase();
    const label = btn.getAttribute("data-label") || key;
    const active = state.selectedTags.has(key);
    applyFilterChipChrome(btn as HTMLElement, chipChrome(label, active), { padding: '3px 10px', fontWeight: active ? '600' : '500' });
    btn.style.margin = '0 4px 4px 0';
  });
}

function renderCards(container: HTMLElement): void {
  const cardsHtml = state.data.map((entry) => {
    const tagsAttr = entry.tags.map((tag) => tag.toLowerCase()).join("|");
    const oilsHtml = entry.oils.map((oil) => {
      const resolved = oil.imageLocal ? resolveLocalImage(`poe1/${oil.imageLocal}`, oil.image) : (oil.image || "");
      const icon = resolved
        ? `<img src="${TRANSPARENT_PLACEHOLDER}" data-orig-src="${escapeAttr(resolved)}" alt="" style="width:24px;height:24px;object-fit:contain;">`
        : `<div style='width:24px;height:24px;'></div>`;
      return `<div style='display:flex; align-items:center; gap:6px; background:var(--bg-secondary); border-radius:4px; padding:2px 6px; font-size:11px;'>${icon}<span>${escapeHtml(oil.name || "")}</span></div>`;
    }).join(" ");
    const effectsHtml = entry.effects.map((effect) => `<div style='font-size:11px; line-height:1.45;'>${escapeHtml(effect)}</div>`).join("");
    const tagChips = entry.tags.map((tag) => {
      const [r, g, b] = tagRGB(tag);
      return `<span style='display:inline-block; padding:1px 4px; margin:2px; font-size:9px; border-radius:3px; background:rgba(${r},${g},${b},0.18); border:1px solid rgba(${r},${g},${b},0.45); color:var(--text-primary);'>${escapeHtml(tag)}</span>`;
    }).join(" ");
    return `
      <div class="poe1-anoint-card" data-tags="${escapeAttr(tagsAttr)}" data-search="${escapeAttr(entry.searchBlob)}" style='display:flex; flex-direction:column; gap:8px; border:1px solid var(--border-color); border-radius:6px; background:var(--bg-card); padding:8px;'>
        <div style='display:flex; align-items:center; gap:8px;'>
          <span style='font-weight:600; font-size:13px;'>${escapeHtml(entry.name)}</span>
        </div>
        <div style='display:flex; flex-wrap:wrap; gap:6px;'>${oilsHtml}</div>
        ${effectsHtml ? `<div>${effectsHtml}</div>` : ""}
        ${tagChips ? `<div style='margin-top:auto;'>${tagChips}</div>` : ""}
      </div>
    `;
  }).join("");
  container.innerHTML = cardsHtml;
  state.cards = Array.from(container.querySelectorAll<HTMLElement>(".poe1-anoint-card"));
  const fallbackSvg = "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><rect width='24' height='24' rx='4' fill='#222'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#555' font-size='10' font-family='sans-serif'>?</text></svg>";
  bindImageFallback(container, ".poe1-anoint-card img", fallbackSvg, 0.5);
}

export function render(dataset?: AnointmentEntry[]): void {
  if (Array.isArray(dataset)) {
    state.data = dataset;
  }
  const panel = ensurePanel();
  const total = state.data.length;
  const wrapper = `
    <div style='max-width:980px; margin:0 auto; display:flex; flex-direction:column; gap:12px;'>
      <div style='display:flex; flex-wrap:wrap; gap:8px; align-items:center;'>
        <span id='poe1AnointsCount'>Anointments (${total})</span>
        <input id='poe1AnointsSearch' type='text' placeholder='Search anointments...' style='flex:1 1 240px; min-width:200px; font-size:12px; padding:4px 8px; border:1px solid var(--border-color); border-radius:4px; background:var(--bg-tertiary); color:var(--text-primary);'>
        <button id='poe1AnointsReset' class='pin-btn' style='padding:4px 10px;'>Reset</button>
      </div>
      <div style='background:var(--bg-secondary); padding:8px; border-radius:6px;'>
        <div id='poe1AnointsTags' style='display:flex; flex-wrap:wrap; gap:6px; justify-content:center;'></div>
      </div>
      <div id='poe1AnointsCards' style='display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:12px;'></div>
    </div>
  `;
  panel.innerHTML = wrapper;

  state.selectedTags.clear();
  state.searchInput = panel.querySelector("#poe1AnointsSearch") as HTMLInputElement | null;
  const tagContainer = panel.querySelector("#poe1AnointsTags") as HTMLElement | null;
  const cardsContainer = panel.querySelector("#poe1AnointsCards") as HTMLElement | null;

  if (tagContainer) renderTags(tagContainer);
  if (cardsContainer) renderCards(cardsContainer);

  state.searchInput?.addEventListener("input", () => scheduleFilter());
  const resetBtn = panel.querySelector("#poe1AnointsReset") as HTMLButtonElement | null;
  resetBtn?.addEventListener("click", () => {
    if (state.searchInput) {
      state.searchInput.value = "";
    }
    state.selectedTags.clear();
    updateTagStyles();
    applyFilter();
    state.searchInput?.focus();
  });
}

function scheduleFilter(): void {
  if (state.searchTimer) {
    window.clearTimeout(state.searchTimer);
  }
  state.searchTimer = window.setTimeout(() => {
    applyFilter();
  }, 120);
}

export function applyFilter(): void {
  const query = (state.searchInput?.value || "").trim().toLowerCase();
  const activeTags = Array.from(state.selectedTags);
  let shown = 0;
  state.cards.forEach((card) => {
    const blob = card.getAttribute("data-search") || "";
    const tags = (card.getAttribute("data-tags") || "")
      .split("|")
      .map((val) => val.trim())
      .filter(Boolean);
    const matchesQuery = !query || blob.includes(query);
    const matchesTags = !activeTags.length || activeTags.every((tag) => tags.includes(tag));
    (card as HTMLElement).style.display = matchesQuery && matchesTags ? "" : "none";
    if (matchesQuery && matchesTags) {
      shown += 1;
    }
  });
  const total = state.data.length;
  const countEl = state.panelEl?.querySelector("#poe1AnointsCount") as HTMLElement | null;
  if (countEl) {
    const label = query || activeTags.length ? `Anointments (${shown} / ${total})` : `Anointments (${total})`;
    countEl.textContent = label;
  }
  try {
    const panel = state.panelEl || ensurePanel();
    panel.scrollTop = 0;
  } catch {}
}

export async function reload(): Promise<void> {
  const panel = ensurePanel();
  const loader = document.createElement("div");
  loader.className = "no-mods";
  loader.textContent = "Reloading...";
  panel.innerHTML = "";
  panel.appendChild(loader);
  try {
    const payload = await (window as any).electronAPI.getPoe1Anointments?.();
    if (!payload || payload.error) {
      panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load Anointments (${escapeHtml(payload?.error || "unknown")})</div>`;
      return;
    }
    state.data = normalizePayload(payload);
    render();
    applyFilter();
  } catch (err: any) {
    panel.innerHTML = `<div style='color:var(--accent-red);'>Reload failed (${escapeHtml(err?.message || String(err))})</div>`;
  }
}

export async function show(): Promise<void> {
  (window as any).__lastPanel = "poe1-anointments";
  setCharacterTabActive();
  const panel = ensurePanel();
  panel.style.display = "";
  panel.innerHTML = `<div class='no-mods'>Loading Anointments...</div>`;
  setTimeout(() => { panel.scrollTop = 0; }, 10);
  try {
    const payload = await (window as any).electronAPI.getPoe1Anointments?.();
    if (!payload || payload.error) {
      panel.innerHTML = `<div style='color:var(--accent-red);'>Failed to load Anointments (${escapeHtml(payload?.error || "unknown")})</div>`;
      return;
    }
    state.data = normalizePayload(payload);
    if (!state.data.length) {
      panel.innerHTML = `<div class='no-mods'>No anointments found.</div>`;
      return;
    }
    render();
    applyFilter();
  } catch (err: any) {
    panel.innerHTML = `<div style='color:var(--accent-red);'>Exception loading Anointments (${escapeHtml(err?.message || String(err))})</div>`;
  }
}
