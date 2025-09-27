// Static data definitions for Regex tool
// Provided by user specification

export interface RegexAtomGroup {
  label: string;
  atoms: string[];
}

export const GLOBALS: RegexAtomGroup[] = [
  { label: 'Waystone drop chance over N%', atoms: ['PG.*drop.*chance'] },
  { label: 'Players in area are N% delirious', atoms: ['PG.*delir'] },
  { label: 'Area contains N additional packs (20–50)', atoms: ['(2.|3.|4.|50).*add.*packs'] }
];

export const MODS: RegexAtomGroup[] = [
  { label: '% less effect of Curses on Monsters • % increased Rarity of Items found in this Area', atoms: ['PG.*less.*curses.*mon','PG.*rar..(?!ch)'] },
  { label: '% increased Magic Monsters • Area has patches of Ignited Ground', atoms: ['PG.*magic.*mon','patch.*ignit'] },
  { label: '% increased Magic Monsters • Monsters deal % of Damage as Extra Fire', atoms: ['PG.*magic.*mon','deal.*PG.*extra.*fire'] },
  { label: '% increased Magic Monsters • Players are periodically Cursed with Enfeeble', atoms: ['PG.*magic.*mon','period.*curs.*enfeeb'] },
  { label: '% increased number of Rare Monsters • % increased Monster Damage', atoms: ['PG.*num.*rare.*mon','PG.*mon.*dam'] },
  { label: '% increased number of Rare Monsters • % more Monster Life', atoms: ['PG.*num.*rare.*mon','PG.*more.*mon.*life'] },
  { label: '% increased number of Rare Monsters • Monsters are Armoured', atoms: ['PG.*num.*rare.*mon','mon.*armou?red'] },
  { label: 'Area contains # additional packs of Beasts • % increased Pack size', atoms: ['CG.*add.*packs.*beast','PG.*ed.pa'] },
  { label: 'Area contains # additional packs of Bramble Monsters • % increased Pack size', atoms: ['CG.*add.*packs.*bramble','PG.*ed.pa'] },
  { label: 'Area contains # additional packs of Ezomyte Monsters • % increased Pack size', atoms: ['CG.*add.*packs.*ezomyte','PG.*ed.pa'] },
  { label: 'Area contains # additional packs of Faridun Monsters • % increased Rarity of Items found in this Area', atoms: ['CG.*add.*packs.*faridun','PG.*rar..(?!ch)'] },
  { label: 'Area contains # additional packs of Iron Guards • % increased number of Rare Monsters', atoms: ['CG.*add.*packs.*iron.*guard','PG.*num.*rare.*mon'] },
  { label: 'Area contains # additional packs of Plagued Monsters • % increased Rarity of Items found in this Area', atoms: ['CG.*add.*packs.*plag','PG.*rar..(?!ch)'] },
  { label: 'Area contains # additional packs of Transcended Monsters • % increased number of Rare Monsters', atoms: ['CG.*add.*packs.*transcend','PG.*num.*rare.*mon'] },
  { label: 'Area contains # additional packs of Undead • % increased Rarity of Items found in this Area', atoms: ['CG.*add.*packs.*undead','PG.*rar..(?!ch)'] },
  { label: 'Area contains # additional packs of Vaal Monsters • % increased Magic Monsters', atoms: ['CG.*add.*packs.*vaal','PG.*magic.*mon'] },
  { label: 'Area has patches of Chilled Ground • % increased Rarity of Items found in this Area', atoms: ['patch.*chill','PG.*rar..(?!ch)'] },
  { label: 'Area has patches of Shocked Ground • % increased Pack size', atoms: ['patch.*shock','PG.*ed.pa'] },
  { label: 'Monsters are Evasive • % increased Pack size', atoms: ['mon.*evasive','PG.*ed.pa'] },
  { label: 'Monsters deal % of Damage as Extra Chaos • % increased Rarity of Items found in this Area', atoms: ['deal.*PG.*extra.*chaos','PG.*rar..(?!ch)'] },
  { label: 'Monsters deal % of Damage as Extra Cold • % increased Rarity of Items found in this Area', atoms: ['deal.*PG.*extra.*cold','PG.*rar..(?!ch)'] },
  { label: 'Monsters deal % of Damage as Extra Lightning • % increased Pack size', atoms: ['deal.*PG.*extra.*light','PG.*ed.pa'] },
  { label: 'Monsters gain % of maximum Life as Extra maximum Energy Shield • % increased Rarity of Items found in this Area', atoms: ['gain.*PG.*life.*extra.*energy.*shield','PG.*rar..(?!ch)'] },
  { label: 'Monsters have % chance to steal Power, Frenzy and Endurance charges on Hit • % increased Pack size', atoms: ['have.*PG.*steal.*charges','PG.*ed.pa'] },
  { label: 'Monsters have % increased Accuracy Rating • % increased Pack size', atoms: ['PG.*accu.*rat','PG.*ed.pa'] },
  { label: 'Players are periodically Cursed with Elemental Weakness • % increased Rarity of Items found in this Area', atoms: ['period.*curs.*ele.*weak','PG.*rar..(?!ch)'] },
  { label: 'Players are periodically Cursed with Temporal Chains • % increased Pack size', atoms: ['period.*curs.*temporal.*chains','PG.*ed.pa'] },
  { label: '% increased Monster Attack Speed • % increased Monster Movement Speed • % increased Monster Cast Speed • % increased Pack size', atoms: ['PG.*att.*sp','PG.*mov.*sp','PG.*cast.*sp','PG.*ed.pa'] },
  { label: '% maximum Player Resistances • % increased Pack size', atoms: ['PG.*max.*player.*res','PG.*ed.pa'] },
  { label: '% increased Magic Monsters • Monsters have % chance to inflict Bleeding on Hit', atoms: ['PG.*magic.*mon','have.*PG.*bleed'] },
  { label: '% increased Magic Monsters • Monsters have % increased Ailment Threshold • Monsters have % increased Stun Threshold', atoms: ['PG.*magic.*mon','have.*PG.*ailment.*thres','have.*PG.*stun.*thres'] },
  { label: '% increased Magic Monsters • Monsters have % increased Stun Buildup', atoms: ['PG.*magic.*mon','have.*PG.*stun.*buildup'] },
  { label: '% increased number of Rare Monsters • Monsters Break Armour equal to % of Physical Damage dealt', atoms: ['PG.*num.*rare.*mon','break.*armou?r.*PG.*phys'] },
  { label: '% increased number of Rare Monsters • Monsters take % reduced Extra Damage from Critical Hits', atoms: ['PG.*num.*rare.*mon','take.*PG.*reduc.*extra.*crit'] },
  { label: '% increased number of Rare Monsters • Rare Monsters have # additional Modifier', atoms: ['PG.*num.*rare.*mon','rare.*mon.*CG.*add.*mod'] },
  { label: '+% Monster Elemental Resistances • % increased Rarity of Items found in this Area', atoms: ['\\+PG.*mon.*elem.*res','PG.*rar..(?!ch)'] },
  { label: 'Monster Damage Penetrates % Elemental Resistances • % increased Rarity of Items found in this Area', atoms: ['penet.*PG.*elem.*res','PG.*rar..(?!ch)'] },
  { label: 'Monsters fire # additional Projectiles • % increased Pack size', atoms: ['fire.*CG.*add.*proj','PG.*ed.pa'] },
  { label: 'Monsters have % chance to Poison on Hit • % increased Pack size', atoms: ['have.*PG.*poison','PG.*ed.pa'] },
  { label: 'Monsters have % increased Critical Hit Chance • +% to Monster Critical Damage Bonus • % increased Pack size', atoms: ['have.*PG.*crit.*chance','\\+PG.*crit.*damage.*bonus','PG.*ed.pa'] },
  { label: 'Monsters have % increased Area of Effect', atoms: ['PG.*area.*of.*e'] },
  { label: 'Monsters have % increased Freeze Buildup • Monsters have % increased Shock Chance • Monsters inflict % increased Flammability Magnitude • % increased Rarity of Items found in this Area', atoms: ['PG.*freeze.*buildup','PG.*shock.*chance','PG.*flammab.*magn','PG.*rar..(?!ch)'] },
  { label: 'Players gain % reduced Flask Charges • % increased Pack size', atoms: ['gain.*PG.*reduc.*flask.*charges','PG.*ed.pa'] },
  { label: 'Players have % less Cooldown Recovery Rate • % increased Rarity of Items found in this Area', atoms: ['have.*PG.*less.*cooldown.*recovery','PG.*rar..(?!ch)'] },
  { label: 'Players have % less Recovery Rate of Life and Energy Shield • % increased Rarity of Items found in this Area', atoms: ['have.*PG.*less.*recovery.*life.*energy.*shield','PG.*rar..(?!ch)'] }
];
