export interface ParsedItem {
    itemClass: string;
    rarity: string;
    name: string;
    baseType: string;
    quality?: {
        group: string;        // Raw group label from item text, e.g., "Lightning Modifiers"
        percent: number;      // e.g., 20
        tags: string[];       // Normalized tags this quality affects (e.g., ['lightning','elemental'])
    };
    requirements: {
        level?: number;
        str?: number;
        dex?: number;
        int?: number;
    };
    itemLevel: number;
    category: string;
    attributeType: string; // 'str', 'dex', 'int', 'str_dex', 'str_int', 'dex_int'
    modifiers: string[];
}

export class ItemParser {
    private categoryMappings: Record<string, string> = {
        'Body Armours': 'Body_Armours',
        'Helmets': 'Helmets',
        'Gloves': 'Gloves',
        'Boots': 'Boots',
        'Belts': 'Belts',
        'Rings': 'Rings',
        'Amulets': 'Amulets',
    'Charms': 'Charms',
        // Flasks
        'Life Flasks': 'Life_Flasks',
        'Mana Flasks': 'Mana_Flasks',
        // Special categories
        'Relics': 'Relics',
        'Relic': 'Relics',
        'Amphora Relic': 'Amphora_Relic',
        'Coffer Relic': 'Coffer_Relic', 
        'Incense Relic': 'Incense_Relic',
        'Seal Relic': 'Seal_Relic',
        'Tapestry Relic': 'Tapestry_Relic',
        'Urn Relic': 'Urn_Relic',
        'Vase Relic': 'Vase_Relic',
        'Tablet': 'Tablet',
        'Waystones': 'Waystones',
        'Waystone': 'Waystones',
        'Bows': 'Bows',
        'Crossbows': 'Crossbows',
        'Wands': 'Wands',
        'Staves': 'Staves',
        'One Hand Swords': 'One_Hand_Swords',
        'Two Hand Swords': 'Two_Hand_Swords',
        'One Hand Axes': 'One_Hand_Axes',
        'Two Hand Axes': 'Two_Hand_Axes',
        'One Hand Maces': 'One_Hand_Maces',
        'Two Hand Maces': 'Two_Hand_Maces',
        'Daggers': 'Daggers',
        'Claws': 'Claws',
        'Quarterstaves': 'Quarterstaves',
        'Spears': 'Spears',
        'Flails': 'Flails',
        'Sceptres': 'Sceptres',
        'Shields': 'Shields',
        'Bucklers': 'Bucklers',
        'Foci': 'Foci',
        'Quivers': 'Quivers',
        // Mechanics
        'Strongboxes': 'Strongbox',
        'Expedition Logbooks': 'Expedition_Logbook',
        'Stackable Currency': 'Stackable_Currency',
        'Omen': 'Omens',
        'Skill Gems': 'Gems',
        'Support Gems': 'Gems',
        'Spirit Gems': 'Gems',
        'Lineage Supports': 'Gems',
        // New PoE2 item classes
        'Uncut Skill Gems': 'Gems',
        'Socketable': 'Socketables'
    };
    // Extend mapping at runtime for Jewels if not present
    constructor() {
        if (!this.categoryMappings['Jewels']) {
            this.categoryMappings['Jewels'] = 'Jewels';
        }
    }

    async parse(itemText: string): Promise<ParsedItem> {
        const lines = itemText.split('\n').map(line => line.trim()).filter(line => line);
        
        const itemClass = this.extractItemClass(lines);
        const rarity = this.extractRarity(lines);
        const { name, baseType } = this.extractNameAndBase(lines);
        const quality = this.extractQuality(lines);
        const requirements = this.extractRequirements(lines);
        const itemLevel = this.extractItemLevel(lines);
        const modifiers = this.extractModifiers(lines);
        
    const attributeType = this.determineAttributeType(requirements);
        let category = this.determineCategory(itemClass, attributeType, baseType, name);

        // Waystones: derive Low/Mid/Top virtual categories from Area Level or Tier in name
        if (category === 'Waystones') {
            // Try to parse an Area Level line if present
            const areaLevelLine = lines.find(l => /Area Level:\s*(\d+)/i.test(l));
            let areaLevel = 0;
            if (areaLevelLine) {
                const m = areaLevelLine.match(/Area Level:\s*(\d+)/i);
                if (m) areaLevel = parseInt(m[1], 10) || 0;
            }
            // Dedicated "Waystone Tier: N" line if present
            const waystoneTierLine = lines.find(l => /Waystone\s+Tier:\s*(\d+)/i.test(l));
            let tierFromLine = 0;
            if (waystoneTierLine) {
                const m = waystoneTierLine.match(/Waystone\s+Tier:\s*(\d+)/i);
                if (m) tierFromLine = parseInt(m[1], 10) || 0;
            }
            // Alternatively infer from name like "Waystone (Tier 1)"
            const tierMatch = (name && name.match(/Tier\s*(\d+)/i)) || (baseType && baseType.match(/Tier\s*(\d+)/i));
            let tier = tierFromLine || (tierMatch ? parseInt(tierMatch[1], 10) : 0);
            if (areaLevel && !tier) {
                // Fallback heuristic if only Area Level is present; keep buckets aligned to tier ranges
                if (areaLevel <= 70) tier = 5; // Low (T1-5)
                else if (areaLevel <= 78) tier = 10; // Mid (T6-10)
                else tier = 15; // Top (T11-16)
            }
            if (tier) {
                if (tier >= 1 && tier <= 5) category = 'Waystones_Low';
                else if (tier >= 6 && tier <= 10) category = 'Waystones_Mid';
                else if (tier >= 11) category = 'Waystones_Top';
            }
        }

        return {
            itemClass,
            rarity,
            name,
            baseType,
            quality,
            requirements,
            itemLevel,
            category,
            attributeType,
            modifiers
        };
    }

    private extractItemClass(lines: string[]): string {
        const classLine = lines.find(line => line.startsWith('Item Class:'));
        return classLine ? classLine.replace('Item Class:', '').trim() : '';
    }

    private extractRarity(lines: string[]): string {
        const rarityLine = lines.find(line => line.startsWith('Rarity:'));
        return rarityLine ? rarityLine.replace('Rarity:', '').trim() : '';
    }

    private extractNameAndBase(lines: string[]): { name: string; baseType: string } {
        // Find rarity line and get the next two non-empty lines
        const rarityIndex = lines.findIndex(line => line.startsWith('Rarity:'));
        if (rarityIndex === -1) return { name: '', baseType: '' };

        let name = '';
        let baseType = '';
        
        for (let i = rarityIndex + 1; i < lines.length; i++) {
            const line = lines[i];
            if (line && !line.startsWith('--------')) {
                if (!name) {
                    name = line;
                } else if (!baseType) {
                    baseType = line;
                    break;
                }
            }
        }

        return { name, baseType };
    }

    private extractRequirements(lines: string[]): ParsedItem['requirements'] {
        const reqLine = lines.find(line => line.startsWith('Requires:'));
        if (!reqLine) return {};

        const requirements: ParsedItem['requirements'] = {};
        
        // Extract level
        const levelMatch = reqLine.match(/Level (\d+)/);
        if (levelMatch) {
            requirements.level = parseInt(levelMatch[1]);
        }

    // Extract attributes (allow optional parenthetical like '(augmented)' between number and attribute)
    // Examples:
    //   "Requires: Level 65, 104 (augmented) Int"
    //   "Requires: Level 70, 95 Str, 102 (augmented) Int"
    //   "Requires: Level 52, 88 Dex (unmet)"
    const attrPattern = (attr: string) => new RegExp(`(\\d+)(?:\\s*\\(.*?\\))?\\s+${attr}\\b`, 'i');
    const strMatch = reqLine.match(attrPattern('Str'));
    const dexMatch = reqLine.match(attrPattern('Dex'));
    const intMatch = reqLine.match(attrPattern('Int'));

        if (strMatch) requirements.str = parseInt(strMatch[1]);
        if (dexMatch) requirements.dex = parseInt(dexMatch[1]);
        if (intMatch) requirements.int = parseInt(intMatch[1]);

        return requirements;
    }

    private extractItemLevel(lines: string[]): number {
        const ilvlLine = lines.find(line => line.startsWith('Item Level:'));
        if (!ilvlLine) return 0;
        
        const match = ilvlLine.match(/Item Level: (\d+)/);
        return match ? parseInt(match[1]) : 0;
    }

    // Extracts ring/amulet catalyst quality lines like:
    // "Quality (Lightning Modifiers): +20% (augmented)"
    // Returns group label and percent plus a best-effort mapping to modifier tags.
    private extractQuality(lines: string[]): ParsedItem['quality'] | undefined {
        const qLine = lines.find(line => /^Quality \(/.test(line));
        if (!qLine) return undefined;
        const m = qLine.match(/^Quality \(([^)]+)\):\s*\+?(\d+)%/i);
        if (!m) return undefined;
        const rawGroup = m[1].trim();
        const percent = parseInt(m[2], 10) || 0;

        // Normalize common group names to tag sets
        const groupLc = rawGroup.toLowerCase();
        const tagSets: Record<string, string[]> = {
            'health modifiers': ['life'],
            'life modifiers': ['life'],
            'mana modifiers': ['mana'],
            'protection modifiers': ['defences', 'resistance'], // best-effort
            'defence modifiers': ['defences'],
            'defenses modifiers': ['defences'],
            'defences modifiers': ['defences'],
            'defense modifiers': ['defences'],
            "physical modifiers": ['physical'],
            "fire modifiers": ['fire', 'elemental'],
            "ice modifiers": ['cold', 'elemental'],
            "cold modifiers": ['cold', 'elemental'],
            "lightning modifiers": ['lightning', 'elemental'],
            "chaos modifiers": ['chaos'],
            "attack modifiers": ['attack'],
            "magician modifiers": ['caster'],
            "caster modifiers": ['caster'],
            "speed modifiers": ['speed'],
            "attribute modifiers": ['attribute'],
            "property modifiers": ['attribute'] // guess for "property value"
        };
        // Find a key that is contained within the group string
        let tags: string[] = [];
        for (const key of Object.keys(tagSets)) {
            if (groupLc.includes(key)) { tags = tagSets[key]; break; }
        }
        // Also handle simple element-only groups like "Lightning", "Fire", etc.
        if (tags.length === 0) {
            if (/\blightning\b/i.test(rawGroup)) tags = ['lightning','elemental'];
            else if (/\bfire\b/i.test(rawGroup)) tags = ['fire','elemental'];
            else if (/\bice\b|\bcold\b/i.test(rawGroup)) tags = ['cold','elemental'];
            else if (/\bchaos\b/i.test(rawGroup)) tags = ['chaos'];
            else if (/\bphysical\b/i.test(rawGroup)) tags = ['physical'];
            else if (/\blife\b|\bhealth\b/i.test(rawGroup)) tags = ['life'];
            else if (/\bmana\b/i.test(rawGroup)) tags = ['mana'];
            else if (/\battack\b/i.test(rawGroup)) tags = ['attack'];
            else if (/\bmagician\b|\bcaster\b/i.test(rawGroup)) tags = ['caster'];
            else if (/\bspeed\b/i.test(rawGroup)) tags = ['speed'];
            else if (/\battribute\b|\bproperty\b/i.test(rawGroup)) tags = ['attribute'];
            else if (/\bprotection\b/i.test(rawGroup)) tags = ['defences','resistance'];
            else if (/\bdefen[cs]e(s)?\b/i.test(rawGroup)) tags = ['defences'];
        }
        return { group: rawGroup, percent, tags };
    }

    private extractModifiers(lines: string[]): string[] {
        const modifiers: string[] = [];
        // Known metadata or stat lines to skip
        const skipExact = new Set([
            'Corrupted', 'Fractured Item', 'Unidentified', 'Mirrored'
        ]);
        const skipStarts = [
            'Item Class:', 'Rarity:', 'Quality:', 'Requirements:', 'Requires:', 'Item Level:', 'Sockets:',
            'Armour:', 'Evasion Rating:', 'Energy Shield:', 'Ward:', 'Block:', 'Critical Strike Chance:',
            'Physical Damage:', 'Elemental Damage:', 'Attack Speed:', 'Weapon Range:', 'Item sells for:'
        ];
        const looksLikeMod = (s: string) => {
            const lc = s.toLowerCase();
            // typical modifier cues
            return /[%+]/.test(s) ||
                   /(increased|reduced|to maximum|to all|adds|gain|regenerate|chance|while|during|on kill|per second|additional)/.test(lc);
        };
        for (const raw of lines) {
            const line = raw.trim();
            if (!line || line === '--------') continue;
            if (skipExact.has(line)) continue;
            if (skipStarts.some(p => line.startsWith(p))) continue;
            // Skip catalyst quality metadata lines like "Quality (Lightning Modifiers): +20% (augmented)"
            if (/^Quality \(/.test(line)) continue;
            // Ignore section headers like "Implicit", "Explicit", etc.
            if (/^(implicit|explicit|enchanted|prefixes|suffixes)[:]?$/i.test(line)) continue;
            if (looksLikeMod(line)) {
                modifiers.push(line);
            }
        }
        return modifiers;
    }

    private determineAttributeType(requirements: ParsedItem['requirements']): string {
        const hasStr = requirements.str && requirements.str > 0;
        const hasDex = requirements.dex && requirements.dex > 0;
        const hasInt = requirements.int && requirements.int > 0;

        if (hasStr && hasDex && hasInt) {
            // If all three, determine the highest two
            const attrs = [
                { type: 'str', value: requirements.str || 0 },
                { type: 'dex', value: requirements.dex || 0 },
                { type: 'int', value: requirements.int || 0 }
            ].sort((a, b) => b.value - a.value);

            return `${attrs[0].type}_${attrs[1].type}`;
        }

        if (hasStr && hasDex) return 'str_dex';
        if (hasStr && hasInt) return 'str_int';
        if (hasDex && hasInt) return 'dex_int';
        if (hasStr) return 'str';
        if (hasDex) return 'dex';
        if (hasInt) return 'int';

        return 'str'; // Default fallback
    }

    private determineCategory(itemClass: string, attributeType: string, baseType: string, name: string): string {
        // Special-case early exits before unknown check
        // Socketables (Runes / Soul Cores)
        if (/^Socketable$/i.test(itemClass)) {
            return 'Socketables';
        }
        const baseCategory = this.categoryMappings[itemClass] || (itemClass === 'Jewels' ? 'Jewels' : '');
        if (!baseCategory) {
            console.warn(`Unknown item class: ${itemClass}`);
            return 'unknown';
        }
        if (baseCategory === 'Stackable_Currency') {
            // Essences: detect pattern "Essence" in name
            if (/Essence/i.test(name)) return 'Essences';
            return 'Stackable_Currency';
        }

        // Mechanics: Strongboxes (no attribute variants) & Expedition Logbooks (flat)
        if (baseCategory === 'Strongbox') {
            return 'Strongbox';
        }
        if (baseCategory === 'Expedition_Logbook') {
            return 'Expedition_Logbook';
        }
        if (baseCategory === 'Essences') {
            return 'Essences';
        }

        // Essences: treat stackable currency names containing 'Essence' as Essences crafting view trigger
        if (itemClass === 'Stackable Currency') {
            if (/Essence/i.test(name)) {
                return 'Essences';
            }
            // Omens share the Stackable Currency class – detect pattern "Omen of X"
            if (/^Omen\s+of\s+/i.test(name)) {
                return 'Omens';
            }
        }
        // Direct standalone Omen item class safeguard
        if (/^Omen$/i.test(itemClass)) {
            return 'Omens';
        }
        // Gems classes unify into single virtual 'Gems' grouping for character panel
        if (/^(Skill Gems|Support Gems|Spirit Gems|Lineage Supports)$/i.test(itemClass)) {
            return 'Gems';
        }
        // Jewels: map to specific jewel type categories (Ruby/Emerald/Sapphire + Time-Lost variants)
        if (baseCategory === 'Jewels') {
            const bt = (baseType || name || '').toLowerCase();
            if (/time[-\s]*lost\s+ruby/i.test(bt)) return 'Time-Lost_Ruby';
            if (/time[-\s]*lost\s+emerald/i.test(bt)) return 'Time-Lost_Emerald';
            if (/time[-\s]*lost\s+sapphire/i.test(bt)) return 'Time-Lost_Sapphire';
            if (/ruby/i.test(bt)) return 'Ruby';
            if (/emerald/i.test(bt)) return 'Emerald';
            if (/sapphire/i.test(bt)) return 'Sapphire';
            return 'Jewels'; // fallback generic
        }

        // Relics: map to specific relic type if baseType indicates it
        if (baseCategory === 'Relics') {
            const relicMap: Record<string, string> = {
                'urn relic': 'Urn_Relic',
                'amphora relic': 'Amphora_Relic',
                'vase relic': 'Vase_Relic',
                'seal relic': 'Seal_Relic',
                'coffer relic': 'Coffer_Relic',
                'tapestry relic': 'Tapestry_Relic',
                'incense relic': 'Incense_Relic'
            };
            const bt = (baseType || name || '').toLowerCase();
            for (const key of Object.keys(relicMap)) {
                if (bt.includes(key)) return relicMap[key];
            }
            return 'Relics';
        }

        // Tablet: detect specific precursor tablet variants by baseType/name.
        // Clipboard copies show Item Class: Tablet and the name like
        // "Brimming Breach Precursor Tablet of the Invasion".
        // We must map variant keywords ONLY for tablets; other gear detection unchanged.
        if (baseCategory === 'Tablet') {
            const source = (name + ' ' + baseType).trim().toLowerCase();
            // Normalize multiple spaces
            const bt = source.replace(/\s+/g, ' ');
            // Order matters: match the more specific prefixed variants first.
            if (/breach precursor tablet/.test(bt)) return 'Breach_Precursor_Tablet';
            if (/expedition precursor tablet/.test(bt)) return 'Expedition_Precursor_Tablet';
            if (/delirium precursor tablet/.test(bt)) return 'Delirium_Precursor_Tablet';
            if (/ritual precursor tablet/.test(bt)) return 'Ritual_Precursor_Tablet';
            if (/overseer precursor tablet/.test(bt)) return 'Overseer_Precursor_Tablet';
            // Generic (no other domain keyword besides optional prefixes like Brimming etc.)
            if (/precursor tablet/.test(bt)) return 'Precursor_Tablet';
            return 'Tablet';
        }

        // Waystones: group to single category
        if (baseCategory === 'Waystones') {
            return 'Waystones';
        }

        // Categories that have attribute variants
        const attributeCategories = [
            'Body_Armours', 'Helmets', 'Gloves', 'Boots', 'Shields'
        ];

        if (attributeCategories.includes(baseCategory)) {
            return `${baseCategory}_${attributeType}`;
        }

        return baseCategory;
    }
}