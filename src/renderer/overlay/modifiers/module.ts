// Modifier panel controller + render pipeline extracted from overlay.html
// Exposes a stable API used by overlay.html wrappers. No DOM structure changes.

export type ModifierData = {
  item?: {
    name?: string;
    baseType?: string;
    itemClass?: string;
    category?: string;
    quality?: { percent?: number; group?: string; tags?: string[] } | undefined;
    modifiers?: string[];
  };
  modifiers?: Array<any>;
};

// Simple helpers delegated from OverlayUtils if available
function highlightText(s: string){ return (window as any).OverlayUtils?.highlightText?.(s) ?? s; }
function formatJoinedModText(s: string){ return (window as any).OverlayUtils?.formatJoinedModText?.(s) ?? s; }

// Check if current category is an aggregated view that should show item type tags
function isAggregatedCategory(): boolean {
  const currentCategory = (window as any).currentModifierCategory;
  if (!currentCategory) return false;
  const AGGREGATED_CATEGORIES = ['ALL', 'DESECRATED', 'ESSENCE', 'CORRUPTED', 'SOCKETABLE', 'SOCKETABLES'];
  return AGGREGATED_CATEGORIES.includes(currentCategory.toUpperCase());
}

function renderSection(section: any, domainId?: string){
  const side = section.side || section.type || 'none';
  const sectionId = `section-${section.domain}-${side}`;
  const arrowId = `arrow-${sectionId}`;
  const mods: any[] = Array.isArray(section.mods) ? section.mods : [];
  const totalWeight = mods.reduce((sum: number, mod: any) => sum + (mod.weight || 0), 0);
  const maxIlvl = mods.reduce((max: number, mod: any) => Math.max(max, mod.ilvl || 0), 0);
  return `
  <div class="section-group domain-${section.domain}">
    <div class="section-header" ${domainId?`onclick=\"window.OverlayModifiers&&window.OverlayModifiers.toggleDomainFromSection&&window.OverlayModifiers.toggleDomainFromSection('${domainId}', '${arrowId}')\"`:''}>
      <div class="section-title">
        <span class="collapse-arrow" id="${arrowId}">▼</span>
        ${formatDomainName(section.domain)} ${side && side!=='none' ? '- ' + formatSideName(side) : ''}
      </div>
      <div class="section-count">${mods.length}</div>
    </div>
    <div class="section-content" id="${sectionId}">
      <div class="mod-list">
        ${mods.map((mod: any, modIndex: number) => `
          <div class="mod-item" id="mod-${section.domain}-${side}-${modIndex}" onclick="window.OverlayModifiers&&window.OverlayModifiers.toggleTiers&&window.OverlayModifiers.toggleTiers('${section.domain}', '${side}', ${modIndex})">
            <div class="mod-text" style="cursor:pointer;">
              ${highlightText(formatJoinedModText(mod.text || mod.text_plain))}
              ${mod.tiers && mod.tiers.length > 0 ? '<span class="expand-icon">▼</span>' : ''}
            </div>
            <div class="mod-meta">
              ${isAggregatedCategory() && mod.category ? `<span class="tag category-tag" data-tag="${mod.category}">${mod.category.replace(/_/g, ' ').toUpperCase()}</span>` : ''}
              ${mod.tags && mod.tags.length ? mod.tags.map((t:string)=>`<span class="tag" data-tag="${t}">${t}</span>`).join('') : ''}
              <span class="spacer"></span>
              ${mod.ilvl ? `<span class="mod-badge badge-ilvl">iLvl ${mod.ilvl}</span>` : ''}
              ${mod.tier ? `<span class="mod-badge badge-tier">T${mod.tier}</span>` : ''}
              ${mod.weight > 0 ? `<span class="mod-badge badge-weight" title="${totalWeight>0?((mod.weight/totalWeight)*100).toFixed(1):'0.0'}% of section">${mod.weight}</span>` : ''}
            </div>
            ${mod.tiers && mod.tiers.length > 0 ? `
              <div class="tier-list" id="tiers-${section.domain}-${side}-${modIndex}" style="display:none;">
                ${mod.tiers.map((tier:any, tierIndex:number)=>`
                  <div class="tier-item">
                    <div class="tier-line">
                      <span class="tier-name">${String(tier.tier_name||'').replace(/^\s*(?:i?l?v?l?\s*\d+|T?\d+)\s*[-:]?\s*/i,'')}</span>
                      <div class="tier-badges">
                        ${tier.tier_level ? `<span class="tier-badge tier-ilvl">iLvl ${tier.tier_level}</span>` : ''}
                        <span class="tier-badge tier-number">T${mod.tiers.length - tierIndex}</span>
                        ${tier.weight > 0 ? `<span class="tier-badge tier-weight" title="${(mod.weight && mod.weight>0 ? ((tier.weight/mod.weight)*100).toFixed(1) : '0.0')}% of mod">${tier.weight}</span>` : ''}
                      </div>
                    </div>
                    <div class="tier-text">${highlightText(formatJoinedModText(String(tier.text_plain || '')
                      // remove any leading ordinal/index like '1' or 'T1 -' or 'iLvl 83 -'
                      .replace(/^\s*(?:i?l?v?l?\s*\d+|T?\d+)\s*[-:]?\s*/i, '')
                      .replace(/^\s*\d+\s*(?:\r?\n|$)/, '')
                    ))}</div>
                  </div>
                `).join('')}
              </div>
            `: ''}
          </div>
        `).join('')}
        <div class="total-row">
          <div class="total-text">Total</div>
          <div class="total-meta">
            <span class="total-summary-tag" style="background: var(--accent-blue); color: #fff;">${maxIlvl}</span>
            <span class="total-summary-tag weight">${totalWeight}</span>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

export function mechanicsPostProcess(data: ModifierData){
  try{
    const catSlug = (data.item?.category || '').toUpperCase();
    if (catSlug === 'EXPEDITION_LOGBOOK') {
      (data.modifiers||[]).forEach(sec=>{
        (sec.mods||[]).forEach((m:any)=>{
          if (m.text_html && !m.text_html.includes('logbook-level')){
            const plainMatch = m.text_plain?.match(/^(\d+):\s*(.*)$/);
            if (plainMatch){
              const lvl = plainMatch[1];
              const restPlain = plainMatch[2];
              m.text_plain = restPlain;
              m.text_html = `<span class="logbook-level">${lvl}</span>${restPlain}`;
            }
          }
        })
      })
    }
    if (catSlug === 'STRONGBOX'){
      (data.modifiers||[]).forEach(sec=>{
        (sec.mods||[]).forEach((m:any)=>{
          if (m.text_html){
            m.text_html = m.text_html
              .replace(/\s+(Casts\s)/g,'<br>$1')
              .replace(/\s+(Guarded by)/gi,'<br>$1')
              .replace(/\s+(Summons\s)/g,'<br>$1')
              .replace(/\s+(Detonates\s)/g,'<br>$1');
          }
        })
      })
    }
    if (catSlug === 'STRONGBOX_UNIQUES'){
      (data.modifiers||[]).forEach(sec=>{
        (sec.mods||[]).forEach((m:any)=>{
          if (m.text_html){
            m.text_html = m.text_html
              .replace(/\s+(Guarded by)/gi,'<br>$1')
              .replace(/\s+(Casts\s)/g,'<br>$1');
            (m as any).isStrongboxUnique = true;
          }
        })
      })
    }
  } catch(e){ console.warn('Mechanics post-process failed', e); }
}

export function computeWhittling(data: ModifierData){
  try {
    if (!data || !data.item || !Array.isArray((data as any).item?.modifiers) || !data.modifiers) return null;
    // Detect catalyst quality on rings/amulets and determine affected tag set
    const quality = (data.item as any).quality || undefined;
    const qualityPct = quality && typeof quality.percent === 'number' ? quality.percent : 0;
    const qualityMul = qualityPct > 0 ? (1 + (qualityPct / 100)) : 1;
    const qualityTags: string[] = (quality && Array.isArray(quality.tags)) ? quality.tags : [];

    // Only consider explicit lines.
    // Rules:
    // - Exclude implicit/enchants/crafted/corrupted/rune markers
    // - Include desecrated and essence explicits
    // - Do NOT blanket-exclude lines containing the word "Socketed"
    // - Specifically ignore the special support lines like: "Socketed Gems are Supported by Level X <Support>"
    //   but KEEP essence explicit like: "#% increased effect of Socketed Items"
    const rawLines = Array.isArray((data as any).item?.modifiers) ? ((data as any).item.modifiers as string[]).slice() : [];
    const itemMods = rawLines
      .map(s => s.trim())
      .filter(Boolean)
      // Ignore only implicit/crafted/rune/corrupted markers; keep desecrated/essence, and allow 'Socketed Items'
      .filter(line => !/(implicit|enchant|crafted|corrupted|rune)/i.test(line))
      // Drop true socketed support lines, but not essence "effect of Socketed Items" lines
      .filter(line => !/^Socketed\s+(?:Gems|Attacks|Spells)\s+are\s+Supported\s+by\s+Level\s+\d+/i.test(line));
    if (itemMods.length === 0) return null;

    const stripMarkers = (s: string) => String(s)
      .replace(/\s*\((?:desecrated|crafted|essence|implicit|enchant|fractured|corrupted|socketed)\)\s*$/i, '')
      .replace(/\+\s*(?=\()/g, ''); // drop leading plus before ranges for key match
    const toPlaceholder = (s: string) => String(stripMarkers(s))
      .replace(/\d+(?:,\d{3})*(?:\.\d+)?/g, '#') // numbers -> '#'
      .replace(/\(implicit\)/ig, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    const toStem = (s: string) => String(stripMarkers(s))
      .toLowerCase()
      .replace(/[+%()#\d\-–]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const toNumbers = (s: string) => (String(s).match(/[+\-]?\d+(?:\.\d+)?/g) || []).map(x => Number(x.replace('+','')));
    // Decide if a given candidate mod is affected by quality based on its tags
    const modAffectedByQuality = (modTags: string[] | undefined, section: any) => {
      if (!qualityTags || qualityTags.length === 0) return false;
      // Consider both mod.tags and section-level tags if available
      const tagsList = Array.isArray(modTags) && modTags.length>0 ? modTags : (Array.isArray(section?.attributes)? section.attributes : []);
      if (!Array.isArray(tagsList) || tagsList.length === 0) return false;
      // Overlap between normalized tag sets
      const set = new Set(tagsList.map((t: string) => String(t).toLowerCase()));
      return qualityTags.some((t: string) => set.has(String(t).toLowerCase()));
    };
    const toNumbersWithoutLeading = (s: string, leading: number | undefined) => {
      const nums = toNumbers(s);
      if (nums.length > 0 && typeof leading === 'number' && nums[0] === Number(leading)) {
        return nums.slice(1);
      }
      return nums;
    };
    const extractRanges = (s: string) => {
      // Match things like (10–15), (4-7) using both en dash and hyphen
      const ranges: Array<{lo:number; hi:number}> = [];
      const re = /\((\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(String(s))) !== null) {
        ranges.push({ lo: Number(m[1]), hi: Number(m[2]) });
      }
      return ranges;
    };
    const rangeDistance = (vals: number[], ranges: Array<{lo:number;hi:number}>, focusIndex: number | null = null) => {
      if (!Array.isArray(vals) || !Array.isArray(ranges) || vals.length !== ranges.length) return Number.POSITIVE_INFINITY;
      let s = 0;
      for (let i=0;i<ranges.length;i++) {
        const v = vals[i];
        const { lo, hi } = ranges[i];
        if (v < lo) s += (lo - v);
        else if (v > hi) s += (v - hi);
        else {
          const mid = (lo + hi) / 2;
          s += Math.abs(v - mid) * 0.1; // slight preference toward center when inside range
        }
      }
      return s;
    };
    const chooseComponentIndex = (line: string, candKey: string, rangesLen: number) => {
      const l = String(line).toLowerCase();
      if (rangesLen <= 1) return null as any;
      // Heuristics: map by keywords in line
      const keys = [
        { kw: 'evasion', idx: 0 },
        { kw: 'energy shield', idx: 1 },
        { kw: 'armour', idx: 0 },
        { kw: 'ward', idx: 1 }
      ];
      for (const k of keys) {
        if (l.includes(k.kw)) return k.idx;
      }
      // If we can infer order from candidate key, prefer first
      return 0;
    };

    // Collect candidates by base key, keeping all tier variants with their ilvl and numbers
    const candByKey: Map<string, any[]> = new Map();
    const candByStem: Map<string, any[]> = new Map();
    const candList: any[] = [];
    const allowedDomains = new Set(['normal','essence','desecrated']);
    for (const section of (data.modifiers as any[])) {
      if (!(section && allowedDomains.has(section.domain) && (section.side === 'prefix' || section.side === 'suffix' || section.side === 'none'))) continue;
      for (const mod of section.mods || []) {
        const modName = (mod.text_plain || mod.text_html || 'Mod').toString();
        // Build key from the mod's base text (without tier-level), so it matches the item's explicit line
        const baseText = (mod.text_plain || mod.text_html || '').toString();
        const key = toPlaceholder(baseText);
        const stem = toStem(baseText);
        if (!key) continue;
        const arr = candByKey.get(key) || [];
        const arrStem = candByStem.get(stem) || [];
        const affected = modAffectedByQuality(mod.tags, section);
        if (Array.isArray(mod.tiers) && mod.tiers.length > 0) {
          for (let idx=0; idx<mod.tiers.length; idx++) {
            const t = mod.tiers[idx];
            const tText = (t.text_plain || t.text_html || '').toString();
            const nums = toNumbersWithoutLeading(tText, t.tier_level);
            const ranges = extractRanges(tText);
            const tierNumber = (mod.tiers.length - idx);
            const entry = { name: modName, ilvl: Number(t.tier_level || 0), nums, ranges, tierNumber, key, stem, tags: mod.tags || [], affectedByQuality: affected };
            arr.push(entry);
            arrStem.push(entry);
            candList.push(entry);
          }
        } else {
          const nums = toNumbers(baseText);
          const entry = { name: modName, ilvl: Number(mod.ilvl || 0), nums, ranges: extractRanges(baseText), tierNumber: undefined, key, stem, tags: mod.tags || [], affectedByQuality: affected };
          arr.push(entry);
          arrStem.push(entry);
          candList.push(entry);
        }
        candByKey.set(key, arr);
        candByStem.set(stem, arrStem);
      }
    }
    if (candByKey.size === 0) return null;

    const matched: Array<{name:string; ilvl:number; tier?:number; suspect?:boolean; qualityAdjusted?:boolean}> = [];
    const ignoredFractured: string[] = [];
    for (const rawLine of itemMods) {
      const line = stripMarkers(rawLine);
      const key = toPlaceholder(line);
      const stem = toStem(line);
      let nums = toNumbers(line);
      // Skip fractured lines in matching but collect for tooltip
      if (/\(fractured\)/i.test(rawLine)) {
        ignoredFractured.push(rawLine);
        continue;
      }
      let variants: any[] = candByKey.get(key) || [];
      if (variants.length === 0) {
        // Fallback 1: stem-based match (ignores numbers, punctuation)
        variants = (candByStem.get(stem) || []);
        // Fallback 2: substring fuzzy across keys and stems
        if (variants.length === 0) {
          const near = candList.filter(c => c.key.includes(key) || key.includes(c.key) || c.stem.includes(stem) || stem.includes(c.stem));
          variants = near;
        }
        if (variants.length === 0) continue;
      }
      // Unified scoring that handles equal-length ranges, numeric-only, and component focus for multi-component candidates
      const scoreVariant = (v: any) => {
        if (Array.isArray(v.ranges) && v.ranges.length > 0) {
          if (v.ranges.length === nums.length) return rangeDistance(nums, v.ranges);
          // If candidate has multiple components, compare to the most likely component
          const idx = chooseComponentIndex(line, v.key || '', v.ranges.length);
          if (idx != null && v.ranges[idx]) return rangeDistance([nums[0]], [v.ranges[idx]]);
          // else take min distance among components as a fallback
          const dists = v.ranges.map((r: any) => rangeDistance([nums[0]], [r]));
          return Math.min.apply(null, dists as any);
        }
        // No ranges: numeric distance over available components
        const n = Math.max(((v.nums?.length)||0), nums.length);
        let s = 0;
        for (let i=0;i<n;i++) s += Math.abs((((v.nums)||[])[i]||0) - (nums[i]||0));
        return s;
      };

      // If this line maps to variants that are affected by quality, unscale the numbers before scoring
      const anyAffected = variants.some(v => v.affectedByQuality);
      let scaledBackNums = nums;
      if (anyAffected && qualityMul !== 1) {
        // divide each observed number by multiplier and round to nearest tenth to reduce float noise
        scaledBackNums = nums.map(n => Math.round((n / qualityMul) * 10) / 10);
      }
      const scoreVariantWithNums = (v: any) => {
        const keep = nums; // keep for composite suspicion later
        nums = scaledBackNums;
        const s = scoreVariant(v);
        nums = keep;
        return s;
      };
      const best = variants.slice().sort((a,b) => scoreVariantWithNums(a) - scoreVariantWithNums(b))[0];
      if (best) {
        // Composite suspicion: if value exceeds single-mod max across tiers
        let suspect = false;
        const familyMax = (() => {
          const fam = variants;
          let m = -Infinity;
          for (const v of fam) {
            if (Array.isArray(v.ranges) && v.ranges.length>0) {
              for (const r of v.ranges) m = Math.max(m, r.hi);
            }
            for (const n of (v.nums||[])) m = Math.max(m, n||0);
          }
          return m;
        })();
        // If quality applied, re-evaluate composite suspicion on de-scaled number
        let observed = nums[0];
        if (anyAffected && qualityMul !== 1 && typeof observed === 'number') {
          observed = Math.round((observed / qualityMul) * 10) / 10;
        }
        if (isFinite(familyMax) && typeof observed === 'number' && observed > (familyMax as number) + 0.5) suspect = true;
        matched.push({ name: line, ilvl: best.ilvl, tier: best.tierNumber, suspect, qualityAdjusted: anyAffected && qualityMul !== 1 });
      }
    }
    if (matched.length === 0) return null;

    const minIlvl = matched.reduce((m, x) => Math.min(m, (x.ilvl as number) || Infinity), Infinity);
    if (!isFinite(minIlvl)) return null;
    const lowest = matched.filter(m => ((m.ilvl as number) || 0) === minIlvl);
    return { ilvl: minIlvl, mods: lowest, all: matched, ignoredFractured };
  } catch {
    return null;
  }
}

export function renderFilteredContent(data: any){
  const content = document.getElementById('content');
  const searchTerm = (document.getElementById('search-input') as HTMLInputElement | null)?.value?.toLowerCase() || '';
  const activeTags = Array.from(document.querySelectorAll('.filter-tag.active')).map(el => el.getAttribute('data-tag') || (el.textContent||'').replace(/ \(\d+\)$/,''));
  
  // Get active domain filter (radio button behavior)
  let activeDomain = 'all'; // default to show all
  const domainMappings = {
    'toggleAll': 'all',
    'toggleBase': 'base',
    'toggleDesecrated': 'desecrated', 
    'toggleEssence': 'essence',
    'toggleCorrupted': 'corrupted'
  };
  
  // Find which domain button is active
  Object.entries(domainMappings).forEach(([buttonId, domain]) => {
    const btn = document.getElementById(buttonId);
    if (btn && btn.classList.contains('active')) {
      activeDomain = domain;
    }
  });
  
  console.log('Active domain filter:', activeDomain);
  
  const currentAttribute = (document.querySelector('.attribute-btn.active') as HTMLElement | null)?.dataset.attr;
    const attributeMetaAvailable = Array.isArray(data?.modifiers) && data.modifiers.some((sec:any) =>
      (sec && Array.isArray(sec.attributes)) || (sec && Array.isArray(sec.mods) && sec.mods.some((m:any) => Array.isArray(m.attributes)))
    );

  // attributeMetaAvailable is computed later for the filters bar and reused here
  const cat = data?.item?.category || '';
  const categoryHasAttribute = /_(str_dex|str_int|dex_int|str|dex|int)$/i.test(cat);

  let filteredData = { ...data } as any;
  
  // Debug: log all available domains and their sections
  console.log('=== DOMAIN DEBUG ===');
  (data.modifiers || []).forEach((section: any, i: number) => {
    const domain = section.domain || 'undefined';
    const side = section.side || section.type || 'none';
    const modCount = (section.mods || []).length;
    console.log(`Section ${i}: domain="${domain}", side="${side}", mods=${modCount}`);
  });
  
  const noFilters = (!searchTerm || searchTerm.length === 0) && activeTags.length === 0 && (!currentAttribute || categoryHasAttribute || !attributeMetaAvailable) && activeDomain === 'all';
  if (noFilters) {
    filteredData.modifiers = data.modifiers;
  } else {
    filteredData.modifiers = data.modifiers
      .filter((section:any) => {
        // Filter by domain if a specific domain is selected
        if (activeDomain !== 'all') {
          const sectionDomain = String(section.domain || '').toLowerCase();
          // Normalize known special domains set
          const special = new Set(['desecrated','essence','corrupted']);

          if (activeDomain === 'base') {
            // Show any section that is NOT one of the special domains
            // Includes empty/undefined/"base"/"normal" and any unknown domain that isn't special
            return !special.has(sectionDomain);
          }

          // Other domains must match exactly
          return sectionDomain === activeDomain;
        }
        return true;
      })
      .map((section:any) => {
        const filteredMods = section.mods.filter((mod:any) => {
          const matchesSearch = !searchTerm ||
            (mod.text && String(mod.text).toLowerCase().includes(searchTerm)) ||
            (mod.text_plain && String(mod.text_plain).toLowerCase().includes(searchTerm));
          const matchesTags = activeTags.length === 0 || (mod.tags && activeTags.every(t => mod.tags.includes(t)));
          let matchesAttribute = true;
          if (currentAttribute && attributeMetaAvailable && !categoryHasAttribute) {
            matchesAttribute = (
              (mod.attributes && mod.attributes.includes(currentAttribute)) ||
              (section.attributes && section.attributes.includes(currentAttribute))
            );
          }
          return matchesSearch && matchesTags && matchesAttribute;
        });
        return { ...section, mods: filteredMods };
      }).filter((section:any) => section.mods.length > 0);
  }

  const groupedByDomain: Record<string, any> = {};
  for (const sec of (filteredData.modifiers||[])){
    const d = sec.domain || 'other';
    const side = sec.side || sec.type || 'none';
    if (!groupedByDomain[d]) groupedByDomain[d] = { prefix:null, suffix:null, none:null, list:[] as any[] };
    if (side === 'prefix') groupedByDomain[d].prefix = sec;
    else if (side === 'suffix') groupedByDomain[d].suffix = sec;
    else if (!groupedByDomain[d].none) groupedByDomain[d].none = sec;
    groupedByDomain[d].list.push(sec);
  }
  // Build filters bar (tags + optional attribute buttons)
  const prevActive = new Set(activeTags);
  const prevAttr = currentAttribute || '';
  const tagCounts: Record<string, number> = {};
  (data.modifiers||[]).forEach((section:any)=>{
    (section.mods||[]).forEach((m:any)=>{
      (m.tags||[]).forEach((t:string)=>{ tagCounts[t] = (tagCounts[t]||0)+1; });
    })
  });
  const sortedTags = Object.keys(tagCounts).sort((a,b)=> a.localeCompare(b));
  // attributeMetaAvailable already computed above
  const attrButtons = attributeMetaAvailable ? ['str','dex','int'] : [];
  // Colored chip helpers similar to other panels
  const tagRGB = (tag: string) => {
    const t=(tag||'').toLowerCase();
    if (t==='fire' || t==='life') return [220,68,61];
    if (t==='cold' || t==='mana') return [66,165,245];
    if (t==='lightning') return [255,213,79];
    if (t==='chaos' || t==='minion') return [156,39,176];
    if (t==='energy shield' || t==='es') return [38,198,218];
    if (t==='defences' || t==='armour' || t==='armor') return [109,76,65];
    if (t==='evasion') return [46,125,50];
    if (t==='resistances' || t==='resist') return [255,112,67];
    if (t==='projectile') return [255,179,0];
    if (t==='area') return [171,71,188];
    if (t==='critical' || t==='crit') return [255,179,0];
    if (t==='spell') return [92,107,192];
    if (t==='attack') return [121,85,72];
    if (t==='damage' || t==='ailments' || t==='mechanics') return [96,125,139];
    if (t==='speed' || t==='movement') return [67,160,71];
    if (t==='elemental') return [255,152,0];
    return [120,144,156];
  };
  const chipCss = (tag: string, active: boolean) => {
    const [r,g,b] = tagRGB(tag);
    const bg = active ? `rgba(${r},${g},${b},0.9)` : `rgba(${r},${g},${b},0.22)`;
    const border = `rgba(${r},${g},${b},0.6)`;
    const luma = 0.2126*r+0.7152*g+0.0722*b;
    const color = active ? (luma>180? '#000':'#fff') : 'var(--text-primary)';
    return `padding:2px 8px; font-size:11px; border:1px solid ${border}; border-radius:999px; background:${bg}; color:${color}; cursor:pointer;`;
  };
  const filtersHtml = `
    <div id="filtersBar" style="display:flex; flex-direction:column; gap:8px; margin:6px 0 10px;">
      ${attrButtons.length? `<div style="display:flex; gap:6px; align-items:center;"><span style="font-size:11px; color:var(--text-secondary);">Attribute</span>${attrButtons.map(a=>`<button class="attribute-btn${prevAttr===a?' active':''}" data-attr="${a}" style="padding:2px 8px; font-size:11px; border:1px solid var(--border-color); border-radius:999px; background:${prevAttr===a?'var(--accent-blue)':'var(--bg-tertiary)'}; color:${prevAttr===a?'#fff':'var(--text-primary)'}; cursor:pointer;">${a.toUpperCase()}</button>`).join('')}</div>` : ''}
      <div style="display:flex; flex-wrap:wrap; gap:6px;">
        ${sortedTags.map(t=>`<button class="filter-tag${prevActive.has(t)?' active':''}" data-tag="${t}" style="${chipCss(t, prevActive.has(t))}">${t} (${tagCounts[t]||0})</button>`).join('')}
      </div>
    </div>`;

  const html = Object.entries(groupedByDomain).map(([domain, domainSections]: any[]) => {
    const hasPrefix = (domainSections as any).prefix;
    const hasSuffix = (domainSections as any).suffix;
    const hasNone = (domainSections as any).none;
    if (hasPrefix || hasSuffix) {
      const domainId = `domain-${domain}`;
      return `
        <div class="domain-container">
          <div class="domain-sections open" id="${domainId}">
            ${hasPrefix ? renderSection(hasPrefix, domainId) : '<div></div>'}
            ${hasSuffix ? renderSection(hasSuffix, domainId) : '<div></div>'}
          </div>
        </div>`;
    }
    const domainId = `domain-${domain}`;
    return `
      <div class="domain-container">
        <div class="domain-sections open" id="${domainId}">
          ${renderSection((hasNone || ((domainSections as any).list && (domainSections as any).list[0]) || { mods: [] }), domainId)}
        </div>
      </div>`;
  }).join('');

  if (content) (content as HTMLElement).innerHTML = filtersHtml + html;
  // Wire filter interactions
  try {
    document.querySelectorAll('#filtersBar .filter-tag').forEach(chip=>{
      chip.addEventListener('click', ()=>{
        chip.classList.toggle('active');
        // re-render with new active tag set
        if((window as any).originalData) renderFilteredContent((window as any).originalData);
      });
    });
    document.querySelectorAll('#filtersBar .attribute-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const isActive = btn.classList.contains('active');
        document.querySelectorAll('#filtersBar .attribute-btn').forEach(b=> b.classList.remove('active'));
        if (!isActive) btn.classList.add('active');
        if((window as any).originalData) renderFilteredContent((window as any).originalData);
      });
    });
  } catch {}
}

export function patchCreateModItem(){
  const _orig: any = (window as any).createModItem;
  if (typeof _orig === 'function'){
    (window as any).createModItem = function(mod:any, section:any){
      const el = _orig(mod, section);
      if ((mod as any).isStrongboxUnique) el.classList.add('strongbox-unique');
      if (/^\d+:/.test(mod.text_plain) && mod.text_html && mod.text_html.indexOf('logbook-level')>-1){
        el.querySelectorAll('.logbook-level').forEach((p:any)=>{
          if (!p.dataset.enhanced){
            p.dataset.enhanced='1';
            if (!/Area Level/i.test(p.textContent)){
              const label = document.createElement('span');
              label.textContent='Area Level';
              label.className='label';
              p.appendChild(label);
            }
          }
        })
      }
      return el;
    }
  }
}

export function clearAllFilters(){
  const search = document.getElementById('search-input') as HTMLInputElement | null; if (search) search.value='';
  document.querySelectorAll('.filter-tag.active').forEach(chip=>{
    chip.classList.remove('active');
    const any = chip as any;
    if(any && any.style){ any.style.background='var(--bg-tertiary)'; any.style.color='var(--text-primary)'; }
  })
  document.querySelectorAll('.attribute-btn.active').forEach(btn=> btn.classList.remove('active'));
  
  // Clear domain filters - reset to "All" (only "All" button active)
  const domainButtons = ['toggleAll', 'toggleBase', 'toggleDesecrated', 'toggleEssence', 'toggleCorrupted'];
  domainButtons.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      if (id === 'toggleAll') {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
  });
  
  if((window as any).originalData) renderFilteredContent((window as any).originalData);
}

// Small helpers duplicated from dist to keep UI wiring working
export function formatDomainName(domain: string){
  if(!domain) return 'Other';
  const d = String(domain).toLowerCase();
  if(d==='prefix') return 'Prefix'; if(d==='suffix') return 'Suffix';
  if(d==='local') return 'Local'; if(d==='explicit') return 'Explicit'; if(d==='implicit') return 'Implicit';
  return d.charAt(0).toUpperCase()+d.slice(1);
}
export function formatSideName(side: string){
  if(!side) return 'None';
  const s = String(side).toLowerCase();
  if(s==='prefix') return 'Prefix'; if(s==='suffix') return 'Suffix'; if(s==='none') return 'Other';
  return s.charAt(0).toUpperCase()+s.slice(1);
}
export function toggleDomainFromSection(domainId: string, arrowId: string){
  const wrap = document.getElementById(domainId); if(!wrap) return;
  const arrow = document.getElementById(arrowId); if(!arrow) return;
  const isOpen = wrap.classList.contains('open');
  if(isOpen){ wrap.classList.remove('open'); (arrow as any).textContent='►'; }
  else { wrap.classList.add('open'); (arrow as any).textContent='▼'; }
  ensureDomainCollapseStyles();
}
export function toggleTiers(domain: string, side: string, modIndex: number){
  const id = `tiers-${domain}-${side}-${modIndex}`;
  const el = document.getElementById(id) as HTMLElement | null; if(!el) return;
  const isHidden = el.style.display==='none';
  el.style.display = isHidden ? '' : 'none';
}

function ensureDomainCollapseStyles(){
  const id = 'modifier-domain-collapse-styles';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = `
    .domain-sections { transition:height .18s ease, padding .18s ease; }
    .domain-sections:not(.open) .section-content { display:none; }
    .domain-sections:not(.open) .collapse-arrow { transform:rotate(-90deg); display:inline-block; }
    .domain-sections .collapse-arrow { transition:transform .18s ease; }
  `;
  document.head.appendChild(style);
}
