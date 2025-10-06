import * as fs from 'fs';
import * as path from 'path';
import { promises as fsp } from 'fs';

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

    constructor(dataPath: string, autoLoad: boolean = true) {
        this.dataPath = dataPath;
        if (autoLoad) {
            this.loadFromJson();
        }
    }

    setDataPath(newPath: string) {
        if (newPath && newPath !== this.dataPath) {
            this.dataPath = newPath;
        }
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

    async getModifiersForCategory(category: string): Promise<ModifierData[]> {
    const raw = (category || '').trim();
        const norm = raw.toUpperCase();
        console.log(`Getting modifiers for category: ${raw}`);

        // Special virtual categories (match verifier semantics)
        if (norm === 'ALL' || /^_+ALL_+$/.test(raw)) {
            console.log('Aggregating ALL modifiers from JSON cache');
            return this.getAllAggregated();
        }
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
            // Inject virtual aggregate categories
            const out: string[] = ['ALL', 'DESECRATED', 'ESSENCE', 'CORRUPTED', 'SOCKETABLE'];
            // Add existing categories
            out.push(...cats);
            // If we have any *_Relic categories but no generic Relics, expose virtual "Relics"
            const relicSubs = cats.filter(c => /_Relic$/i.test(c));
            if (relicSubs.length && !out.includes('Relics')) out.push('Relics');
            return out;
        }

        return [];
    }

    destroy() {
        this.jsonCache.clear();
    }
}