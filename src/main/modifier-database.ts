import * as fs from 'fs';
import * as path from 'path';
import { promises as fsp } from 'fs';
import { getVersionConfig, getVirtualCategories, isBaseDomain, type OverlayGameVersion } from './config/modifierVersionConfig.js';

export interface ModifierData {
    domain: string;
    side: string;
    family_name: string;
    section_name: string;
    mods: Array<{
        category?: string;
        text_html: string;
        text_plain: string;
        tier?: number;
        weight: number;
        weight_pct: number;
        ilvl?: number;
        tags: string[];
        modal_id?: string;
        family_name?: string;
        tiers?: Array<{
            tier_name: string;
            tier_level: number;
            text_html: string;
            text_plain: string;
            weight: number;
            weight_pct: number;
        }>;
    }>;
}

export class ModifierDatabase {
    private jsonCache: Map<string, any> = new Map();
    private dataPath: string;
    private gameVersion: OverlayGameVersion;

    constructor(dataPath: string, autoLoad: boolean = true, gameVersion: OverlayGameVersion = 'poe2') {
        this.dataPath = dataPath;
        this.gameVersion = gameVersion;
        if (autoLoad) {
            this.loadFromJson();
        }
    }

    setDataPath(newPath: string) {
        if (newPath && newPath !== this.dataPath) {
            this.dataPath = newPath;
        }
    }

    setGameVersion(version: OverlayGameVersion) {
        this.gameVersion = version;
    }

    getDataPath(): string {
        return this.dataPath;
    }

    reload() {
        this.jsonCache.clear();
        this.loadFromJson();
    }

    private loadFromJson() {
        try {
            console.log(`Attempting to load JSON from: ${this.dataPath}`);
            if (!fs.existsSync(this.dataPath)) {
                console.warn(`Data path does not exist: ${this.dataPath}`);
                return;
            }

            const files = fs.readdirSync(this.dataPath);
            console.log(`Found ${files.length} files in data directory`);
            
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const category = file.replace('.json', '');
                    const filePath = path.join(this.dataPath, file);
                    console.log(`Loading JSON file: ${filePath}`);
                    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    if (category === 'Bases') {
                        // Skip loading into modifier cache; handled via dedicated IPC for items tab.
                        this.jsonCache.set(category, raw); // still store raw for retrieval if desired
                        console.log('Stored Bases dataset (not treated as modifier category)');
                        continue;
                    }
                    // Support two shapes:
                    // 1) Flat array of mod rows (legacy + mechanics we emit as array)
                    // 2) Object with a top-level key (e.g. Liquid_Emotions.json) we ignore for aggregated logic
                    if (Array.isArray(raw)) {
                        this.jsonCache.set(category, raw);
                        console.log(`Loaded category ${category} with ${raw.length} items`);
                    } else if (raw && Array.isArray(raw.emotions)) {
                        // Special handling for Liquid Emotions – treat each emotion as a single 'mod' row surrogate
                        const mapped = raw.emotions.map((e: any) => ({
                            category,
                            domain: 'normal',
                            side: 'none',
                            text_html: e.explicitMods?.join('<br>') || e.enchantMods?.join('<br>') || e.name,
                            text_plain: (e.explicitMods?.join(' | ') || e.enchantMods?.join(' | ') || e.name) || '',
                            tier: null,
                            ilvl: null,
                            weight: 0,
                            weight_pct: 0,
                            tags: ['emotion'],
                            modal_id: null,
                            family_name: null,
                            tiers: []
                        }));
                        this.jsonCache.set(category, mapped);
                        console.log(`Loaded category ${category} (emotions mapped) with ${mapped.length} items`);
                    } else if (raw && Array.isArray(raw.omens)) {
                        // Omens: treat each omen as a single mod row with explicit mods joined
                        const mapped = raw.omens.map((o: any) => ({
                            category,
                            domain: 'omen',
                            side: 'none',
                            text_html: `<strong>${o.name}</strong><br>${(o.explicitMods||[]).join('<br>')}`,
                            text_plain: [o.name, ...(o.explicitMods||[])].join(' | '),
                            tier: null,
                            ilvl: null,
                            weight: 0,
                            weight_pct: 0,
                            tags: ['omen'],
                            modal_id: null,
                            family_name: null,
                            tiers: []
                        }));
                        this.jsonCache.set(category, mapped);
                        console.log(`Loaded category ${category} (omens mapped) with ${mapped.length} items`);
                    } else if (raw && raw.gems && typeof raw.gems === 'object') {
                        // Gems: flatten all gem groups into a single domain with tag for group
                        const groups = raw.gems;
                        const flat: any[] = [];
                        for (const grp of Object.keys(groups)) {
                            const arr = groups[grp] || [];
                            arr.forEach((g: any) => {
                                flat.push({
                                    category,
                                    domain: 'gem',
                                    side: 'none',
                                    text_html: `<strong>${g.name}</strong><br>${g.description||''}`,
                                    text_plain: [g.name, g.description || ''].join(' - ').trim(),
                                    tier: null,
                                    ilvl: null,
                                    weight: 0,
                                    weight_pct: 0,
                                    tags: ['gem', grp, ...(g.tags||[])],
                                    modal_id: null,
                                    family_name: null,
                                    tiers: []
                                });
                            });
                        }
                        this.jsonCache.set(category, flat);
                        console.log(`Loaded category ${category} (gems flattened) with ${flat.length} items`);
                    } else {
                        // Unsupported shape – store empty to avoid crashes
                        this.jsonCache.set(category, []);
                        console.log(`Loaded category ${category} with 0 items (unrecognized shape)`);
                    }
                }
            }
            
            console.log(`Loaded ${this.jsonCache.size} categories from JSON files`);
        } catch (error) {
            console.error('Error loading JSON files:', error);
        }
    }

    /**
     * Asynchronous, incremental loader so UI (splash) can update while files are processed.
     * @param onProgress optional callback receiving human readable status text
     */
    async loadAsync(onProgress?: (msg: string) => void) {
        try {
            if (!fs.existsSync(this.dataPath)) {
                onProgress?.('Data path missing');
                return;
            }
            const files = (await fsp.readdir(this.dataPath)).filter(f => f.endsWith('.json'));
            const total = files.length;
            let processed = 0;
            onProgress?.(`Loading modifiers (0/${total})`);
            for (const file of files) {
                try {
                    const category = file.replace('.json','');
                    const filePath = path.join(this.dataPath, file);
                    const rawTxt = await fsp.readFile(filePath, 'utf8');
                    const raw = JSON.parse(rawTxt);
                    if (category === 'Bases') {
                        this.jsonCache.set(category, raw);
                    } else if (Array.isArray(raw)) {
                        this.jsonCache.set(category, raw);
                    } else if (raw && Array.isArray(raw.emotions)) {
                        const mapped = raw.emotions.map((e: any) => ({
                            category,
                            domain: 'normal',
                            side: 'none',
                            text_html: e.explicitMods?.join('<br>') || e.enchantMods?.join('<br>') || e.name,
                            text_plain: (e.explicitMods?.join(' | ') || e.enchantMods?.join(' | ') || e.name) || '',
                            tier: null,
                            ilvl: null,
                            weight: 0,
                            weight_pct: 0,
                            tags: ['emotion'],
                            modal_id: null,
                            family_name: null,
                            tiers: []
                        }));
                        this.jsonCache.set(category, mapped);
                    } else if (raw && Array.isArray(raw.omens)) {
                        const mapped = raw.omens.map((o: any) => ({
                            category,
                            domain: 'omen',
                            side: 'none',
                            text_html: `<strong>${o.name}</strong><br>${(o.explicitMods||[]).join('<br>')}`,
                            text_plain: [o.name, ...(o.explicitMods||[])].join(' | '),
                            tier: null,
                            ilvl: null,
                            weight: 0,
                            weight_pct: 0,
                            tags: ['omen'],
                            modal_id: null,
                            family_name: null,
                            tiers: []
                        }));
                        this.jsonCache.set(category, mapped);
                    } else if (raw && raw.gems && typeof raw.gems === 'object') {
                        const groups = raw.gems; const flat: any[] = [];
                        for (const grp of Object.keys(groups)) {
                            for (const g of groups[grp] || []) {
                                flat.push({
                                    category,
                                    domain: 'gem',
                                    side: 'none',
                                    text_html: `<strong>${g.name}</strong><br>${g.description||''}`,
                                    text_plain: [g.name, g.description || ''].join(' - ').trim(),
                                    tier: null,
                                    ilvl: null,
                                    weight: 0,
                                    weight_pct: 0,
                                    tags: ['gem', grp, ...(g.tags||[])],
                                    modal_id: null,
                                    family_name: null,
                                    tiers: []
                                });
                            }
                        }
                        this.jsonCache.set(category, flat);
                    } else {
                        this.jsonCache.set(category, []);
                    }
                } catch (e) {
                    console.warn('Failed loading', file, e);
                }
                processed++;
                if (processed % 3 === 0 || processed === total) {
                    onProgress?.(`Loading modifiers (${processed}/${total})`);
                }
                // Yield so splash can repaint
                await new Promise(r => setTimeout(r, 0));
            }
            onProgress?.(`Loaded ${this.jsonCache.size} categories`);
        } catch (e) {
            console.error('Async load error', e);
            onProgress?.('Modifier load failed');
        }
    }

    /**
     * Asynchronous loader that only loads categories matching enabled patterns.
     * Used by feature selection to avoid loading disabled categories.
     * @param enabledCategories Array of category names or patterns (e.g., "Body_Armours_*")
     * @param onProgress Optional progress callback
     */
    async loadAsyncFiltered(enabledCategories: string[], onProgress?: (msg: string) => void) {
        try {
            if (!fs.existsSync(this.dataPath)) {
                onProgress?.('Data path missing');
                return;
            }

            const allFiles = (await fsp.readdir(this.dataPath)).filter(f => f.endsWith('.json'));
            
            // Filter files by pattern matching
            const filesToLoad = allFiles.filter(file => {
                const category = file.replace('.json', '');
                return this.matchesEnabledPattern(category, enabledCategories);
            });

            const total = filesToLoad.length;
            let processed = 0;
            
            onProgress?.(`Loading ${total}/${allFiles.length} enabled categories...`);

            for (const file of filesToLoad) {
                try {
                    const category = file.replace('.json','');
                    const filePath = path.join(this.dataPath, file);
                    const rawTxt = await fsp.readFile(filePath, 'utf8');
                    const raw = JSON.parse(rawTxt);
                    
                    // Same parsing logic as loadAsync
                    if (category === 'Bases') {
                        this.jsonCache.set(category, raw);
                    } else if (Array.isArray(raw)) {
                        this.jsonCache.set(category, raw);
                    } else if (raw && Array.isArray(raw.emotions)) {
                        const mapped = raw.emotions.map((e: any) => ({
                            category,
                            domain: 'normal',
                            side: 'none',
                            text_html: e.explicitMods?.join('<br>') || e.enchantMods?.join('<br>') || e.name,
                            text_plain: (e.explicitMods?.join(' | ') || e.enchantMods?.join(' | ') || e.name) || '',
                            tier: null,
                            ilvl: null,
                            weight: 0,
                            weight_pct: 0,
                            tags: ['emotion'],
                            modal_id: null,
                            family_name: null,
                            tiers: []
                        }));
                        this.jsonCache.set(category, mapped);
                    } else if (raw && Array.isArray(raw.omens)) {
                        const mapped = raw.omens.map((o: any) => ({
                            category,
                            domain: 'omen',
                            side: 'none',
                            text_html: `<strong>${o.name}</strong><br>${(o.explicitMods||[]).join('<br>')}`,
                            text_plain: [o.name, ...(o.explicitMods||[])].join(' | '),
                            tier: null,
                            ilvl: null,
                            weight: 0,
                            weight_pct: 0,
                            tags: ['omen'],
                            modal_id: null,
                            family_name: null,
                            tiers: []
                        }));
                        this.jsonCache.set(category, mapped);
                    } else if (raw && raw.gems && typeof raw.gems === 'object') {
                        const groups = raw.gems; const flat: any[] = [];
                        for (const grp of Object.keys(groups)) {
                            for (const g of groups[grp] || []) {
                                flat.push({
                                    category,
                                    domain: 'gem',
                                    side: 'none',
                                    text_html: `<strong>${g.name}</strong><br>${g.description||''}`,
                                    text_plain: [g.name, g.description || ''].join(' - ').trim(),
                                    tier: null,
                                    ilvl: null,
                                    weight: 0,
                                    weight_pct: 0,
                                    tags: ['gem', grp, ...(g.tags||[])],
                                    modal_id: null,
                                    family_name: null,
                                    tiers: []
                                });
                            }
                        }
                        this.jsonCache.set(category, flat);
                    } else {
                        this.jsonCache.set(category, []);
                    }
                } catch (e) {
                    console.warn('Failed loading', file, e);
                }
                processed++;
                if (processed % 3 === 0 || processed === total) {
                    onProgress?.(`Loading ${processed}/${total} categories...`);
                }
                // Yield so splash can repaint
                await new Promise(r => setTimeout(r, 0));
            }
            
            onProgress?.(`Loaded ${this.jsonCache.size} categories (skipped ${allFiles.length - total})`);
        } catch (e) {
            console.error('Async filtered load error', e);
            onProgress?.('Modifier load failed');
        }
    }

    /**
     * Check if a category matches any of the enabled patterns.
     * Supports wildcards: "Body_Armours_*" matches "Body_Armours_str", etc.
     */
    private matchesEnabledPattern(category: string, patterns: string[]): boolean {
        return patterns.some(pattern => {
            // Wildcard at end: "Body_Armours_*"
            if (pattern.endsWith('_*')) {
                const prefix = pattern.slice(0, -2);
                return category.startsWith(prefix);
            }
            // Wildcard at start: "*_Relic"
            if (pattern.startsWith('*_')) {
                const suffix = pattern.slice(1);
                return category.endsWith(suffix);
            }
            // Exact match
            return category === pattern;
        });
    }

    async getModifiersForCategory(category: string): Promise<ModifierData[]> {
    const raw = (category || '').trim();
        const norm = raw.toUpperCase();
        console.log(`Getting modifiers for category: ${raw} (game: ${this.gameVersion})`);

        // Special virtual categories - version-aware
        if (norm === 'ALL' || /^_+ALL_+$/.test(raw)) {
            console.log('Aggregating ALL modifiers from JSON cache');
            return this.getAllAggregated();
        }
        
        // PoE2-only virtual categories
        if (this.gameVersion === 'poe2') {
            if (norm === 'DESECRATED' || /^_+DESECRATED_+$/.test(raw)) {
                console.log('Aggregating DESECRATED modifiers from JSON cache');
                return this.getDomainAggregated('desecrated');
            }
            if (norm === 'ESSENCE') {
                console.log('Aggregating ESSENCE modifiers from JSON cache');
                return this.getDomainAggregated('essence');
            }
            if (norm === 'CORRUPTED') {
                console.log('Aggregating CORRUPTED modifiers from JSON cache');
                return this.getDomainAggregated('corrupted');
            }
            if (norm === 'SOCKETABLE' || norm === 'SOCKETABLES') {
                console.log('Aggregating SOCKETABLE modifiers from JSON cache');
                return this.getDomainAggregated('socketable');
            }
        }
        
        // PoE1-only virtual categories
        if (this.gameVersion === 'poe1') {
            if (norm === 'GEAR') {
                console.log('Aggregating GEAR modifiers (all equipment)');
                return this.getGearAggregated();
            }
            if (norm === 'INFLUENCE') {
                console.log('Loading pre-generated All_Influences aggregate');
                // Try to load the pre-generated aggregate file
                const aggData = this.jsonCache.get('Aggregate_All_Influences');
                if (aggData && Array.isArray(aggData)) {
                    return this.formatModifierData(aggData);
                }
                // Fallback to live aggregation
                console.log('Aggregate file not found, falling back to live aggregation');
                return this.getInfluenceAggregated();
            }
            
            // Individual influences
            if (norm === 'SHAPER') {
                const data = this.jsonCache.get('Influence_Shaper');
                if (data && Array.isArray(data)) return this.formatModifierData(data);
                return [];
            }
            if (norm === 'ELDER') {
                const data = this.jsonCache.get('Influence_Elder');
                if (data && Array.isArray(data)) return this.formatModifierData(data);
                return [];
            }
            if (norm === 'CRUSADER') {
                const data = this.jsonCache.get('Influence_Crusader');
                if (data && Array.isArray(data)) return this.formatModifierData(data);
                return [];
            }
            if (norm === 'REDEEMER') {
                const data = this.jsonCache.get('Influence_Redeemer');
                if (data && Array.isArray(data)) return this.formatModifierData(data);
                return [];
            }
            if (norm === 'HUNTER') {
                const data = this.jsonCache.get('Influence_Hunter');
                if (data && Array.isArray(data)) return this.formatModifierData(data);
                return [];
            }
            if (norm === 'WARLORD') {
                const data = this.jsonCache.get('Influence_Warlord');
                if (data && Array.isArray(data)) return this.formatModifierData(data);
                return [];
            }
            
            // Eldritch aggregate and individual
            if (norm === 'ELDRITCH') {
                console.log('Loading pre-generated All_Eldritch aggregate');
                const aggData = this.jsonCache.get('Aggregate_All_Eldritch');
                if (aggData && Array.isArray(aggData)) {
                    return this.formatModifierData(aggData);
                }
                console.log('Aggregate file not found, falling back to live aggregation');
                return this.getMultiDomainAggregated(['eldritch_eater', 'eldritch_searing']);
            }
            if (norm === 'ELDRITCH_EATER') {
                const data = this.jsonCache.get('Eldritch_Eater');
                if (data && Array.isArray(data)) return this.formatModifierData(data);
                return [];
            }
            if (norm === 'ELDRITCH_SEARING') {
                const data = this.jsonCache.get('Eldritch_Searing');
                if (data && Array.isArray(data)) return this.formatModifierData(data);
                return [];
            }
            
            // Other domains
            if (norm === 'MASTER_CRAFTING') {
                console.log('Loading Master domain file');
                const masterData = this.jsonCache.get('Domain_Master');
                if (masterData && Array.isArray(masterData)) {
                    return this.formatModifierData(masterData);
                }
                return this.getDomainAggregated('master');
            }
            if (norm === 'CORRUPTED') {
                console.log('Loading Corrupted domain file');
                const corrData = this.jsonCache.get('Domain_Corrupted');
                if (corrData && Array.isArray(corrData)) {
                    return this.formatModifierData(corrData);
                }
                return this.getDomainAggregated('corrupted');
            }
            if (norm === 'SYNTHESISED') {
                console.log('Loading Synthesis domain file');
                const synthData = this.jsonCache.get('Domain_Synthesis');
                if (synthData && Array.isArray(synthData)) {
                    return this.formatModifierData(synthData);
                }
                return this.getDomainAggregated('synthesis');
            }
            if (norm === 'VEILED') {
                console.log('Loading Veiled domain file');
                const veiledData = this.jsonCache.get('Domain_Veiled');
                if (veiledData && Array.isArray(veiledData)) {
                    return this.formatModifierData(veiledData);
                }
                return this.getDomainAggregated('veiled');
            }
            if (norm === 'DELVE') {
                const data = this.jsonCache.get('Domain_Delve');
                if (data && Array.isArray(data)) return this.formatModifierData(data);
                return [];
            }
            if (norm === 'INCURSION') {
                const data = this.jsonCache.get('Domain_Incursion');
                if (data && Array.isArray(data)) return this.formatModifierData(data);
                return [];
            }
            if (norm === 'ESSENCE') {
                const data = this.jsonCache.get('Domain_Essence');
                if (data && Array.isArray(data)) return this.formatModifierData(data);
                return [];
            }
            if (norm === 'SCOURGE') {
                const data = this.jsonCache.get('Domain_Scourge');
                if (data && Array.isArray(data)) return this.formatModifierData(data);
                return [];
            }
            if (norm === 'BESTIARY') {
                const data = this.jsonCache.get('Domain_Bestiary');
                if (data && Array.isArray(data)) return this.formatModifierData(data);
                return [];
            }
            if (norm === 'SENTINEL') {
                const data = this.jsonCache.get('Domain_Sentinel');
                if (data && Array.isArray(data)) return this.formatModifierData(data);
                return [];
            }
            if (norm === 'INFAMOUS') {
                const data = this.jsonCache.get('Domain_Infamous');
                if (data && Array.isArray(data)) return this.formatModifierData(data);
                return [];
            }
            if (norm === 'UNIQUE_MAPS') {
                console.log('Aggregating UNIQUE_MAPS');
                // TODO: Implement unique maps aggregation when we handle special formats
                return [];
            }
        }

        // Normal categories from JSON
        console.log('Using JSON data');
        // Virtual aggregate: Relics -> merge all *_Relic subcategories
        let datasets: any[][] = [];
        if (/^Relics$/i.test(category)) {
            for (const [cat, arr] of this.jsonCache) {
                if (/_Relic$/i.test(cat) && Array.isArray(arr)) datasets.push(arr as any[]);
            }
            if (!datasets.length) {
                console.warn('Virtual Relics requested but no *_Relic categories loaded');
                return [];
            }
        } else {
            const data = this.jsonCache.get(category);
            if (!data) {
                console.warn(`Category ${category} not found in JSON cache`);
                return [];
            }
            if (Array.isArray(data)) datasets = [data as any[]];
        }

        const grouped = new Map<string, any>();
        for (const data of datasets) {
            for (const item of data) {
                const domain = item.domain || 'unknown';
                const side = item.side || 'unknown';
                const tier = (item.domain_tier != null) ? item.domain_tier : 'na';
                const key = `${domain}_${side}_${tier}`;
                if (!grouped.has(key)) {
                    grouped.set(key, {
                        domain,
                        side,
                        domain_tier: item.domain_tier,
                        mods: [] as any[]
                    });
                }
                grouped.get(key).mods.push(item);
            }
        }
        for (const grp of grouped.values()) {
            grp.mods.sort((a: any, b: any) => {
                const aw = (typeof a.weight_pct === 'number') ? a.weight_pct : (a.weight ?? 0);
                const bw = (typeof b.weight_pct === 'number') ? b.weight_pct : (b.weight ?? 0);
                return bw - aw;
            });
        }
        return Array.from(grouped.values());
    }

    /**
     * Format array of mod items into ModifierData structure
     */
    private formatModifierData(data: any[]): ModifierData[] {
        const grouped = new Map<string, any>();
        for (const item of data) {
            const domain = item.domain || 'unknown';
            const side = item.side || 'unknown';
            const tier = (item.domain_tier != null) ? item.domain_tier : 'na';
            const key = `${domain}_${side}_${tier}`;
            if (!grouped.has(key)) {
                grouped.set(key, {
                    domain,
                    side,
                    domain_tier: item.domain_tier,
                    mods: [] as any[]
                });
            }
            grouped.get(key).mods.push(item);
        }
        for (const grp of grouped.values()) {
            grp.mods.sort((a: any, b: any) => {
                const aw = (typeof a.weight_pct === 'number') ? a.weight_pct : (a.weight ?? 0);
                const bw = (typeof b.weight_pct === 'number') ? b.weight_pct : (b.weight ?? 0);
                return bw - aw;
            });
        }
        return Array.from(grouped.values());
    }

    private getFromJson(category: string): ModifierData[] {
        const data = this.jsonCache.get(category);
        if (!data) {
            console.warn(`Category ${category} not found in JSON cache`);
            return [];
        }
        if (!Array.isArray(data)) {
            console.warn(`Category ${category} data not array – skipping`);
            return [];
        }
        const grouped = new Map<string, any>();
        for (const item of data) {
            if (!item || !item.domain) continue;
            const key = `${item.domain}_${item.side}`;
            if (!grouped.has(key)) {
                grouped.set(key, { domain: item.domain, side: item.side, mods: [] });
            }
            grouped.get(key).mods.push(item);
        }
        return Array.from(grouped.values());
    }

    // Build an "ALL" view by aggregating across every JSON category (like verifier)
    private getAllAggregated(): ModifierData[] {
        if (this.jsonCache.size === 0) return [];

        const grouped = new Map<string, any>();
        for (const [category, data] of this.jsonCache) {
            if (!Array.isArray(data)) continue;
            (data as any[]).forEach((item: any) => {
                const key = `${item.domain}_${item.side}`;
                if (!grouped.has(key)) {
                    grouped.set(key, {
                        domain: item.domain,
                        side: item.side,
                        mods: [] as any[]
                    });
                }
                grouped.get(key).mods.push({ ...item, sourceCategory: category });
            });
        }

        // Sort within each group like verifier (by weight_pct desc when present)
        for (const group of grouped.values()) {
            group.mods.sort((a: any, b: any) => {
                const aw = (typeof a.weight_pct === 'number') ? a.weight_pct : (a.weight ?? 0);
                const bw = (typeof b.weight_pct === 'number') ? b.weight_pct : (b.weight ?? 0);
                return bw - aw;
            });
        }

        return Array.from(grouped.values());
    }

    // Build a domain-aggregated view by filtering domain across all categories
    private getDomainAggregated(domainName: string): ModifierData[] {
        if (this.jsonCache.size === 0) return [];

        const grouped = new Map<string, any>();
        for (const [category, data] of this.jsonCache) {
            if (!Array.isArray(data)) continue;
            (data as any[])
                .filter((item: any) => item.domain === domainName)
                .forEach((item: any) => {
                    const key = `${domainName}_${item.side}`;
                    if (!grouped.has(key)) {
                        grouped.set(key, {
                            domain: domainName,
                            side: item.side,
                            mods: [] as any[]
                        });
                    }
                    grouped.get(key).mods.push({ ...item, sourceCategory: category });
                });
        }

        for (const group of grouped.values()) {
            group.mods.sort((a: any, b: any) => {
                const aw = (typeof a.weight_pct === 'number') ? a.weight_pct : (a.weight ?? 0);
                const bw = (typeof b.weight_pct === 'number') ? b.weight_pct : (b.weight ?? 0);
                return bw - aw;
            });
        }

        return Array.from(grouped.values());
    }

    // PoE1: Aggregate multiple domains (e.g., Eldritch = eater + searing)
    private getMultiDomainAggregated(domainNames: string[]): ModifierData[] {
        if (this.jsonCache.size === 0) return [];

        const grouped = new Map<string, any>();
        for (const [category, data] of this.jsonCache) {
            if (!Array.isArray(data)) continue;
            (data as any[])
                .filter((item: any) => domainNames.includes(item.domain))
                .forEach((item: any) => {
                    const key = `${item.domain}_${item.side}`;
                    if (!grouped.has(key)) {
                        grouped.set(key, {
                            domain: item.domain,
                            side: item.side,
                            mods: [] as any[]
                        });
                    }
                    grouped.get(key).mods.push({ ...item, sourceCategory: category });
                });
        }

        for (const group of grouped.values()) {
            group.mods.sort((a: any, b: any) => {
                const aw = (typeof a.weight_pct === 'number') ? a.weight_pct : (a.weight ?? 0);
                const bw = (typeof b.weight_pct === 'number') ? b.weight_pct : (b.weight ?? 0);
                return bw - aw;
            });
        }

        return Array.from(grouped.values());
    }

    // PoE1: Aggregate all conqueror influence domains
    private getInfluenceAggregated(): ModifierData[] {
        const influenceDomains = ['shaper', 'elder', 'crusader', 'redeemer', 'hunter', 'warlord'];
        return this.getMultiDomainAggregated(influenceDomains);
    }

    // PoE1: Aggregate all gear categories (armours, weapons, accessories)
    private getGearAggregated(): ModifierData[] {
        if (this.jsonCache.size === 0) return [];

        const gearPatterns = [
            /^Body_Armours_/i,
            /^Helmets_/i,
            /^Gloves_/i,
            /^Boots_/i,
            /^Shields_/i,
            /^(One_Hand_|Two_Hand_)/i,
            /^(Bows|Claws|Daggers|Staves|Wands|Sceptres|Quarterstaves|Warstaves)$/i,
            /^(Amulets|Rings|Belts|Quivers)$/i
        ];

        const grouped = new Map<string, any>();
        for (const [category, data] of this.jsonCache) {
            // Skip if not a gear category
            if (!gearPatterns.some(pattern => pattern.test(category))) continue;
            if (!Array.isArray(data)) continue;

            (data as any[]).forEach((item: any) => {
                const key = `${item.domain}_${item.side}`;
                if (!grouped.has(key)) {
                    grouped.set(key, {
                        domain: item.domain,
                        side: item.side,
                        mods: [] as any[]
                    });
                }
                grouped.get(key).mods.push({ ...item, sourceCategory: category });
            });
        }

        for (const group of grouped.values()) {
            group.mods.sort((a: any, b: any) => {
                const aw = (typeof a.weight_pct === 'number') ? a.weight_pct : (a.weight ?? 0);
                const bw = (typeof b.weight_pct === 'number') ? b.weight_pct : (b.weight ?? 0);
                return bw - aw;
            });
        }

        return Array.from(grouped.values());
    }

    async searchModifiers(query: string, category?: string): Promise<ModifierData[]> {
        const searchTerm = query.toLowerCase();
        
        if (category) {
            const categoryData = await this.getModifiersForCategory(category);
            return this.filterModifiers(categoryData, searchTerm);
        }

        // Search across all categories
        const allResults: ModifierData[] = [];
        
        if (this.jsonCache.size > 0) {
            // Search JSON cache
            for (const [cat, data] of this.jsonCache) {
                const filtered = this.filterModifiers(data, searchTerm);
                allResults.push(...filtered);
            }
        }

        return allResults;
    }

    private filterModifiers(sections: ModifierData[], searchTerm: string): ModifierData[] {
        return sections.map(section => ({
            ...section,
            mods: section.mods.filter(mod => 
                mod.text_plain.toLowerCase().includes(searchTerm) ||
                (mod.tags && mod.tags.some(tag => tag.toLowerCase().includes(searchTerm)))
            )
        })).filter(section => section.mods.length > 0);
    }

    async getAllCategories(): Promise<string[]> {
        if (this.jsonCache.size > 0) {
            const cats = Array.from(this.jsonCache.keys());
            const virtualCats = getVirtualCategories(this.gameVersion);
            const out: string[] = [...virtualCats];
            
            if (this.gameVersion === 'poe1') {
                // For PoE1, separate gear categories from domain files
                const gearCats: string[] = [];
                const domainCats: string[] = [];
                const specialCats: string[] = [];
                
                for (const cat of cats) {
                    // Skip domain/aggregate files (they're accessed via virtual categories)
                    if (cat.startsWith('Influence_') || 
                        cat.startsWith('Eldritch_') || 
                        cat.startsWith('Domain_') || 
                        cat.startsWith('Aggregate_')) {
                        // These are loaded but not shown directly in category list
                        continue;
                    }
                    
                    // Categorize by type
                    if (cat.match(/^(Body_Armours|Boots|Gloves|Helmets|Shields|Belts|Amulets|Rings|Quivers|One_Hand|Two_Hand|Bows|Claws|Daggers|Sceptres|Wands|Staves)/)) {
                        gearCats.push(cat);
                    } else if (cat.match(/(Jewel|Idol|Charm|Flask|Brooch|Keyring)/i)) {
                        specialCats.push(cat);
                    } else {
                        specialCats.push(cat);
                    }
                }
                
                // Add gear first, then special
                out.push(...gearCats.sort());
                out.push(...specialCats.sort());
                
                // Add conditional virtuals
                const relicSubs = cats.filter(c => /_Relic$/i.test(c));
                if (relicSubs.length && !out.includes('Relics')) out.push('Relics');
            } else {
                // PoE2 - add all categories
                out.push(...cats);
                
                const relicSubs = cats.filter(c => /_Relic$/i.test(c));
                if (relicSubs.length && !out.includes('Relics')) out.push('Relics');
            }
            
            return out;
        }

        return [];
    }

    destroy() {
        this.jsonCache.clear();
    }
}