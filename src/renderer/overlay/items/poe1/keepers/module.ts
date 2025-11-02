import { ensurePanel, setupItemsPanelUI, escapeHtml, highlightNumbers, getImagePath } from '../../shared/itemUtils';
import { bindImageFallback } from '../../../crafting/utils/imageFallback';
import { TRANSPARENT_PLACEHOLDER } from '../../../crafting/utils/imagePlaceholder';

type ErrorPayload = {
  error: string;
  filePath?: string;
};

type KeepersItemEntry = {
  name: string;
  slug: string;
  type?: string;
  category?: string;
  categorySlug?: string;
  description?: string;
  imageLocal?: string;
};

type KeepersItemsDataset = {
  slug?: string;
  total?: number;
  items?: KeepersItemEntry[];
};

type KeepersUniqueItem = {
  name: string;
  slug: string;
  baseType?: string;
  implicitMods?: string[];
  explicitMods?: string[];
  flavourText?: string[];
  imageLocal?: string;
};

type KeepersUniquesDataset = {
  slug?: string;
  total?: number;
  items?: KeepersUniqueItem[];
};

type KeepersGemItem = {
  name: string;
  slug: string;
  requiredLevel?: number;
  tags?: string[];
  color?: string | null;
  description?: string;
  imageLocal?: string;
};

type KeepersGemsDataset = {
  slug?: string;
  total?: number;
  items?: KeepersGemItem[];
};

type GraftItem = {
  name: string;
  slug: string;
  description?: string;
  mods?: string[];
  imageLocal?: string;
};

type GraftsDataset = {
  slug?: string;
  items?: GraftItem[];
};

type FoulbornUniqueItem = {
  name: string;
  slug: string;
  baseMods?: string[];
  mutatedMods?: string[];
  imageLocal?: string;
};

type FoulbornUniquesDataset = {
  slug?: string;
  total?: number;
  items?: FoulbornUniqueItem[];
};

type PassiveItem = {
  name: string;
  slug: string;
  passiveType?: string;
  groupLabel?: string | null;
  group?: string | null;
  mods?: string[];
  imageLocal?: string;
};

type PassiveSection = {
  title?: string;
  total?: number;
  items?: PassiveItem[];
};

type PassiveDataset = {
  slug?: string;
  total?: number;
  items?: PassiveItem[];
  sections?: PassiveSection[];
};

type KeepersPayload = {
  items?: KeepersItemsDataset | ErrorPayload;
  uniques?: KeepersUniquesDataset | ErrorPayload;
  gems?: KeepersGemsDataset | ErrorPayload;
  grafts?: GraftsDataset | ErrorPayload;
  foulbornUniques?: FoulbornUniquesDataset | ErrorPayload;
  bloodlineAscendancy?: PassiveDataset | ErrorPayload;
  foulbornPassives?: PassiveDataset | ErrorPayload;
  genesisTree?: PassiveDataset | ErrorPayload;
};

const state: {
  panelEl: HTMLElement | null;
  payload: KeepersPayload | null;
} = {
  panelEl: null,
  payload: null
};

let stylesInjected = false;

function isErrorDataset(value: unknown): value is ErrorPayload {
  return Boolean(value && typeof value === 'object' && 'error' in (value as Record<string, unknown>));
}

function unwrapDataset<T>(value: T | ErrorPayload | undefined): T | null {
  if (!value) return null;
  if (isErrorDataset(value)) return null;
  return value;
}

const GEM_COLOR_MAP: Record<string, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  int: 'Intelligence',
  str_dex: 'Str/Dex',
  str_int: 'Str/Int',
  dex_int: 'Dex/Int'
};

function injectStyles(): void {
  if (stylesInjected) return;
  const style = document.createElement('style');
  style.id = 'overlay-keepers-styles';
  style.textContent = `
  .keepers-root { padding: 16px; color: var(--text-primary); }
  .keepers-header { margin-bottom: 16px; }
  .keepers-header h1 { margin: 0 0 6px; font-size: 22px; font-weight: 600; }
  .keepers-header p { margin: 0; font-size: 13px; color: var(--text-secondary); }
  .keepers-nav { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
  .keepers-nav button { background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 12px; font-size: 12px; cursor: pointer; transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease; }
  .keepers-nav button:hover { border-color: var(--accent-blue); color: var(--accent-blue); }
  .keepers-nav button.active { background: var(--accent-blue); border-color: var(--accent-blue); color: #fff; }
  .keepers-section { margin-bottom: 32px; }
  .keepers-section h2 { margin: 0 0 8px; font-size: 18px; font-weight: 600; }
  .keepers-section .keepers-section-description { margin: 0 0 12px; font-size: 13px; color: var(--text-secondary); }
  .keepers-category-block { margin-bottom: 24px; }
  .keepers-category-block h3 { margin: 0 0 8px; font-size: 15px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }
  .keepers-card-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
  .keepers-gems-grid { display: grid; gap: 16px; grid-template-columns: repeat(2, 1fr); }
  .keepers-card { display: flex; gap: 10px; padding: 12px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-tertiary); }
  .keepers-gem-card { display: flex; gap: 16px; padding: 16px; border-radius: 8px; border: 1px solid rgba(120,144,156,0.3); background: linear-gradient(135deg, rgba(30,36,42,0.95), rgba(20,24,28,0.95)); box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
  .keepers-gem-card:hover { border-color: var(--accent-blue); background: linear-gradient(135deg, rgba(40,46,52,0.95), rgba(30,34,38,0.95)); transform: translateY(-2px); box-shadow: 0 6px 20px rgba(88,130,193,0.25); transition: all 0.2s ease; }
  .keepers-gem-card img { width: 96px; height: 96px; object-fit: contain; border-radius: 8px; background: rgba(255,255,255,0.03); padding: 8px; border: 1px solid rgba(255,255,255,0.1); flex-shrink: 0; }
  .keepers-gem-body { flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .keepers-gem-header { display: flex; flex-direction: column; gap: 4px; padding-bottom: 8px; border-bottom: 1px solid rgba(120,144,156,0.2); }
  .keepers-gem-name { font-size: 16px; font-weight: 600; color: #d4af37; line-height: 1.2; }
  .keepers-gem-description { font-size: 12px; color: rgba(255,255,255,0.75); line-height: 1.5; }
  .keepers-gem-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: auto; }
  .keepers-card { display: flex; gap: 10px; padding: 12px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-tertiary); }
  .keepers-gem-card:hover { border-color: var(--accent-blue); background: rgba(88,130,193,0.08); transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.3); transition: all 0.2s ease; }
  .keepers-card img { width: 56px; height: 56px; object-fit: contain; border-radius: 6px; background: rgba(255,255,255,0.04); }
  .keepers-card-body { flex: 1 1 auto; min-width: 0; }
  .keepers-item-name { font-size: 14px; font-weight: 600; margin-bottom: 2px; }
  .keepers-item-subtitle { font-size: 12px; color: var(--text-secondary); }
  .keepers-metadata { font-size: 11px; color: var(--text-secondary); margin-top: 6px; display: flex; flex-wrap: wrap; gap: 6px; }
  .keepers-chip { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; background: rgba(120,144,156,0.22); border: 1px solid rgba(120,144,156,0.4); font-size: 11px; color: var(--text-secondary); }
  .keepers-tag-chip { display: inline-flex; align-items: center; padding: 2px 6px; border-radius: 999px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; background: rgba(88,130,193,0.2); border: 1px solid rgba(88,130,193,0.35); color: var(--accent-blue); margin: 2px 4px 0 0; }
  .keepers-detail-grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
  .keepers-detail-card { padding: 14px; border-radius: 8px; border: 1px solid var(--border-color); background: linear-gradient(180deg, rgba(30,36,42,0.8), rgba(20,24,28,0.8)); display: flex; flex-direction: column; gap: 10px; }
  .keepers-detail-header { display: flex; gap: 12px; align-items: center; }
  .keepers-detail-header img { width: 64px; height: 64px; object-fit: contain; border-radius: 8px; background: rgba(255,255,255,0.05); }
  .keepers-detail-title { flex: 1 1 auto; min-width: 0; }
  .keepers-detail-title .keepers-item-name { font-size: 15px; margin-bottom: 4px; }
  .keepers-mod-block { margin-top: 6px; }
  .keepers-mod-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: var(--text-secondary); margin-bottom: 4px; }
  .keepers-mod-list { margin: 0; padding-left: 18px; color: var(--text-primary); font-size: 12px; }
  .keepers-mod-list li { margin-bottom: 3px; }
  .keepers-flavour { font-size: 12px; color: rgba(255,255,255,0.7); font-style: italic; border-left: 3px solid rgba(255,255,255,0.2); padding-left: 8px; }
  .keepers-error { padding: 12px; border-radius: 6px; border: 1px solid rgba(255,82,82,0.4); background: rgba(255,82,82,0.12); color: var(--accent-red); font-size: 12px; }
  .keepers-empty { padding: 12px; border-radius: 6px; border: 1px solid var(--border-color); background: rgba(255,255,255,0.02); color: var(--text-secondary); font-size: 12px; }
  .keepers-stat-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); margin-top: 16px; }
  .keepers-stat-card { padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); background: rgba(0,0,0,0.25); }
  .keepers-stat-value { font-size: 20px; font-weight: 600; margin-bottom: 4px; color: var(--accent-blue); }
  .keepers-stat-label { font-size: 12px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }
  .keepers-stat-hint { font-size: 11px; color: var(--text-secondary); margin-top: 4px; }
  .keepers-group { border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 12px; background: rgba(14,18,22,0.7); overflow: hidden; }
  .keepers-group summary { cursor: pointer; padding: 10px 12px; display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 600; color: var(--text-primary); background: rgba(255,255,255,0.02); }
  .keepers-group summary::-webkit-details-marker { display: none; }
  .keepers-group summary::marker { display: none; }
  .keepers-count { display: inline-flex; min-width: 24px; height: 20px; align-items: center; justify-content: center; border-radius: 10px; font-size: 11px; background: rgba(120,144,156,0.25); color: var(--text-secondary); }
  .keepers-group[open] summary { background: rgba(88,130,193,0.12); border-bottom: 1px solid rgba(88,130,193,0.3); }
  .keepers-group-body { padding: 12px; display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
  .keepers-passive-card { border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; background: rgba(255,255,255,0.03); display: flex; gap: 10px; align-items: flex-start; }
  .keepers-passive-card img { width: 52px; height: 52px; object-fit: contain; border-radius: 6px; background: rgba(255,255,255,0.05); }
  .keepers-passive-body { flex: 1 1 auto; min-width: 0; }
  .keepers-passive-name { font-size: 13px; font-weight: 600; margin-bottom: 2px; }
  .keepers-passive-meta { font-size: 11px; color: var(--text-secondary); display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 4px; }
  .keepers-variant-list { display: grid; gap: 10px; margin-top: 10px; }
  .keepers-variant-entry { border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; background: rgba(255,255,255,0.04); }
  .keepers-variant-entry .keepers-variant-title { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; color: var(--text-secondary); margin-bottom: 6px; }
  .keepers-variant-image { width: 56px; height: 56px; object-fit: contain; border-radius: 6px; background: rgba(255,255,255,0.05); margin-bottom: 6px; }
  @media (max-width: 768px) {
    .keepers-detail-grid { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
    .keepers-group-body { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
  }
  `;
  document.head?.appendChild(style);
  stylesInjected = true;
}

function createModList(mods?: string[]): HTMLElement {
  const list = document.createElement('ul');
  list.className = 'keepers-mod-list';
  if (!mods || !mods.length) {
    const li = document.createElement('li');
    li.textContent = 'No additional modifiers';
    list.appendChild(li);
    return list;
  }
  
  // Extract descriptions from mods FIRST (before displaying)
  const descriptions: string[] = [];
  const cleanedMods = mods.map(mod => {
    let cleanMod = mod;
    const matches = mod.match(/\([^)]{15,}\)/g);
    if (matches) {
      matches.forEach(match => {
        if (/\b(You|While|Grants|Elusive|your|you|if|when|the|The|are|have|is|cannot|grants|Cannot)\b/.test(match)) {
          descriptions.push(match.replace(/[()]/g, '').trim());
          // Remove the description AND any trailing bullet points/spaces
          cleanMod = cleanMod.replace(match, '').replace(/\s*•\s*$/, '').replace(/\s+$/, '').trim();
        }
      });
    }
    
    // Also check for standalone descriptive lines (not in parentheses)
    // Lines that start with Cannot, Grants, You, etc. and don't have numbers
    if (/^(Cannot|Grants|You|While|Enemies|Minions)\b/i.test(cleanMod) && !/\d/.test(cleanMod)) {
      descriptions.push(cleanMod);
      cleanMod = ''; // Remove entirely
    }
    
    return cleanMod;
  }).filter(m => m.length > 0); // Remove empty lines
  
  cleanedMods.forEach(mod => {
    const li = document.createElement('li');
    li.innerHTML = highlightNumbers(escapeHtml(mod));
    list.appendChild(li);
  });
  
  // Add Description tooltip item if we found any
  if (descriptions.length > 0) {
    const descLi = document.createElement('li');
    descLi.style.marginTop = '8px';
    descLi.style.padding = '4px 8px';
    descLi.style.background = 'rgba(100,100,100,0.15)';
    descLi.style.border = '1px solid rgba(150,150,150,0.3)';
    descLi.style.borderRadius = '4px';
    descLi.style.fontSize = '11px';
    descLi.style.color = 'rgba(200,200,200,0.7)';
    descLi.style.fontStyle = 'italic';
    descLi.style.cursor = 'help';
    descLi.style.textAlign = 'center';
    descLi.style.listStyle = 'none';
    descLi.textContent = 'Descriptions (hover)';
    
    // Create tooltip content
    const tooltip = document.createElement('div');
    tooltip.style.position = 'absolute';
    tooltip.style.display = 'none';
    tooltip.style.background = 'rgba(20,20,20,0.95)';
    tooltip.style.border = '1px solid rgba(200,200,200,0.5)';
    tooltip.style.borderRadius = '4px';
    tooltip.style.padding = '8px 12px';
    tooltip.style.fontSize = '12px';
    tooltip.style.color = 'rgba(220,220,220,0.9)';
    tooltip.style.maxWidth = '400px';
    tooltip.style.zIndex = '10000';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.whiteSpace = 'pre-wrap';
    tooltip.innerHTML = descriptions.map(d => `• ${escapeHtml(d)}`).join('\n\n');
    document.body.appendChild(tooltip);
    
    descLi.addEventListener('mouseenter', (e: MouseEvent) => {
      const rect = descLi.getBoundingClientRect();
      tooltip.style.display = 'block';
      tooltip.style.left = `${rect.left}px`;
      tooltip.style.top = `${rect.bottom + 5}px`;
    });
    
    descLi.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });
    
    list.appendChild(descLi);
  }
  
  return list;
}

function appendModsBlock(container: HTMLElement, title: string, mods?: string[]): void {
  if (!mods || !mods.length) return;
  const block = document.createElement('div');
  block.className = 'keepers-mod-block';
  const heading = document.createElement('div');
  heading.className = 'keepers-mod-title';
  heading.textContent = title;
  block.appendChild(heading);
  block.appendChild(createModList(mods));
  container.appendChild(block);
}

function createImage(localPath: string | undefined, alt: string, className = 'keepers-img'): HTMLImageElement {
  const img = document.createElement('img');
  img.className = className;
  img.alt = alt;
  img.src = TRANSPARENT_PLACEHOLDER;
  img.loading = 'lazy';
  img.decoding = 'async';
  
  // Use data-orig-src for IPC resolution, with poe1/ prefix
  if (localPath) {
    img.setAttribute('data-orig-src', `poe1/${localPath}`);
  }
  
  return img;
}

function renderDatasetError(sectionEl: HTMLElement, payload: ErrorPayload | undefined, context: string): void {
  const errorBox = document.createElement('div');
  errorBox.className = 'keepers-error';
  const message = payload?.error ? `Failed to load ${context}: ${payload.error}` : `No data available for ${context}.`;
  errorBox.textContent = message;
  if (payload?.filePath) {
    const detail = document.createElement('div');
    detail.style.marginTop = '6px';
    detail.style.fontSize = '11px';
    detail.style.opacity = '0.8';
    detail.textContent = payload.filePath;
    errorBox.appendChild(detail);
  }
  sectionEl.appendChild(errorBox);
}

function renderEmpty(sectionEl: HTMLElement, message: string): void {
  const box = document.createElement('div');
  box.className = 'keepers-empty';
  box.textContent = message;
  sectionEl.appendChild(box);
}

function renderItemsSection(sectionEl: HTMLElement, payload: KeepersPayload): void {
  const dataset = payload.items;
  if (isErrorDataset(dataset)) {
    renderDatasetError(sectionEl, dataset, 'Keepers items');
    return;
  }
  const allItems = dataset?.items ?? [];
  if (!allItems.length) {
    renderEmpty(sectionEl, 'No featured items found.');
    return;
  }

  // Filter out grafts since they have their own dedicated section
  const items = allItems.filter(item => item.category !== 'Grafts');

  const groups = new Map<string, { label: string; items: KeepersItemEntry[] }>();
  items.forEach(item => {
    const key = item.categorySlug || item.category || 'other';
    const label = item.category || (item.categorySlug ? item.categorySlug.replace(/_/g, ' ') : 'Miscellaneous');
    const normalized = label.trim() || 'Miscellaneous';
    if (!groups.has(key)) {
      groups.set(key, { label: normalized, items: [] });
    }
    groups.get(key)!.items.push(item);
  });

  Array.from(groups.values())
    .sort((a, b) => a.label.localeCompare(b.label))
    .forEach(group => {
      const bucket = document.createElement('div');
      bucket.className = 'keepers-category-block';
      const heading = document.createElement('h3');
      heading.textContent = `${group.label} (${group.items.length})`;
      bucket.appendChild(heading);

      const grid = document.createElement('div');
      grid.className = 'keepers-card-grid';

      group.items.sort((a, b) => a.name.localeCompare(b.name)).forEach(item => {
        const card = document.createElement('div');
        card.className = 'keepers-card';
        const img = createImage(item.imageLocal, item.name);
        card.appendChild(img);

        const body = document.createElement('div');
        body.className = 'keepers-card-body';
        const nameEl = document.createElement('div');
        nameEl.className = 'keepers-item-name';
        nameEl.textContent = item.name;
        body.appendChild(nameEl);
        if (item.type) {
          const typeEl = document.createElement('div');
          typeEl.className = 'keepers-item-subtitle';
          typeEl.textContent = item.type;
          body.appendChild(typeEl);
        }
        if (item.description) {
          const descEl = document.createElement('div');
          descEl.className = 'keepers-item-subtitle';
          descEl.style.marginTop = '6px';
          descEl.style.fontSize = '11px';
          descEl.style.color = 'var(--text-secondary)';
          descEl.innerHTML = highlightNumbers(escapeHtml(item.description));
          body.appendChild(descEl);
        }
        grid.appendChild(card);
        card.appendChild(body);
      });

      bucket.appendChild(grid);
      sectionEl.appendChild(bucket);
    });
}

function appendMetadataChips(container: HTMLElement, chips: string[]): void {
  if (!chips.length) return;
  const meta = document.createElement('div');
  meta.className = 'keepers-metadata';
  chips.forEach(text => {
    const chip = document.createElement('span');
    chip.className = 'keepers-chip';
    chip.textContent = text;
    meta.appendChild(chip);
  });
  container.appendChild(meta);
}

function renderUniquesSection(sectionEl: HTMLElement, payload: KeepersPayload): void {
  const dataset = payload.uniques;
  if (isErrorDataset(dataset)) {
    renderDatasetError(sectionEl, dataset, 'Keepers uniques');
    return;
  }
  const entries = dataset?.items ?? [];
  if (!entries.length) {
    renderEmpty(sectionEl, 'No league-specific uniques found.');
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'keepers-detail-grid';

  entries
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(item => {
      const card = document.createElement('div');
      card.className = 'keepers-detail-card';

      // Extract descriptions from mods first
      const descriptions: string[] = [];
      const allMods = [...(item.implicitMods || []), ...(item.explicitMods || [])];
      allMods.forEach(mod => {
        const matches = mod.match(/\([^)]{15,}\)/g);
        if (matches) {
          matches.forEach(match => {
            if (/\b(You|While|Grants|Elusive|your|you|if|when|the|The|are|have|is|cannot|grants|Cannot)\b/.test(match)) {
              const desc = match.replace(/[()]/g, '').trim();
              if (!descriptions.includes(desc)) {
                descriptions.push(desc);
              }
            }
          });
        }
        if (/^(Cannot|Grants|You|While|Enemies|Minions)\b/i.test(mod) && !/\d/.test(mod)) {
          if (!descriptions.includes(mod)) {
            descriptions.push(mod);
          }
        }
      });

      const header = document.createElement('div');
      header.className = 'keepers-detail-header';
      header.style.paddingBottom = '10px';
      header.style.borderBottom = '1px solid rgba(255,152,0,0.2)';
      
      const img = createImage(item.imageLocal, item.name);
      header.appendChild(img);

      const titleWrap = document.createElement('div');
      titleWrap.className = 'keepers-detail-title';
      const nameEl = document.createElement('div');
      nameEl.className = 'keepers-item-name';
      nameEl.textContent = item.name;
      titleWrap.appendChild(nameEl);
      if (item.baseType) {
        const baseEl = document.createElement('div');
        baseEl.className = 'keepers-item-subtitle';
        baseEl.textContent = item.baseType;
        titleWrap.appendChild(baseEl);
      }
      header.appendChild(titleWrap);
      
      // Add Details chip if descriptions exist
      if (descriptions.length > 0) {
        const detailsChip = document.createElement('div');
        detailsChip.style.display = 'inline-flex';
        detailsChip.style.alignItems = 'center';
        detailsChip.style.gap = '4px';
        detailsChip.style.padding = '4px 8px';
        detailsChip.style.background = 'rgba(255,152,0,0.15)';
        detailsChip.style.border = '1px solid rgba(255,152,0,0.4)';
        detailsChip.style.borderRadius = '4px';
        detailsChip.style.fontSize = '10px';
        detailsChip.style.fontWeight = '600';
        detailsChip.style.color = 'var(--accent-orange)';
        detailsChip.style.whiteSpace = 'nowrap';
        detailsChip.style.flexShrink = '0';
        detailsChip.style.cursor = 'help';
        detailsChip.innerHTML = `Details <span style="margin-left:2px;">⌵</span>`;
        
        // Create tooltip
        const tooltip = document.createElement('div');
        tooltip.style.position = 'absolute';
        tooltip.style.display = 'none';
        tooltip.style.background = 'rgba(20,20,20,0.95)';
        tooltip.style.border = '1px solid rgba(255,152,0,0.5)';
        tooltip.style.borderRadius = '6px';
        tooltip.style.padding = '10px 14px';
        tooltip.style.fontSize = '12px';
        tooltip.style.color = 'rgba(220,220,220,0.9)';
        tooltip.style.maxWidth = '400px';
        tooltip.style.zIndex = '10000';
        tooltip.style.pointerEvents = 'none';
        tooltip.style.whiteSpace = 'pre-wrap';
        tooltip.innerHTML = descriptions.map(d => `• ${escapeHtml(d)}`).join('\n\n');
        document.body.appendChild(tooltip);
        
        detailsChip.addEventListener('mouseenter', (e: MouseEvent) => {
          const rect = detailsChip.getBoundingClientRect();
          tooltip.style.display = 'block';
          tooltip.style.left = `${rect.left}px`;
          tooltip.style.top = `${rect.bottom + 5}px`;
        });
        
        detailsChip.addEventListener('mouseleave', () => {
          tooltip.style.display = 'none';
        });
        
        // Cleanup
        card.addEventListener('DOMNodeRemoved', () => {
          if (tooltip.parentNode) {
            tooltip.parentNode.removeChild(tooltip);
          }
        });
        
        header.appendChild(detailsChip);
      }
      
      card.appendChild(header);

      appendModsBlock(card, 'Implicit Mods', item.implicitMods);
      appendModsBlock(card, 'Explicit Mods', item.explicitMods);

      if (Array.isArray(item.flavourText) && item.flavourText.length) {
        const flavour = document.createElement('div');
        flavour.className = 'keepers-flavour';
        flavour.innerHTML = item.flavourText.map(line => escapeHtml(line)).join('<br/>');
        card.appendChild(flavour);
      }

      grid.appendChild(card);
    });

  sectionEl.appendChild(grid);
}

async function showGemDetail(gemSlug: string): Promise<void> {
  // Use the main gems module to show the full detail page with charts
  const gemsModule = await import('../../../character/poe1/gems/module.js');
  if (gemsModule && typeof gemsModule.showDetail === 'function') {
    gemsModule.showDetail(gemSlug);
  }
}

function renderGemsSection(sectionEl: HTMLElement, payload: KeepersPayload): void {
  const dataset = payload.gems;
  if (isErrorDataset(dataset)) {
    renderDatasetError(sectionEl, dataset, 'Keepers gems');
    return;
  }
  const gems = dataset?.items ?? [];
  
  // DEBUG: Log what we're getting
  console.log('Keepers Gems Dataset:', dataset);
  console.log('Keepers Gems Items:', gems);
  if (gems.length > 0) {
    console.log('First gem:', gems[0]);
    console.log('First gem description:', gems[0].description);
  }
  
  if (!gems.length) {
    renderEmpty(sectionEl, 'No new skill gems detected.');
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'keepers-gems-grid';

  gems
    .slice()
    .sort((a: KeepersGemItem, b: KeepersGemItem) => (a.requiredLevel ?? 0) - (b.requiredLevel ?? 0) || a.name.localeCompare(b.name))
    .forEach((gem: KeepersGemItem) => {
      const card = document.createElement('div');
      card.className = 'keepers-gem-card';
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => {
        if (gem.slug) {
          showGemDetail(gem.slug);
        }
      });
      
      const img = createImage(gem.imageLocal, gem.name);
      card.appendChild(img);

      const body = document.createElement('div');
      body.className = 'keepers-gem-body';
      
      // Header with name and description
      const header = document.createElement('div');
      header.className = 'keepers-gem-header';
      
      const nameEl = document.createElement('div');
      nameEl.className = 'keepers-gem-name';
      nameEl.textContent = gem.name;
      header.appendChild(nameEl);
      
      // Metadata chips below name
      const metaPieces: string[] = [];
      if (typeof gem.requiredLevel === 'number') {
        metaPieces.push(`Level ${gem.requiredLevel}`);
      }
      if (gem.color) {
        metaPieces.push(GEM_COLOR_MAP[gem.color] || gem.color.toUpperCase());
      }
      if (metaPieces.length) {
        const metaWrap = document.createElement('div');
        metaWrap.className = 'keepers-metadata';
        metaPieces.forEach(piece => {
          const chip = document.createElement('span');
          chip.className = 'keepers-chip';
          chip.textContent = piece;
          metaWrap.appendChild(chip);
        });
        header.appendChild(metaWrap);
      }
      
      body.appendChild(header);
      
      // Description
      console.log(`Gem ${gem.name} has description:`, gem.description);
      if (gem.description) {
        const descEl = document.createElement('div');
        descEl.className = 'keepers-gem-description';
        descEl.innerHTML = highlightNumbers(escapeHtml(gem.description));
        body.appendChild(descEl);
        console.log(`Added description element for ${gem.name}`);
      } else {
        console.log(`No description for ${gem.name}`);
      }
      
      // Tags at the bottom
      if (Array.isArray(gem.tags) && gem.tags.length) {
        const tagsWrap = document.createElement('div');
        tagsWrap.className = 'keepers-gem-tags';
        gem.tags.forEach((tag: string) => {
          const chip = document.createElement('span');
          chip.className = 'keepers-tag-chip';
          chip.textContent = tag;
          tagsWrap.appendChild(chip);
        });
        body.appendChild(tagsWrap);
      }
      
      card.appendChild(body);
      grid.appendChild(card);
    });

  sectionEl.appendChild(grid);
}

function renderGraftsSection(sectionEl: HTMLElement, payload: KeepersPayload): void {
  const dataset = payload.grafts;
  if (isErrorDataset(dataset)) {
    renderDatasetError(sectionEl, dataset, 'Grafts');
    return;
  }
  const items = dataset?.items ?? [];
  if (!items.length) {
    renderEmpty(sectionEl, 'No grafts recorded.');
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'keepers-card-grid';

  items
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(item => {
      const card = document.createElement('div');
      card.className = 'keepers-card';
      const img = createImage(item.imageLocal, item.name);
      card.appendChild(img);
      const body = document.createElement('div');
      body.className = 'keepers-card-body';
      const nameEl = document.createElement('div');
      nameEl.className = 'keepers-item-name';
      nameEl.textContent = item.name;
      body.appendChild(nameEl);
      if (item.description) {
        const descEl = document.createElement('div');
        descEl.className = 'keepers-item-subtitle';
        descEl.style.marginTop = '4px';
        descEl.style.fontSize = '11px';
        descEl.innerHTML = highlightNumbers(escapeHtml(item.description));
        body.appendChild(descEl);
      }
      appendModsBlock(body, 'Effects', item.mods);
      card.appendChild(body);
      grid.appendChild(card);
    });

  sectionEl.appendChild(grid);
}

function renderFoulbornUniquesSection(sectionEl: HTMLElement, payload: KeepersPayload): void {
  const dataset = payload.foulbornUniques;
  if (isErrorDataset(dataset)) {
    renderDatasetError(sectionEl, dataset, 'Foulborn uniques');
    return;
  }
  const entries = dataset?.items ?? [];
  if (!entries.length) {
    renderEmpty(sectionEl, 'No foulborn variants found.');
    return;
  }

  const grouped = new Map<string, { name: string; imageLocal?: string; variants: FoulbornUniqueItem[] }>();
  entries.forEach(item => {
    const key = item.name || item.slug;
    if (!grouped.has(key)) {
      grouped.set(key, { name: item.name || item.slug, imageLocal: item.imageLocal, variants: [] });
    }
    const group = grouped.get(key)!;
    const fingerprint = JSON.stringify({ base: item.baseMods, mutated: item.mutatedMods });
    const exists = group.variants.some(variant => JSON.stringify({ base: variant.baseMods, mutated: variant.mutatedMods }) === fingerprint);
    if (!exists) {
      group.variants.push(item);
    }
    if (!group.imageLocal && item.imageLocal) {
      group.imageLocal = item.imageLocal;
    }
  });

  Array.from(grouped.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(group => {
      const details = document.createElement('details');
      details.className = 'keepers-group';
      const summary = document.createElement('summary');
      const titleSpan = document.createElement('span');
      titleSpan.textContent = group.name;
      const count = document.createElement('span');
      count.className = 'keepers-count';
      count.textContent = String(group.variants.length);
      summary.appendChild(titleSpan);
      summary.appendChild(count);
      details.appendChild(summary);

      const body = document.createElement('div');
      body.className = 'keepers-group-body';

      group.variants
        .slice()
        .sort((a, b) => (a.mutatedMods?.join(' ') || '').localeCompare(b.mutatedMods?.join(' ') || ''))
        .forEach((variant, index) => {
          const card = document.createElement('div');
          card.className = 'keepers-variant-entry';
          if (variant.imageLocal && index === 0) {
            const img = createImage(variant.imageLocal, group.name, 'keepers-img keepers-variant-image');
            card.appendChild(img);
          }

          appendModsBlock(card, 'Base Mods', variant.baseMods);
          appendModsBlock(card, 'Mutated Mods', variant.mutatedMods);
          body.appendChild(card);
        });

      details.appendChild(body);
      sectionEl.appendChild(details);
    });
}

function renderPassiveDataset(sectionEl: HTMLElement, payload: PassiveDataset | ErrorPayload | undefined, context: string): void {
  if (isErrorDataset(payload)) {
    renderDatasetError(sectionEl, payload, context);
    return;
  }

  const collected: PassiveItem[] = [];
  if (Array.isArray(payload?.items)) {
    collected.push(...payload!.items!);
  }
  if (Array.isArray(payload?.sections)) {
    payload!.sections!.forEach(section => {
      if (Array.isArray(section.items)) {
        section.items.forEach(item => {
          collected.push({ ...item, groupLabel: item.groupLabel || section.title || item.group || null });
        });
      }
    });
  }

  if (!collected.length) {
    renderEmpty(sectionEl, `No ${context.toLowerCase()} data.`);
    return;
  }

  const groups = new Map<string, { label: string; items: PassiveItem[] }>();
  collected
    .filter(item => Array.isArray(item.mods) && item.mods.length > 0)  // Filter out empty entries
    .forEach(item => {
      const label = item.group || item.groupLabel || 'General';
      const key = label ? label.toString().toLowerCase() : 'general';
      if (!groups.has(key)) {
        groups.set(key, { label, items: [] });
      }
      groups.get(key)!.items.push(item);
    });

  Array.from(groups.values())
    .sort((a, b) => a.label.localeCompare(b.label))
    .forEach(group => {
      const details = document.createElement('details');
      details.className = 'keepers-group';
      const summary = document.createElement('summary');
      const titleSpan = document.createElement('span');
      titleSpan.textContent = group.label;
      const count = document.createElement('span');
      count.className = 'keepers-count';
      count.textContent = String(group.items.length);
      summary.appendChild(titleSpan);
      summary.appendChild(count);
      details.appendChild(summary);

      const body = document.createElement('div');
      body.className = 'keepers-group-body';

      group.items
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(item => {
          const card = document.createElement('div');
          card.className = 'keepers-passive-card';
          const img = createImage(item.imageLocal || undefined, item.name);
          card.appendChild(img);
          const passiveBody = document.createElement('div');
          passiveBody.className = 'keepers-passive-body';
          const nameEl = document.createElement('div');
          nameEl.className = 'keepers-passive-name';
          nameEl.textContent = item.name;
          passiveBody.appendChild(nameEl);

          const metaPieces: string[] = [];
          if (item.passiveType) {
            metaPieces.push(item.passiveType.charAt(0).toUpperCase() + item.passiveType.slice(1));
          }
          appendMetadataChips(passiveBody, metaPieces);
          appendModsBlock(passiveBody, 'Effects', item.mods);
          card.appendChild(passiveBody);
          body.appendChild(card);
        });

      details.appendChild(body);
      sectionEl.appendChild(details);
    });
}

function filterContent(searchQuery: string): void {
  const query = searchQuery.toLowerCase().trim();
  const allCards = document.querySelectorAll<HTMLElement>('.keepers-group, .keepers-item-card, .keepers-gem-card, .keepers-variant-entry, .keepers-passive-card');
  
  if (!query) {
    // Show all
    allCards.forEach(card => {
      card.style.display = '';
    });
    return;
  }
  
  allCards.forEach(card => {
    const text = card.textContent?.toLowerCase() || '';
    if (text.includes(query)) {
      card.style.display = '';
    } else {
      card.style.display = 'none';
    }
  });
}

function render(sectionEl: HTMLElement, payload: KeepersPayload): void {
  injectStyles();

  const root = document.createElement('div');
  root.className = 'keepers-root';

  const header = document.createElement('div');
  header.className = 'keepers-header';
  const title = document.createElement('h1');
  title.textContent = 'Keepers of the Flame';
  header.appendChild(title);
  const subtitle = document.createElement('p');
  subtitle.textContent = 'Curated data for the Keepers league: chase items, mutated uniques, passive trees, and more.';
  header.appendChild(subtitle);

  // Add search bar
  const searchContainer = document.createElement('div');
  searchContainer.style.cssText = 'display:flex; gap:8px; margin-top:12px; align-items:center;';
  
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.id = 'keepersSearch';
  searchInput.placeholder = 'Search items, gems, uniques, passives...';
  searchInput.style.cssText = 'flex:1; min-width:200px; padding:8px 10px; background:var(--bg-tertiary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:4px; font-size:13px;';
  
  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.textContent = 'Clear';
  clearButton.style.cssText = 'padding:8px 12px; background:var(--bg-tertiary); border:1px solid var(--border-color); color:var(--text-primary); border-radius:4px; font-size:13px; cursor:pointer;';
  clearButton.addEventListener('click', () => {
    searchInput.value = '';
    filterContent('');
  });
  
  searchInput.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    filterContent(target.value);
  });
  
  searchContainer.appendChild(searchInput);
  searchContainer.appendChild(clearButton);
  header.appendChild(searchContainer);
  
  root.appendChild(header);

  const sections = [
    { id: 'items', label: 'Curated Items', description: 'Key drops and currencies introduced with Keepers of the Flame.', render: (el: HTMLElement) => renderItemsSection(el, payload) },
    { id: 'uniques', label: 'Keepers Uniques', description: 'League-specific unique items and their notable modifiers.', render: (el: HTMLElement) => renderUniquesSection(el, payload) },
    { id: 'gems', label: 'Keepers Gems', description: 'New skill and support gems unlocked through the event.', render: (el: HTMLElement) => renderGemsSection(el, payload) },
    { id: 'grafts', label: 'Grafts', description: 'Breach grafts and their triggered abilities.', render: (el: HTMLElement) => renderGraftsSection(el, payload) },
    { id: 'foulborn-uniques', label: 'Foulborn Uniques', description: 'Mutated versions of classic uniques with alternate outcomes.', render: (el: HTMLElement) => renderFoulbornUniquesSection(el, payload) },
    { id: 'bloodline-ascendancy', label: 'Bloodline Ascendancy', description: 'Bloodline passives and class-specific paths.', render: (el: HTMLElement) => renderPassiveDataset(el, payload.bloodlineAscendancy, 'Bloodline ascendancy') },
    { id: 'foulborn-passives', label: 'Foulborn Passives', description: 'Genesis passive options tied to foulborn mechanics.', render: (el: HTMLElement) => renderPassiveDataset(el, payload.foulbornPassives, 'Foulborn passives') },
    { id: 'genesis-tree', label: 'Genesis Tree', description: 'Full passive tree for Genesis womb progress.', render: (el: HTMLElement) => renderPassiveDataset(el, payload.genesisTree, 'Genesis tree') }
  ];

  const nav = document.createElement('div');
  nav.className = 'keepers-nav';
  const sectionContainer = document.createElement('div');

  sections.forEach((entry, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = entry.label;
    if (index === 0) button.classList.add('active');
    button.addEventListener('click', () => {
      nav.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      const target = sectionContainer.querySelector<HTMLElement>(`[data-section="${entry.id}"]`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    nav.appendChild(button);
  });

  root.appendChild(nav);

  sections.forEach(entry => {
    const sectionWrapper = document.createElement('section');
    sectionWrapper.className = 'keepers-section';
    sectionWrapper.setAttribute('data-section', entry.id);
    const heading = document.createElement('h2');
    heading.textContent = entry.label;
    sectionWrapper.appendChild(heading);
    if (entry.description) {
      const desc = document.createElement('p');
      desc.className = 'keepers-section-description';
      desc.textContent = entry.description;
      sectionWrapper.appendChild(desc);
    }
    entry.render(sectionWrapper);
    sectionContainer.appendChild(sectionWrapper);
  });

  root.appendChild(sectionContainer);
  sectionEl.innerHTML = '';
  sectionEl.appendChild(root);

  bindImageFallback(sectionEl, 'img.keepers-img', TRANSPARENT_PLACEHOLDER);
}

export async function show(): Promise<void> {
  setupItemsPanelUI('itemsTab');
  const panel = ensurePanel();
  state.panelEl = panel;
  panel.style.display = '';
  panel.innerHTML = `<div class="no-mods">Loading Keepers data...</div>`;

  if (!window.electronAPI || typeof window.electronAPI.getPoe1Keepers !== 'function') {
    panel.innerHTML = `<div class="keepers-error">Keepers data is not available in this build.</div>`;
    return;
  }

  try {
    let payload = state.payload;
    if (!payload) {
      const data = await window.electronAPI.getPoe1Keepers();
      if (!data || typeof data !== 'object') {
        panel.innerHTML = `<div class="keepers-error">Failed to load Keepers datasets.</div>`;
        return;
      }
      payload = data as KeepersPayload;
      state.payload = payload;
    }
    render(panel, payload);
  } catch (err) {
    console.error('[Keepers] Failed to load datasets', err);
    panel.innerHTML = `<div class="keepers-error">An unexpected error occurred while loading Keepers data.</div>`;
  }
}

export async function reload(): Promise<void> {
  state.payload = null;
  await show();
}
