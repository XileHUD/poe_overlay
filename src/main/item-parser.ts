const POE1_BASETYPE_CATEGORY_OVERRIDES: Record<string, string> = {
    'bone ring': 'Bone_Ring',
    'replica bone ring': 'Bone_Ring',
    'unset ring': 'Unset_Ring',
    'burst band': 'Burst_Band',
    'replica burst band': 'Burst_Band',
    'precise arrowhead': 'Precise_Arrowhead',
    'obsidian sharpening stone': 'Obsidian_Sharpening_Stone',
    'master lockpick': 'Master_Lockpick',
    'steel bracers': 'Steel_Bracers',
    'thaumaturgical sensing charm': 'Thaumaturgical_Sensing_Charm',
    'thaumetic flashpowder': 'Thaumetic_Flashpowder',
    'thaumaturgical ward': 'Thaumaturgical_Ward',
    'grandmaster keyring': 'Grandmaster_Keyring',
    'silkweave sole': 'Silkweave_Sole',
    'regicide disguise kit': 'Regicide_Disguise_Kit',
    'thaumetic blowtorch': 'Thaumetic_Blowtorch',
    'whisper-woven cloak': 'Whisper-woven_Cloak',
    'foliate brooch': 'Foliate_Brooch',
    'runic crown': 'Runic_Crown',
    'runic sabatons': 'Runic_Sabatons',
    'runic gauntlets': 'Runic_Gauntlets',
    'convoking wand': 'Convoking_Wand',
    'bone spirit shield': 'Bone_Spirit_Shield',
    'iron flask': 'Iron_Flask',
    'silver flask': 'Silver_Flask',
    'ursine charm': 'Ursine_Charm',
    'lupine charm': 'Lupine_Charm',
    'corvine charm': 'Corvine_Charm',
    'minor idol': 'Minor_Idol',
    'kamasan idol': 'Kamasan_Idol',
    'totemic idol': 'Totemic_Idol',
    'noble idol': 'Noble_Idol',
    'burial idol': 'Burial_Idol',
    'conqueror idol': 'Conqueror_Idol',
    'murderous eye jewel': 'Murderous_Eye_Jewel',
    'searching eye jewel': 'Searching_Eye_Jewel',
    'hypnotic eye jewel': 'Hypnotic_Eye_Jewel',
    'ghastly eye jewel': 'Ghastly_Eye_Jewel',
    'timeless jewel': 'Timeless_Jewel',
    'cobalt jewel': 'Cobalt_Jewel',
    'crimson jewel': 'Crimson_Jewel',
    'viridian jewel': 'Viridian_Jewel',
    'prismatic jewel': 'Prismatic_Jewel',
    "maven's invitation: the feared": 'Mavens_Invitation%3A_The_Feared'
};

export interface OrganizedModifier {
    name?: string;         // For explicit mods: "Fugitive", "of the Polar Bear"
    tier?: number;         // For explicit mods: 1, 2, 3
    tags: string[];        // Modifier tags: ["Elemental", "Cold", "Resistance"]
    string: string;        // Full modifier text
    values: number[];      // Extracted numeric values: [109, 101, 110] from "109(101-110)%"
    isFractured?: boolean;
    isDesecrated?: boolean;
    isVeiled?: boolean;
    hasExceptionalValue?: boolean; // True when the rolled value sits outside the documented range
    isCrafted?: boolean;   // PoE1: Master Crafted modifier
}

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
        [key: string]: number | undefined; // Allow dynamic PoE1 requirement keys
    };
    itemLevel: number;
    category: string;
    attributeType: string; // 'str', 'dex', 'int', 'str_dex', 'str_int', 'dex_int'
    modifiers: string[];   // Legacy: raw text lines (kept for backward compatibility)
    organizedModifiers?: { // New: organized by type with metadata
        enchant: OrganizedModifier[];
        implicit: OrganizedModifier[];
        explicit: OrganizedModifier[];
        rune: OrganizedModifier[];
        crucible?: OrganizedModifier[]; // PoE1: Crucible passive skills
    };
    waystoneTier?: number;
    mapTier?: number; // PoE1: Map tier
    waystoneBonuses?: Array<{ text: string; value: number | null }>;
    socketsPoe1?: string[][]; // PoE1: Linked socket groups [['R','G'],['B','B','R']]
    isIdentified?: boolean;
    isFoiled?: boolean;
    foiled?: boolean;
    corrupted?: boolean;
    isCorrupted?: boolean;
    sanctified?: boolean;
    isSanctified?: boolean;
    fractured?: boolean;
    isFractured?: boolean;
    desecrated?: boolean;
    isDesecrated?: boolean;
    veiled?: boolean;
    isVeiled?: boolean;
    mirrored?: boolean;
    isMirrored?: boolean;
    isModifiable?: boolean;
    // PoE1 influence flags
    isWarlord?: boolean;
    isHunter?: boolean;
    isRedeemer?: boolean;
    isCrusader?: boolean;
    isElder?: boolean;
    isShaper?: boolean;
    isSynthesis?: boolean;
    isExarch?: boolean;
    isEater?: boolean;
    isInfluenced?: boolean;
    influenceCount?: number;
}

export type GameVersion = 'poe1' | 'poe2';

export class ItemParser {
    private game: GameVersion;
    private categoryMappings: Record<string, string> = {
        'Body Armours': 'Body_Armours',
        'Helmets': 'Helmets',
        'Gloves': 'Gloves',
        'Boots': 'Boots',
        'Belts': 'Belts',
        'Rings': 'Rings',
        'Amulets': 'Amulets',
    'Charms': 'Charms',
    'Trinkets': 'Trinkets',
    'Contracts': 'Contracts',
    'Blueprints': 'Blueprints',
        'Tinctures': 'Tinctures',
        // Flasks
        'Life Flasks': 'Life_Flasks',
        'Mana Flasks': 'Mana_Flasks',
    'Utility Flasks': 'Utility_Flasks',
    'Hybrid Flasks': 'Hybrid_Flasks',
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
        'Divination Cards': 'Divination_Cards',
        'Rune Daggers': 'Rune_Daggers',
        'Thrusting One Hand Swords': 'Thrusting_One_Hand_Swords',
        'Abyss Jewels': 'Jewels',
        // New PoE2 item classes
        'Uncut Skill Gems': 'Gems',
        'Uncut Spirit Gems': 'Gems',
        'Socketable': 'Socketables'
    };
    // Extend mapping at runtime for Jewels if not present
    constructor(game: GameVersion = 'poe2') {
        this.game = game;
        if (!this.categoryMappings['Jewels']) {
            this.categoryMappings['Jewels'] = 'Jewels';
        }
        // Add PoE1-specific category mappings
        if (game === 'poe1') {
            this.categoryMappings['Maps'] = 'Maps';
        }
    }

    async parse(itemText: string): Promise<ParsedItem> {
        // Normalize text: remove PoE1 "cannot use" warning
        let normalizedText = itemText.replace(/You cannot use this item\. Its stats will be ignored\s*\r?\n?-{8,}\r?\n?/g, '');
        
        const lines = normalizedText.split('\n').map(line => line.trim()).filter(line => line);
        
        const itemClass = this.extractItemClass(lines);
        const rarity = this.extractRarity(lines);
        const { name, baseType } = this.extractNameAndBase(lines);
        const quality = this.extractQuality(lines);
        const requirements = this.extractRequirements(lines);
        const itemLevel = this.extractItemLevel(lines, itemClass, rarity);
        const modifiers = this.extractModifiers(lines);
        const organizedModifiers = this.extractOrganizedModifiers(normalizedText);
        const statusFlags = this.extractStatusFlags(lines, normalizedText);
        const socketData = this.extractSockets(normalizedText);
        
    const attributeType = this.determineAttributeType(requirements, itemClass, baseType, lines);
        let category = this.determineCategory(itemClass, attributeType, baseType, name);
        
        // Only log successful parses (suppress unknown/empty spam during clipboard polling)
        if (category && category !== 'unknown') {
            console.log('ItemParser: parsed item', { itemClass, name, baseType, category });
        }

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
            modifiers,
            organizedModifiers,
            ...socketData,
            ...statusFlags
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
        const requirements: ParsedItem['requirements'] = {};
        
        // PoE2 inline format: "Requires: Level 80, 121 Dex"
        const reqLine = lines.find(line => line.startsWith('Requires:'));
        if (reqLine) {
            const levelMatch = reqLine.match(/Level\s+(\d+)/i);
            if (levelMatch) {
                requirements.level = parseInt(levelMatch[1], 10);
            }

            // Extract attributes (allow optional parenthetical like '(augmented)' or '(unmet)')
            const attrPattern = (attr: string) => new RegExp(`(\\d+)(?:\\s*\\(.*?\\))?\\s+${attr}\\b`, 'i');
            const strMatch = reqLine.match(attrPattern('Str'));
            const dexMatch = reqLine.match(attrPattern('Dex'));
            const intMatch = reqLine.match(attrPattern('Int'));

            if (strMatch) requirements.str = parseInt(strMatch[1], 10);
            if (dexMatch) requirements.dex = parseInt(dexMatch[1], 10);
            if (intMatch) requirements.int = parseInt(intMatch[1], 10);
            
            return requirements;
        }

        // PoE1 block format: "Requirements:\nLevel: 67\nStr: 66\n..."
        const blockStartIndex = lines.findIndex(line => line === 'Requirements:');
        if (blockStartIndex !== -1) {
            for (let i = blockStartIndex + 1; i < lines.length; i++) {
                const line = lines[i];
                if (line.startsWith('--------') || !line.includes(':')) break;
                
                const match = line.match(/([\w\s]+?):\s*(\d+)(?:\s*\(.*?\))?/i);
                if (match) {
                    const key = match[1].toLowerCase().replace(/\s+/g, '');
                    requirements[key] = parseInt(match[2], 10);
                }
            }
        }

        return requirements;
    }

    private extractItemLevel(lines: string[], itemClass: string, rarity: string): number {
        const ilvlLine = lines.find(line => line.startsWith('Item Level:'));
        if (ilvlLine) {
            const match = ilvlLine.match(/Item Level:\s*(\d+)/i);
            if (match) {
                return parseInt(match[1], 10);
            }
        }

        const isGem = /gem/i.test(itemClass) || /^gem$/i.test(rarity);
        if (isGem) {
            const gemLevelLine = lines.find(line => /^Level:\s*\d+/i.test(line));
            if (gemLevelLine) {
                const gemMatch = gemLevelLine.match(/^Level:\s*(\d+)/i);
                if (gemMatch) {
                    return parseInt(gemMatch[1], 10);
                }
            }
        }

        return 0;
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
        const isModHeader = (s: string) => {
            // Headers like: { Prefix Modifier "Coursing" (Tier: 3) — Damage, Elemental, Lightning }
            return /^\{.*\bModifier\b.*\}$/i.test(s);
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
            // Preserve mod headers (for whittling tier extraction) AND actual mods
            if (isModHeader(line) || looksLikeMod(line)) {
                modifiers.push(line);
            }
        }
        return modifiers;
    }

    private extractStatusFlags(lines: string[], fullText: string): {
        corrupted: boolean;
        isCorrupted: boolean;
        sanctified: boolean;
        isSanctified: boolean;
        fractured: boolean;
        isFractured: boolean;
        desecrated: boolean;
        isDesecrated: boolean;
        veiled: boolean;
        isVeiled: boolean;
        mirrored: boolean;
        isMirrored: boolean;
        foiled: boolean;
        isFoiled: boolean;
        isIdentified: boolean;
        isModifiable: boolean;
        // PoE1 influence flags
        isWarlord?: boolean;
        isHunter?: boolean;
        isRedeemer?: boolean;
        isCrusader?: boolean;
        isElder?: boolean;
        isShaper?: boolean;
        isSynthesis?: boolean;
        isExarch?: boolean;
        isEater?: boolean;
        isInfluenced?: boolean;
        influenceCount?: number;
        waystoneTier?: number;
        mapTier?: number;
        waystoneBonuses?: Array<{ text: string; value: number | null }>;
    } {
        const normalized = lines.map(line => line.trim().toLowerCase()).filter(Boolean);

        const hasCorrupted = normalized.some(line => line === 'corrupted');
        const hasSanctified = normalized.some(line => line === 'sanctified');
        const hasFractured = normalized.some(line => line === 'fractured item');
        const hasMirrored = normalized.some(line => line === 'mirrored');
        const hasFoil = normalized.some(line => line === 'foil unique');
        const hasUnidentified = normalized.some(line => line === 'unidentified');
        const hasDesecrated = normalized.some(line => line.includes('(desecrated)') || /desecrated\s+(?:prefix|suffix)/i.test(line));
        const hasVeiled = normalized.some(line => /desecrated\s+(?:prefix|suffix)/i.test(line));

        const result: ReturnType<typeof this.extractStatusFlags> = {
            corrupted: hasCorrupted,
            isCorrupted: hasCorrupted,
            sanctified: hasSanctified,
            isSanctified: hasSanctified,
            fractured: hasFractured,
            isFractured: hasFractured,
            desecrated: hasDesecrated,
            isDesecrated: hasDesecrated,
            veiled: hasVeiled,
            isVeiled: hasVeiled,
            mirrored: hasMirrored,
            isMirrored: hasMirrored,
            foiled: hasFoil,
            isFoiled: hasFoil,
            isIdentified: !hasUnidentified,
            isModifiable: !(hasCorrupted || hasSanctified || hasMirrored)
        };

        // PoE1-specific influence detection
        if (this.game === 'poe1') {
            const isWarlord = fullText.includes('Warlord Item');
            const isHunter = fullText.includes('Hunter Item');
            const isRedeemer = fullText.includes('Redeemer Item');
            const isCrusader = fullText.includes('Crusader Item');
            const isElder = fullText.includes('Elder Item');
            const isShaper = fullText.includes('Shaper Item');
            const isSynthesis = fullText.includes('Synthesised Item');
            const isExarch = fullText.includes('Searing Exarch Item');
            const isEater = fullText.includes('Eater of Worlds Item');

            const isInfluenced = isWarlord || isHunter || isRedeemer || isCrusader || isElder || isShaper || isSynthesis || isExarch || isEater;
            const influenceCount = [isWarlord, isHunter, isRedeemer, isCrusader, isElder, isShaper, isSynthesis, isExarch, isEater].filter(Boolean).length;

            Object.assign(result, {
                isWarlord,
                isHunter,
                isRedeemer,
                isCrusader,
                isElder,
                isShaper,
                isSynthesis,
                isExarch,
                isEater,
                isInfluenced,
                influenceCount
            });
        }

        // Extract waystone/map tier and bonuses
        const itemClassLine = lines.find(l => l.startsWith('Item Class:'));
        const itemClass = itemClassLine ? itemClassLine.replace('Item Class:', '').trim() : '';

        if (itemClass === 'Waystones' || itemClass === 'Maps') {
            const augmentedLines = fullText.match(/\n(.*) \(augmented\)/g) || [];
            const waystoneBonuses = augmentedLines.map(line => {
                const m = line.trim().match(/([\+\d%-]+)[^\(]*\(([^)]+)\)/);
                return {
                    text: line.split(':')[0].trim(),
                    value: m ? parseInt(m[1].replace(/[+%]/g, ''), 10) : null
                };
            });

            if (itemClass === 'Waystones') {
                const tierMatch = fullText.match(/Waystone Tier:\s*(\d+)/i);
                if (tierMatch) {
                    result.waystoneTier = parseInt(tierMatch[1], 10);
                }
            } else if (itemClass === 'Maps') {
                const tierMatch = fullText.match(/Map Tier:\s*(\d+)/i);
                if (tierMatch) {
                    result.mapTier = parseInt(tierMatch[1], 10);
                }
            }

            if (waystoneBonuses.length > 0) {
                result.waystoneBonuses = waystoneBonuses;
            }
        }

        return result;
    }

    private extractSockets(text: string): { sockets?: number; socketsPoe1?: string[][] } {
        const result: { sockets?: number; socketsPoe1?: string[][] } = {};

        if (this.game === 'poe1') {
            // PoE1: "Sockets: R-G B-B-R W"
            const poe1Match = text.match(/Sockets:\s*([RGBWA\- ]+)/i);
            if (poe1Match) {
                const raw = poe1Match[1].trim();
                const groups = raw.split(/\s+/);
                result.socketsPoe1 = groups.map(group => group.split('-'));
                result.sockets = result.socketsPoe1.flat().length;
            }
        } else {
            // PoE2: "Sockets: S S S" or "Sockets: G G G G" (gems)
            const poe2Match = text.match(/Sockets:\s*([SJG\s]+)/i);
            if (poe2Match) {
                const chars = poe2Match[0].match(/[SJG]/g) || [];
                result.sockets = chars.length;
            }
        }

        return result;
    }

    // Helper to extract numeric values from modifier text and detect exceptional rolls
    private parseValues(text: string): { numbers: number[]; isExceptional: boolean } {
        const numbers: number[] = [];
        const valuePattern = /([+-]?\d+(?:\.\d+)?)(?:%?)\s*(?:\(\s*([+-]?\d+(?:\.\d+)?)(?:%?)\s*(?:-\s*([+-]?\d+(?:\.\d+)?)(?:%?)\s*)?\))?/g;
        let match: RegExpExecArray | null;

        while ((match = valuePattern.exec(text)) !== null) {
            const actual = parseFloat(match[1]);
            if (!Number.isNaN(actual)) {
                numbers.push(actual);
            }

            if (match[2]) {
                const lower = parseFloat(match[2]);
                if (!Number.isNaN(lower)) {
                    numbers.push(lower);
                }
            }

            if (match[3]) {
                const upper = parseFloat(match[3]);
                if (!Number.isNaN(upper)) {
                    numbers.push(upper);
                }
            }
        }

        let isExceptional = false;
        const rangePattern = /([+-]?\d+(?:\.\d+)?)\s*\(\s*([+-]?\d+(?:\.\d+)?)(?:%?)\s*(?:-\s*([+-]?\d+(?:\.\d+)?)(?:%?)\s*)?\)/g;
        let rangeMatch: RegExpExecArray | null;

        while ((rangeMatch = rangePattern.exec(text)) !== null) {
            const actual = parseFloat(rangeMatch[1]);
            const low = parseFloat(rangeMatch[2]);
            const high = rangeMatch[3] !== undefined ? parseFloat(rangeMatch[3]) : low;

            if (Number.isNaN(actual) || Number.isNaN(low) || Number.isNaN(high)) {
                continue;
            }

            const min = Math.min(low, high);
            const max = Math.max(low, high);
            if (actual < min || actual > max) {
                isExceptional = true;
                break;
            }
        }

        return { numbers, isExceptional };
    }

    // Helper to parse a single modifier section
    private parseMod(section: string, modType: 'implicit' | 'explicit' | 'unique'): OrganizedModifier | null {
        try {
            let name = '';
            let tier: number | undefined;
            let tags: string[] = [];
            let modString = '';

            if (modType === 'implicit') {
                // Format: { Implicit Modifier — tags }\nmod text
                const parts = section.split(' }\n');
                if (parts.length < 2) return null;

                const tagString = parts[0].trim();
                tags = tagString ? tagString.split(', ').map(t => t.trim()) : [];
                const valueSection = parts[1].split(/\n--------|\n$/)[0];
                modString = valueSection.replace(/ \(implicit\)$/gm, '').trim();
            } else if (modType === 'unique') {
                // Format: { Unique Modifier }\nmod text
                const parts = section.split(' }\n');
                if (parts.length < 2) return null;
                
                const valueSection = parts[1].split(/\n--------|\n$/)[0];
                modString = valueSection.trim();
            } else {
                // explicit: { Prefix/Suffix Modifier "name" (Tier: X) — tags }\nmod text
                let match = section.match(/^([^"]+)" \(Tier: (\d+)\) — ([^}]+) }\n(.+?)(?:\n--------|\n$|$)/s);
                if (match) {
                    name = match[1].trim();
                    tier = parseInt(match[2], 10);
                    tags = match[3].split(', ').map(t => t.trim());
                    modString = match[4].trim();
                } else {
                    // Try with tier but no tags
                    match = section.match(/^([^"]+)" \(Tier: (\d+)\) }\n(.+?)(?:\n--------|\n$|$)/s);
                    if (match) {
                        name = match[1].trim();
                        tier = parseInt(match[2], 10);
                        modString = match[3].trim();
                    } else {
                        // Try without tier but with tags
                        match = section.match(/^([^"]+)" — ([^}]+) }\n(.+?)(?:\n--------|\n$|$)/s);
                        if (match) {
                            name = match[1].trim();
                            tags = match[2].split(', ').map(t => t.trim());
                            modString = match[3].trim();
                        } else {
                            // Try without tier and without tags
                            match = section.match(/^([^"]+)" }\n(.+?)(?:\n--------|\n$|$)/s);
                            if (match) {
                                name = match[1].trim();
                                modString = match[2].trim();
                            } else {
                                return null;
                            }
                        }
                    }
                }
            }

            const hasVeiledMarker = /Desecrated\s+(?:Prefix|Suffix)/i.test(section) || /Desecrated\s+(?:Prefix|Suffix)/i.test(modString);
            const isFractured = /\(fractured\)/i.test(modString);
            const isDesecrated = /\(desecrated\)/i.test(modString) || hasVeiledMarker;
            const isCrafted = /\(crafted\)/i.test(modString);

            modString = modString
                .replace(/\(fractured\)/gi, '')
                .replace(/\(desecrated\)/gi, '')
                .replace(/\(crafted\)/gi, '')
                .trim();

            const { numbers, isExceptional } = this.parseValues(modString);

            return {
                name,
                tier,
                tags,
                string: modString,
                values: numbers,
                isFractured,
                isDesecrated,
                isVeiled: hasVeiledMarker,
                isCrafted,
                hasExceptionalValue: isExceptional
            };
        } catch (e) {
            console.warn(`[Parser] Failed to parse ${modType} mod section:`, e);
            return null;
        }
    }

    // New organized modifier extraction using regex patterns (based on game format markers)
    private extractOrganizedModifiers(itemText: string): ParsedItem['organizedModifiers'] {
        const result: NonNullable<ParsedItem['organizedModifiers']> = {
            enchant: [],
            implicit: [],
            explicit: [],
            rune: []
        };

        if (this.game === 'poe1') {
            result.crucible = [];
        }

        try {
            // Extract enchant mods: lines ending with (enchant)
            const enchantMatches = itemText.match(/^(.+) \(enchant\)$/gm);
            if (enchantMatches) {
                enchantMatches.forEach(line => {
                    const modString = line.replace(/ \(enchant\)$/, '').trim();
                    const { numbers, isExceptional } = this.parseValues(modString);
                    result.enchant.push({
                        tags: [],
                        string: modString,
                        values: numbers,
                        hasExceptionalValue: isExceptional
                    });
                });
            }

            // Extract rune mods: lines ending with (rune)
            const runeMatches = itemText.match(/^(.+) \(rune\)$/gm);
            if (runeMatches) {
                runeMatches.forEach(line => {
                    const modString = line.replace(/ \(rune\)$/, '').trim();
                    const { numbers, isExceptional } = this.parseValues(modString);
                    result.rune.push({
                        tags: [],
                        string: modString,
                        values: numbers,
                        hasExceptionalValue: isExceptional
                    });
                });
            }

            // Extract implicit mods (including PoE1 influence implicits)
            const implicitPattern = this.game === 'poe1' 
                ? /\{ (?:Implicit Modifier|(?:Warlord|Hunter|Redeemer|Crusader|Elder|Shaper|Searing Exarch|Eater of Worlds) Implicit Modifier(?: \([^)]+\))?)(?: — )?/
                : /\{ Implicit Modifier(?: — )?/;
            
            const implicitSections = itemText.split(implicitPattern);
            implicitSections.shift();
            
            implicitSections.forEach(section => {
                const mod = this.parseMod(section, 'implicit');
                if (mod) result.implicit.push(mod);
            });

            // Extract explicit mods (including PoE1 master crafted)
            const explicitPattern = this.game === 'poe1'
                ? /\{ (?:Prefix|Suffix|Master Crafted Prefix|Master Crafted Suffix) Modifier "/
                : /\{ (?:Prefix|Suffix) Modifier "/;
            
            const explicitSections = itemText.split(explicitPattern);
            explicitSections.shift();
            
            explicitSections.forEach(section => {
                const mod = this.parseMod(section, 'explicit');
                if (mod) result.explicit.push(mod);
            });

            // Extract unique mods
            const uniqueSections = itemText.split(/\{ Unique Modifier }/);
            uniqueSections.shift();
            
            uniqueSections.forEach(section => {
                const mod = this.parseMod(section, 'unique');
                if (mod) result.explicit.push(mod); // Add to explicit array
            });

            // PoE1: Extract crucible mods
            if (this.game === 'poe1') {
                const crucibleSections = itemText.split(/\{ Allocated Crucible Passive Skill(?: \(Tier: \d+\))? }/);
                crucibleSections.shift();
                
                crucibleSections.forEach(section => {
                    const modString = section.split('--------')[0].trim();
                    const { numbers, isExceptional } = this.parseValues(modString);
                    result.crucible!.push({
                        tags: [],
                        string: modString,
                        values: numbers,
                        hasExceptionalValue: isExceptional
                    });
                });
            }

        } catch (e) {
            console.error('[Parser] Failed to extract organized modifiers:', e);
        }

        return result;
    }

    private determineAttributeType(
        requirements: ParsedItem['requirements'],
        itemClass: string,
        baseType: string,
        lines: string[]
    ): string {
        const hasStr = requirements.str && requirements.str > 0;
        const hasDex = requirements.dex && requirements.dex > 0;
        const hasInt = requirements.int && requirements.int > 0;

        const attributeItemClasses = new Set(['Body Armours', 'Helmets', 'Gloves', 'Boots', 'Shields']);
        if (this.game === 'poe1' && attributeItemClasses.has(itemClass)) {
            const inferred = this.inferAttributeFromDefences(lines, baseType);
            if (inferred) {
                return inferred;
            }
        }

        if (hasStr && hasDex && hasInt) {
            // If all three stats are present, drop the lowest requirement and normalize the pair
            const attrs = [
                { type: 'str', value: requirements.str ?? 0 },
                { type: 'dex', value: requirements.dex ?? 0 },
                { type: 'int', value: requirements.int ?? 0 }
            ].sort((a, b) => b.value - a.value);

            const topTwo = attrs.slice(0, 2).map(attr => attr.type);
            const pair = new Set(topTwo);
            if (pair.has('str') && pair.has('dex')) return 'str_dex';
            if (pair.has('str') && pair.has('int')) return 'str_int';
            if (pair.has('dex') && pair.has('int')) return 'dex_int';
            return 'str_dex';
        }

        if (hasStr && hasDex) return 'str_dex';
        if (hasStr && hasInt) return 'str_int';
        if (hasDex && hasInt) return 'dex_int';
        if (hasStr) return 'str';
        if (hasDex) return 'dex';
        if (hasInt) return 'int';

        return 'str'; // Default fallback
    }

    private inferAttributeFromDefences(lines: string[], baseType: string): string | null {
        const hasArmour = lines.some(line => /^Armour:\s*\d+/i.test(line));
        const hasEvasion = lines.some(line => /^Evasion Rating:\s*\d+/i.test(line));
        const hasEnergyShield = lines.some(line => /^Energy Shield:\s*\d+/i.test(line));

        if (!hasArmour && !hasEvasion && !hasEnergyShield) {
            if (/(gauntlet|greave|sabatons?|helm|towe?r shield|kite shield|buckler|tower shield)/i.test(baseType)) {
                return 'str';
            }
            return null;
        }

        if (hasArmour && !hasEvasion && !hasEnergyShield) return 'str';
        if (!hasArmour && hasEvasion && !hasEnergyShield) return 'dex';
        if (!hasArmour && !hasEvasion && hasEnergyShield) return 'int';
        if (hasArmour && hasEvasion && !hasEnergyShield) return 'str_dex';
        if (hasArmour && !hasEvasion && hasEnergyShield) return 'str_int';
        if (!hasArmour && hasEvasion && hasEnergyShield) return 'dex_int';

        return null;
    }

    private determineCategory(itemClass: string, attributeType: string, baseType: string, name: string): string {
        // Special-case early exits before unknown check
        // Socketables (Runes / Soul Cores)
        if (/^Socketable$/i.test(itemClass)) {
            return 'Socketables';
        }
        if (/^Divination Cards?$/i.test(itemClass)) {
            return 'Divination_Cards';
        }
        if (/^Map Fragments$/i.test(itemClass)) {
            const fragmentSource = `${name} ${baseType}`.toLowerCase();
            if (/scarab/.test(fragmentSource)) return 'Scarabs';
            if (/allflame|ember/.test(fragmentSource)) return 'Embers';
            // Fall through for other fragment types – handled by default logic.
        }
        // PoE1: Runegraft detection
        if (/^Stackable Currency$/i.test(itemClass)) {
            const runegraftCheck = `${name} ${baseType}`.toLowerCase();
            if (/runegraft/.test(runegraftCheck)) return 'Runegrafts';
        }
        const baseCategory = this.categoryMappings[itemClass] || (itemClass === 'Jewels' ? 'Jewels' : '');
        if (!baseCategory) {
            // Only log if itemClass is not empty (suppress spam when clipboard is empty/junk during polling)
            if (itemClass && itemClass.trim()) {
                console.warn(`Unknown item class: ${itemClass}`);
            }
            return 'unknown';
        }
        if (baseCategory === 'Stackable_Currency') {
            const stackableBlob = `${name} ${baseType}`.toLowerCase();
            if (/essence/.test(stackableBlob)) return 'Essences';
            if (/catalyst/.test(stackableBlob)) return 'Catalysts';
            // Match oils (Silver Oil, Golden Oil, etc.) - route to PoE1 Anointments
            if (/\boil\b/.test(stackableBlob)) return 'Annoints';
            // Match any item containing "Liquid" (covers all liquid emotions: Liquid Paranoia, Concentrated Liquid Isolation, Diluted Liquid Ire, etc.)
            if (/liquid/i.test(name) || /liquid/i.test(baseType)) {
                return 'Liquid_Emotions';
            }
            if (/^omen\s+of\s+/i.test(name)) return 'Omens';
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
            const stackableBlob = `${name} ${baseType}`.toLowerCase();
            if (/essence/.test(stackableBlob)) return 'Essences';
            if (/catalyst/.test(stackableBlob)) return 'Catalysts';
            // Match oils (Silver Oil, Golden Oil, etc.) - route to PoE1 Anointments
            if (/\boil\b/.test(stackableBlob)) return 'Annoints';
            // Match any item containing "Liquid" (covers all liquid emotions)
            if (/liquid/.test(stackableBlob)) return 'Liquid_Emotions';
            if (/^omen\s+of\s+/i.test(name)) return 'Omens';
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
            if (/searching\s+eye/i.test(bt)) return 'Searching_Eye_Jewel';
            if (/murderous\s+eye/i.test(bt)) return 'Murderous_Eye_Jewel';
            if (/hypnotic\s+eye/i.test(bt)) return 'Hypnotic_Eye_Jewel';
            if (/ghastly\s+eye/i.test(bt)) return 'Ghastly_Eye_Jewel';
            if (/timeless\s+jewel/i.test(bt)) return 'Timeless_Jewel';
            if (/prismatic\s+jewel/i.test(bt)) return 'Prismatic_Jewel';
            if (/crimson\s+jewel/i.test(bt)) return 'Crimson_Jewel';
            if (/viridian\s+jewel/i.test(bt)) return 'Viridian_Jewel';
            if (/cobalt\s+jewel/i.test(bt)) return 'Cobalt_Jewel';
            if (/ruby/i.test(bt)) return 'Ruby';
            if (/emerald/i.test(bt)) return 'Emerald';
            if (/sapphire/i.test(bt)) return 'Sapphire';
            return 'Jewels'; // fallback generic
        }

        if (this.game === 'poe1') {
            const bt = (baseType || name || '').toLowerCase();
            const override = POE1_BASETYPE_CATEGORY_OVERRIDES[bt];
            if (override) {
                return override;
            }
            if (bt.startsWith('blueprint')) {
                return 'Blueprints';
            }
            if (bt.startsWith('contract')) {
                return 'Contracts';
            }
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