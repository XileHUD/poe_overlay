/**
 * Pre-computed diff between PoE1 passive trees 3.27 and 3.28 (Mirage league).
 * Both trees are static, so we store the diff as a constant rather than computing at runtime.
 */
export const passiveTreeDiff327to328 = `PoE1 Passive Tree  3.27 -> 3.28 (Mirage)
------------------------------------------------------------
Total nodes: 2808 -> 2863 (+55 added, 0 removed, 26 changed)

NEW NODES (+55)
  > Notable (10)
      - Afarud Ritual  ->  Damageable Minions deal 30% increased Damage for each second they have been alive, up to a maximum of 150% / Damageable Minions take 5% increased Damage for each second they have been alive, up to a maximum of 50%
      - Armour Display
      - Bitter Lash  ->  Skills from Equipped Main Hand Weapon are supported by level 1 Cruelty
      - Bound Flesh  ->  Gain 20 Baryatic Tension per 20 Life Spent on Upfront Costs of Spells / Maximum Baryatic Tension is equal to 30% of maximum Life / When you take a Savage Hit, lose Baryatic Tension to recover that much Life, up to maximum
      - Caster Weapon Display
      - Glory of Command  ->  40% increased Global Accuracy Rating while you have at least 1 nearby Ally / 15% increased Area of Effect for Attacks while you have at least 1 nearby Ally
      - Jewellery Display
      - Marshal of Divinity  ->  Inflict Hallowing Flame on Melee Hit / You can inflict +1 Hallowing Flame on Enemies / Gain 10% of Physical Damage as Extra Lightning Damage for each of your Hallowing Flames that have been removed by an allied hit recently, up to 80%
      - Martial Weapon Display
      - Shining Justice  ->  20% increased Effect of Consecrated Ground you create / Consecrated Ground you create grants 30% increased Accuracy Rating to you and Allies
  > Mastery (2)
      - Accuracy Mastery
      - Accuracy Mastery
  > Normal (41)
      - Accuracy  ->  15% increased Global Accuracy Rating
      - Accuracy  ->  +30 to Accuracy Rating / 10% increased Global Accuracy Rating
      - Accuracy  ->  +20 to Accuracy Rating / 6% increased Global Accuracy Rating
      - Astral Projector  ->  Nova Spells Cast at the targeted location instead of around you / Spell Skills have 25% increased Area of Effect
      - Astramentis  ->  +60 to all Attributes
      - Attack Area of Effect and Accuracy  ->  10% increased Global Accuracy Rating / 8% increased Area of Effect for Attacks
      - Beltimber Blade  ->  80% increased Evasion Rating while moving / Skills fire 2 additional Projectiles if you've used a Movement Skill Recently
      - Cadigan's Authority  ->  +3 to maximum number of Summoned Totems / You cannot have more than 2 Summoned Totems of the same type
      - Consecrated Ground Effect  ->  20% increased Effect of Consecrated Ground you create
      - Consecrated Ground Effect and Accuracy  ->  10% increased Global Accuracy Rating / 10% increased Effect of Consecrated Ground you create
      - Cybil's Paw  ->  Gain 20 Life per Enemy Hit with Spells / 8% increased Spell Damage per 5% Chance to Block Attack Damage
      - Damage Over Time Multiplier  ->  +8% to Damage over Time Multiplier
      - Grace of the Goddess  ->  +2 to maximum number of Sacred Wisps / +2 to number of Sacred Wisps Summoned
      - Hallowing Flame Effect  ->  20% increased magnitude of Hallowing Flame you inflict
      - Jack, the Axe  ->  Grants Level 30 Thirst for Blood Skill
      - Kiloava's Bluster  ->  25% chance to Avoid Elemental Ailments / 40% chance for Elemental Resistances to count as being 90% against Enemy Hits
      - Kitava's Feast  ->  Melee Strike Skills deal Splash Damage to surrounding targets / Recover 5% of Life on Kill / Enemies Killed by your Hits are destroyed
      - Maata's Teaching  ->  Minions' Base Attack Critical Strike Chance is equal to the Critical Strike Chance of your Main Hand Weapon
      - Maw of Conquest  ->  Unaffected by Poison / 40% of Damage taken Recouped as Life
      - Maximum Life  ->  8% increased maximum Life
      - Minion Damage  ->  Minions deal 25% increased Damage
      - Mystic Refractor  ->  Spells fire 2 additional Projectiles / Projectiles cannot continue after colliding with targets
      - Passive Point  ->  Grants 1 Passive Skill Point
      - Passive Point  ->  Grants 1 Passive Skill Point
      - Passive Point  ->  Grants 1 Passive Skill Point
      - Passive Point  ->  Grants 1 Passive Skill Point
      - Passive Point  ->  Grants 1 Passive Skill Point
      - Passive Point  ->  Grants 1 Passive Skill Point
      - Passive Point  ->  Grants 1 Passive Skill Point
      - Passive Point  ->  Grants 1 Passive Skill Point
      - Prospero's Protection  ->  Armour from Equipped Shield is doubled / +10% Chance to Block Attack Damage / Gain no Armour from Equipped Body Armour
      - Replica Heartbreaker  ->  60% chance to Impale on Spell Hit
      - Tear of Purity  ->  Grants Level 30 Purity of Elements Skill / Purity of Elements has 100% increased Mana Reservation Efficiency
      - Terminus Est  ->  10% increased Movement Speed / Gain a Frenzy Charge on Critical Strike
      - The Brass Dome  ->  +3% to all maximum Elemental Resistances / Strength provides no bonus to Maximum Life / Removes all Energy Shield / Armour from Equipped Body Armour is doubled / Take no Extra Damage from Critical Strikes
      - The Burden of Shadows  ->  Spells deal added Chaos Damage equal to 5% of your maximum Life / Skills Cost Life instead of 50% of Mana Cost
      - The Burden of Truth  ->  33% of Non-Chaos Damage taken bypasses Energy Shield / 33% of Chaos Damage taken does not bypass Energy Shield / Gain 10% of Maximum Life as Extra Maximum Energy Shield
      - Veruso's Ambition  ->  Grants Level 20 Ravenous Skill / Enemies display their Monster Category / +23% to Chaos Resistance / 20% increased Movement Speed
      - Victario's Influence  ->  40% increased Area of Effect of Aura Skills / 15% increased Reservation Efficiency of Skills / +2 to Level of all Aura Skill Gems
      - Warped Timepiece  ->  Debuffs on you expire 100% faster
      - Widowhail  ->  75% increased bonuses gained from Equipped Quiver
  > Ascendancy_Start (2)
      - Necromantic
      - Scavenger

REMOVED NODES (none)

CHANGED NODES (~26)
  > Arcane Blessing  (Notable)
      -  Arcane Surge grants 20% more Spell Damage to you
      +  Arcane Surge also grants 20% more Spell Damage to you
  > Assassin  (Normal)
      -  Damage from your Critical Strikes cannot be Reflected
      +  Damage cannot be Reflected
  > Avatar of the Wilds  (Notable)
      -  80% more Elemental Damage while Unbound
      +  100% more Elemental Damage while Unbound
  > Boon of the Mountain  (Normal)
      -  30% less Damage Taken from Damage over Time while you have Unbroken Ward
      +  50% less Damage Taken from Damage over Time while you have Unbroken Ward
  > Boon of the Sun  (Normal)
      -  20% faster Restoration of Ward per Enemy Hit taken Recently
      +  30% faster Restoration of Ward per Enemy Hit taken Recently
  > Calculated Risk  (Notable)
      +  Damage of Enemies Hitting you is Unlucky
  > Cryogenesis  (Notable)
      name: "Otherworldly Appendages" -> "Cryogenesis"
      -  Take 15% less Lightning Damage with at least one Eshgraft grafted to you
      -  Take 15% less Cold Damage with at least one Tulgraft grafted to you
      -  Take 15% less Physical Damage with at least one Uulgraft grafted to you
      -  Take 15% less Fire Damage with at least one Xophgraft grafted to you
      -  Nearby Enemies take 100% increased Damage from Graft Skills
      +  You gain Added Cold Damage instead of Added Damage of other types if Dexterity exceeds both other Attributes
      +  You gain Added Lighting Damage instead of Added Damage of other types if Intelligence exceeds both other Attributes
      +  Elemental Hit's Added Damage cannot be replaced this way
  > Defiled Forces  (Notable)
      -  Refresh Duration of Ignite, Chill and Shock on Enemies you Curse
      +  Curse Skills have 15% increased Cast Speed
      +  Refresh Duration of Chill and Shock on Enemies you Curse
  > Enhanced Starlight  (Notable)
      -  40% increased Ward from Equipped Armour Items
      +  70% increased Ward from Equipped Armour Items
  > Hierophant  (Normal)
      -  Arcane Surge grants 10% more Spell Damage to you
      +  Arcane Surge also grants 10% more Spell Damage to you
  > Hinekora, Death's Fury  (Notable)
      -  Enemies you or your Totems Kill have 5% chance to Explode, dealing 500% of their maximum Life as Fire Damage
      +  Enemies you or your Totems Kill have 10% chance to Explode, dealing 250% of their maximum Life as Fire Damage
  > Lesson of the Seasons  (Notable)
      -  -15 Fire, Cold and Lightning Damage taken from Spell Hits per Bark
      +  -25 Damage taken of each Damage Type from Spell Hits per Bark
  > Liege of the Primordial  (Notable)
      -  50% increased Effect of Buffs granted by your Golems
  > Like Clockwork  (Notable)
      -  40% increased Cooldown Recovery Rate
      +  50% increased Cooldown Recovery Rate
  > Master Toxicist  (Notable)
      -  When you kill a Poisoned Enemy during any Flask Effect, nearby Enemies are Poisoned
      +  When you kill a Poisoned Enemy during any Flask Effect, Enemies within 1.5 metres are Poisoned
  > Opportunistic  (Notable)
      -  Damage from your Critical Strikes cannot be Reflected
      +  Damage cannot be Reflected
  > Perfect Crime  (Notable)
      -  35% less Damage with Triggered Spells
      +  30% less Damage with Triggered Spells
  > Primal Roar  (Notable)
      -  2% increased Attack Speed per Minion, up to a maximum of 80%
      +  4% increased Attack Speed per Minion, up to a maximum of 80%
  > Prolonged Servitude  (Notable)
      -  Minions deal 15% more Damage while they are on Low Life
      +  Minions deal 20% more Damage while they are on Low Life
  > Sinner Saint  (Notable)
      -  50% of Lightning Damage Converted to Chaos Damage
      -  50% of Cold Damage Converted to Chaos Damage
      -  50% of Fire Damage Converted to Chaos Damage
      +  67% of Lightning Damage Converted to Chaos Damage
      +  67% of Cold Damage Converted to Chaos Damage
      +  67% of Fire Damage Converted to Chaos Damage
  > The King's Contempt  (Normal)
      -  Discipline has 50% increased Aura Effect while you have no Power Charges
      +  Discipline has 50% increased Aura Effect while at Minimum Power Charges
  > The King's Heritage  (Normal)
      -  Determination has 50% increased Aura Effect while you have no Endurance Charges
      +  Determination has 50% increased Aura Effect while at Minimum Endurance Charges
  > The King's Might  (Normal)
      -  Grace has 50% increased Aura Effect while you have no Frenzy Charges
      +  Grace has 50% increased Aura Effect while at Minimum Frenzy Charges
  > The Vivid Cat  (Notable)
      -  50% increased Stealth while Elusive
      +  50% increased Effect of your Marks while Elusive
  > Time of Need  (Notable)
      -  Every 4 seconds, remove Curses and Elemental Ailments from you
      +  Every 4 seconds, remove Curses and Ailments from you
  > Unlight Silhouette  (Notable)
      -  Skills gain Added Chaos Damage equal to 20% of Life Cost, if Life Cost is not higher than the maximum you could spend
      +  Skills gain Added Chaos Damage equal to 25% of Life Cost, if Life Cost is not higher than the maximum you could spend

Classes: 7  |  Graphs (ascendancies): 35`;
