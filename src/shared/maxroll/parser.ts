/**
 * Maxroll Build Parser
 *
 * Fetches and normalizes Maxroll planner pages into a structured format
 * compatible with the overlay's build system.
 */

export interface MaxrollGem {
  id: string;
  displayName?: string; // Display name from Maxroll (e.g., "Multishot" instead of "Scattershot")
  oldName?: string; // Old metadata name for image fallback (e.g., "Scattershot")
  level?: number;
  quality?: number;
  version?: number; // Gem version (1, 2, 3, etc.) for finding correct image
}

export interface MaxrollSkillGroup {
  gems: MaxrollGem[];
  note?: string;
}

export interface MaxrollSkillStep {
  name: string;
  skills: MaxrollSkillGroup[];
}

export interface MaxrollPassiveVariant {
  name: string;
  history: any[];
}

export interface MaxrollItemSetup {
  id: string;
  name: string;
  items: Record<string, number>;
  priority?: Record<string, any[]>;
}

export interface MaxrollBuild {
  source: 'maxroll';
  title: string;
  author?: string;
  className?: string;
  ascendancyName?: string;
  url?: string;
  passives: MaxrollPassiveVariant[];
  skills: MaxrollSkillStep[];
  equipmentSetups: MaxrollItemSetup[];
  notesMarkdown?: string;
  raw?: any; // keep raw for debugging/fallbacks
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Fetch and parse a Maxroll planner build from a URL
 */
export async function fetchMaxrollBuild(url: string): Promise<MaxrollBuild> {
  const normalized = url.trim();

  // Allow either direct planner URLs or guide URLs that contain a planner link
  if (!/maxroll\.gg\/poe2\/planner\//i.test(normalized)) {
    if (/maxroll\.gg\/poe2\/build-guides\//i.test(normalized)) {
      // Fetch guide page once to get planner link plus TOC headings and unique names
      const guideHtml = await fetchHtml(normalized);
      const plannerUrl = await extractPlannerUrlFromGuideHtml(normalized, guideHtml);
      if (!plannerUrl) {
        throw new Error('Could not find planner link on guide page');
      }
      const guideSections = extractGuideSections(guideHtml, normalized);
      const uniqueNames = extractUniqueNames(guideHtml);
      const gemNames = extractGemNames(guideHtml);
      const build = await fetchPlannerBuild(plannerUrl, uniqueNames, gemNames);
      // Merge guide sections ahead of planner notes as structured sections
      if (guideSections && guideSections.length > 0) {
        const guideSectionsMarkdown = guideSections.map(s => `**${s.title}**\n\n${s.content}`).join('\n\n---\n\n');
        build.notesMarkdown = guideSectionsMarkdown + (build.notesMarkdown ? '\n\n---\n\n' + build.notesMarkdown : '');
      }
      return build;
    }
    throw new Error('Invalid Maxroll URL. Expected a planner or build-guide URL');
  }

  // Direct planner URL path
  return fetchPlannerBuild(normalized);
}

async function fetchPlannerBuild(plannerUrl: string, uniqueNames?: Record<string, string>, gemNames?: Record<string, string>): Promise<MaxrollBuild> {
  const response = await fetch(plannerUrl, {
    headers: {
      'User-Agent': UA,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Maxroll page: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();

  // Try to extract Remix context (Maxroll uses Remix with inline JSON)
  const remixMatch = html.match(/window.__remixContext\s*=\s*(\{[\s\S]*?\});<\/script>/);
  if (!remixMatch) {
    throw new Error('Could not find remix context in Maxroll page');
  }

  const remixJson = remixMatch[1];
  let remixContext: any;
  try {
    remixContext = JSON.parse(remixJson);
  } catch (err: any) {
    throw new Error(`Failed to parse remix context JSON: ${err.message}`);
  }

  // Deep search for a planner object (robust against route key changes)
  const result = findPlannerWithProfile(remixContext);
  if (!result) {
    throw new Error('Could not locate planner data in Maxroll page');
  }

  const { plannerData, profile } = result;
  const planner = plannerData.planner;
  const gemsDb = plannerData.gems || {}; // Extract gems database for accurate display names
  
  // Merge gem names from guide HTML into gemsDb - guide HTML has the correct current names
  if (gemNames) {
    Object.keys(gemNames).forEach(id => {
      const displayName = gemNames[id];
      if (gemsDb[id]) {
        // Update the displayName with the name from guide HTML
        gemsDb[id].displayName = displayName;
        // Also clear oldName since the guide HTML has the current name
        gemsDb[id].oldName = undefined;
      } else {
        // Create a lightweight entry so we can still surface the correct guide-facing name
        gemsDb[id] = { displayName, name: displayName, oldName: undefined };
      }
    });
  }
  
  const title = profile?.name || extractTitle(html) || planner.name || 'Maxroll Build';
  const author = planner.author?.contentCreator || profile?.user?.username || planner.user?.username;
  const { className, ascendancyName } = normalizeAscendancy(planner.ascendancy || profile?.class);

  return {
    source: 'maxroll',
    title,
    author,
    className,
    ascendancyName,
    url: plannerUrl,
    passives: normalizePassives(planner.passives),
    skills: normalizeSkills(planner.skills, gemsDb),
    equipmentSetups: normalizeEquipment(planner.equipment?.variants || [], plannerData.items || {}, uniqueNames),
    notesMarkdown: extractNotes(planner.notes),
    raw: planner,
  };
}

async function extractPlannerUrlFromGuideHtml(guideUrl: string, html: string): Promise<string | null> {
  // Find all planner IDs, excluding generic ones like 'community'
  const regex = /poe2\/planner\/([a-z0-9]+)/gi;
  const matches: string[] = [];
  let m;
  while ((m = regex.exec(html))) {
    const id = m[1];
    // Skip generic planner links
    if (id !== 'community' && id !== 'create') {
      matches.push(id);
    }
  }
  
  // Use the most common non-generic ID (likely the build's planner)
  if (matches.length > 0) {
    const counts = new Map<string, number>();
    matches.forEach(id => counts.set(id, (counts.get(id) || 0) + 1));
    const mostCommon = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
    return `https://maxroll.gg/poe2/planner/${mostCommon[0]}`;
  }

  // Fallback: reuse existing extractor (will refetch if needed)
  return extractPlannerUrlFromGuide(guideUrl);
}

// Format HTML to markdown-ish text for overlay
function formatSectionContent(sectionContent: string, headingTitle?: string): string {
  if (!sectionContent) return '';
  
  // First pass: Remove scripts, styles
  let formatted = sectionContent
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  
  // Convert semantic HTML before stripping
  formatted = formatted
    .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, '\n\n**$1**\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<ul[^>]*>/gi, '\n')
    .replace(/<\/ul>/gi, '\n')
    .replace(/<ol[^>]*>/gi, '\n')
    .replace(/<\/ol>/gi, '\n')
    .replace(/<br\s*\/?\>/gi, '\n')
    .replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)');
  
  // Recursively strip nested formatting tags (mark, strong, span, em, etc.)
  let prevLength = -1;
  while (formatted.length !== prevLength) {
    prevLength = formatted.length;
    formatted = formatted
      .replace(/<\/?mark[^>]*>/gi, '')
      .replace(/<\/?strong[^>]*>/gi, '')
      .replace(/<\/?span[^>]*>/gi, '')
      .replace(/<\/?em[^>]*>/gi, '')
      .replace(/<\/?i[^>]*>/gi, '')
      .replace(/<\/?b[^>]*>/gi, '');
  }
  
  // Strip any remaining HTML tags and clean up
  formatted = formatted
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+\n/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (formatted && headingTitle) {
    formatted = `**${headingTitle}**\n\n${formatted}`;
  }
  
  // Final safety pass: strip any remaining HTML tags
  formatted = formatted.replace(/<[^>]+>/g, '');
  
  return formatted;
}

// Extract guide sections as structured array for dropdown navigation
function extractGuideSections(html: string, guideUrl: string): Array<{ title: string; content: string }> | null {
  const remixMatch = html.match(/window.__remixContext\s*=\s*(\{[\s\S]*?\});<\/script>/);
  if (!remixMatch) return null;
  
  try {
    const ctx = JSON.parse(remixMatch[1]);
    const post = ctx?.state?.loaderData?.['posts-poe2']?.post;
    const toc = post?.tableOfContents?.items;
    const gutenbergBlocks = post?.gutenbergBlock;
    
    if (!Array.isArray(toc) || toc.length === 0) return null;
    if (!Array.isArray(gutenbergBlocks)) return null;

    const sections: Array<{ title: string; content: string }> = [];

    // Helper to extract text from nested blocks recursively
    function extractTextFromBlock(block: any): string {
      if (!block) return '';
      let text = '';
      if (block.innerHTML) {
        text += block.innerHTML;
      }
      if (Array.isArray(block.innerBlocks)) {
        for (const innerBlock of block.innerBlocks) {
          text += ' ' + extractTextFromBlock(innerBlock);
        }
      }
      return text;
    }

    // Build map of TOC IDs to block indices to know where each section starts
    const tocIdToBlockIndex = new Map<string, number>();
    gutenbergBlocks.forEach((block, idx) => {
      // Check if block has an anchor/ID attribute that matches TOC
      const blockId = block?.attrs?.anchor || block?.attrs?.id;
      if (blockId) {
        tocIdToBlockIndex.set(blockId, idx);
      }
    });

    // Concatenate all gutenberg block content
    let fullContent = '';
    for (const block of gutenbergBlocks) {
      fullContent += extractTextFromBlock(block) + '\n\n';
    }

    // Pre-index headings so we can map TOC items even when titles differ
    const headingMatches: Array<{ title: string; start: number; end: number; content: string; normalized: string }> = [];
    const headingRegex = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi;
    
    // First, collect all heading positions
    const allHeadings: Array<{ title: string; start: number; end: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = headingRegex.exec(fullContent))) {
      const title = m[1] || '';
      const start = m.index;
      const end = headingRegex.lastIndex;
      allHeadings.push({ title, start, end });
    }
    
    // Now build content sections by finding text between consecutive headings
    for (let i = 0; i < allHeadings.length; i++) {
      const heading = allHeadings[i];
      const nextHeading = allHeadings[i + 1];
      const contentEnd = nextHeading ? nextHeading.start : fullContent.length;
      const contentHtml = fullContent.slice(heading.end, contentEnd);
      const normalized = normalizeTitle(heading.title);
      headingMatches.push({ 
        title: heading.title.trim(), 
        start: heading.start, 
        end: contentEnd, 
        content: contentHtml, 
        normalized 
      });
    }

    // Helper: normalize titles for matching
    function normalizeTitle(val: string): string {
      return (val || '')
        .replace(/&amp;/gi, '&')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    }

    // Synonym map to bridge TOC titles to actual headings found in Gutenberg content
    const synonymMap: Record<string, string[]> = {
      'skills': ['skill rotation', 'skill leveling', 'skill leveling quality priority', 'skill leveling quality priority', 'skills', 'gem engraving priority', 'engraving priority'],
      'ascendancy': ['ascendancy', 'labyrinth', 'pact'],
      'passives': ['passives', 'passive tree', 'skill tree', 'tree progression'],
      'stat priority': ['stat priority', 'stat goals', 'stat progression', 'offensive scaling', 'defensive scaling', 'offensive defensive scaling', 'scaling'],
      'gear progression': ['gear progression', 'gearing', 'equipment', 'loot', 'gear'],
      'faq': ['faq', 'frequently asked questions', 'questions'],
      'video': ['video', 'video guide', 'gameplay video', 'build video'],
      'changelog': ['changelog', 'change log', 'updates', 'update log'],
    };

    // Fallback: build a short snippet from plain text around keywords
    const plainContent = fullContent
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&');

    function findKeywordSnippet(keywords: string[]): string | null {
      for (const k of keywords) {
        const regex = new RegExp(`(.{0,220}${k}.{0,220})`, 'i');
        const match = plainContent.match(regex);
        if (match && match[1]) {
          return match[1].trim();
        }
      }
      return null;
    }

    // Map TOC items to actual headings that exist in content
    // TOC structure is for navigation, but actual content uses different heading titles
    const tocToHeadingMap: Record<string, string[]> = {
      'skills': ['gem engraving priority', 'skill rotation'],
      'skill leveling quality priority': ['skill leveling quality priority', 'skill leveling amp quality priority'],
      'ascendancy': ['ascendancy'], // May not have heading - just planner embed
      'passives': ['passives'], // May not have heading - just planner embed  
      'stat priorities': ['offensive scaling', 'defensive scaling', 'offensive defensive scaling'],
      'gearing': ['gearing', 'gear progression'], // May not have heading - just planner embed
      'faq': [], // Will collect FAQ accordion items separately
      'video': ['video'],
      'summary': ['summary'],
      'changelog': ['changelog'],
    };

    // Group headings by TOC sections
    const sectionsByToc = new Map<string, typeof headingMatches>();
    
    for (const heading of headingMatches) {
      let assigned = false;
      
      // Special case: FAQs are accordion items with "mark" class in titles
      if (heading.title.includes('mark class') || heading.normalized.startsWith('q ')) {
        if (!sectionsByToc.has('faq')) {
          sectionsByToc.set('faq', []);
        }
        sectionsByToc.get('faq')!.push(heading);
        assigned = true;
      } else {
        // Try to assign to a TOC section
        for (const [tocKey, headingPatterns] of Object.entries(tocToHeadingMap)) {
          if (headingPatterns.length > 0 && headingPatterns.some(pattern => heading.normalized.includes(pattern))) {
            if (!sectionsByToc.has(tocKey)) {
              sectionsByToc.set(tocKey, []);
            }
            sectionsByToc.get(tocKey)!.push(heading);
            assigned = true;
            break;
          }
        }
      }
      
      // If not assigned to TOC, add as standalone section
      if (!assigned) {
        sectionsByToc.set(heading.normalized, [heading]);
      }
    }

    // For TOC items with no matching headings, try to extract content directly
    for (const tocItem of toc) {
      const tocKey = normalizeTitle(tocItem.title);
      if (!sectionsByToc.has(tocKey) && tocKey !== 'faq') {
        // Try to find content for this TOC section using specific markers
        let sectionContent = '';
        
        // Special cases for known sections
        if (tocKey === 'ascendancy') {
          // Look for ascendancy-specific content
          const ascMatch = fullContent.match(/Take Soulless Form[\s\S]{200,2000}Crystalline Phylactery/i);
          if (ascMatch) sectionContent = ascMatch[0];
        } else if (tocKey === 'passives') {
          // Look for passives-specific content
          const passMatch = fullContent.match(/For the attribute nodes[\s\S]{200,2000}Wanted Sapphire Jewel/i);
          if (passMatch) sectionContent = passMatch[0];
        } else if (tocKey === 'summary') {
          // Look for summary-specific content
          const summMatch = fullContent.match(/This Storm Mage Lich Build Guide[\s\S]{200,1000}Pain Offering/i);
          if (summMatch) sectionContent = summMatch[0];
        } else {
          // Generic keyword search for other sections
          const tocTitle = tocItem.title;
          const keywords = [tocTitle.toLowerCase(), tocKey];
          
          for (const keyword of keywords) {
            const regex = new RegExp(`(.{0,500}${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.{0,500})`, 'i');
            const match = fullContent.match(regex);
            if (match && match[1] && match[1].length > 100) {
              sectionContent = match[1];
              break;
            }
          }
        }
        
        if (sectionContent) {
          sectionsByToc.set(tocKey, [{
            title: tocItem.title,
            start: 0,
            end: 0,
            content: sectionContent,
            normalized: tocKey
          }]);
        }
      }
    }

    // Extract sections - combine headings under each TOC item
    for (const [tocKey, headings] of sectionsByToc.entries()) {
      // Skip standalone FAQ items (they should all be grouped under 'faq')
      if (tocKey.startsWith('mark class has inline color') || tocKey.startsWith('q ')) {
        continue;
      }
      
      // Find the TOC item title (or use first heading title)
      const tocItem = toc?.find(item => normalizeTitle(item.title) === tocKey);
      let sectionTitle = tocItem?.title || headings[0]?.title || tocKey;
      
      // Clean HTML tags from section title
      sectionTitle = sectionTitle
        .replace(/<\/?mark[^>]*>/gi, '')
        .replace(/<\/?strong[^>]*>/gi, '')
        .replace(/<\/?span[^>]*>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      // For FAQ section, format as Q&A list
      let formatted: string;
      if (tocKey === 'faq' && headings.length > 0) {
        // Clean up FAQ question titles (remove HTML markup)
        const faqContent = headings.map(h => {
          const cleanTitle = h.title
            .replace(/<\/?mark[^>]*>/gi, '')
            .replace(/<\/?strong[^>]*>/gi, '')
            .replace(/<\/?span[^>]*>/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
          const cleanContent = formatSectionContent(h.content, '').trim();
          return `**Q: ${cleanTitle}**\n\n${cleanContent}`;
        }).join('\n\n');
        formatted = `**FAQ**\n\n${faqContent}`;
      } else {
        // Combine all content from headings in this TOC section
        const combinedContent = headings.map(h => h.content).join('\n\n');
        formatted = formatSectionContent(combinedContent, sectionTitle);
      }
      
      // Only include sections with substantial text content (skip planner embed sections)
      if (formatted && formatted.length > 100) {
        // Skip if it's mostly just URLs (planner embeds)
        const urlCount = (formatted.match(/https?:\/\//g) || []).length;
        const textLength = formatted.replace(/https?:\/\/[^\s]+/g, '').length;
        
        if (textLength > 80) {  // Has real text, not just URLs
          // Skip standalone FAQ items - they should all be in the FAQ section
          if (!sectionTitle.startsWith('Q:') && !sectionTitle.includes('<mark')) {
            sections.push({
              title: tocKey === 'faq' ? 'FAQ' : sectionTitle,
              content: formatted,
            });
          }
        }
      }
    }

    return sections.length > 0 ? sections : null;
  } catch (e) {
    console.warn('[Maxroll Parser] Failed to extract guide sections', e);
    return null;
  }
}

function extractUniqueNames(html: string): Record<string, string> {
  const uniqueMap: Record<string, string> = {};
  // Extract unique item names from spans: <span class="poe2-item" data-poe2-id="FourUniqueBodyStrInt1_">Enfolding Dawn</span>
  const regex = /<span[^>]*class="poe2-item"[^>]*data-poe2-id="([^"]+)"[^>]*>([^<]+)<\/span>/gi;
  let match;
  while ((match = regex.exec(html))) {
    const id = match[1];
    const name = match[2];
    uniqueMap[id] = name;
  }
  return uniqueMap;
}

// Extract gem names from guide HTML poe2-item spans - these have the CORRECT current names
function extractGemNames(html: string): Record<string, string> {
  const gemMap: Record<string, string> = {};
  // Same regex as unique items, but we'll use it for gems too
  const regex = /<span[^>]*class="poe2-item"[^>]*data-poe2-id="([^"]+)"[^>]*>([^<]+)<\/span>/gi;
  let match;
  while ((match = regex.exec(html))) {
    const id = match[1];
    const name = match[2];
    // Store all poe2-item names - includes both uniques and gems
    gemMap[id] = name;
  }
  return gemMap;
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  return res.text();
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title>([^<]*)<\/title>/i);
  return m ? m[1].trim() : null;
}

function normalizeAscendancy(code: string | undefined): { className?: string; ascendancyName?: string } {
  if (!code) return {};
  // Maxroll encodes ascendancy as e.g. "Witch3"; keep raw as ascendancyName when mapping fails
  const classMap: Record<string, string> = {
    Witch: 'Witch',
  };
  let cls: string | undefined;
  let asc: string | undefined;
  const match = code.match(/([A-Za-z]+)(\d+)/);
  if (match) {
    cls = classMap[match[1]] || match[1];
    // Simple known map for PoE2 Witch ascendancies
    const ascIndex = parseInt(match[2], 10);
    const ascMap: Record<number, string> = {
      3: 'Lich',
    };
    asc = ascMap[ascIndex] || code;
  }
  return { className: cls, ascendancyName: asc };
}

function normalizePassives(passives: any): MaxrollPassiveVariant[] {
  const variants = passives?.variants || [];
  return variants.map((v: any, idx: number) => ({
    name: v.name || `Tree ${idx + 1}`,
    // History is a flat array of node IDs
    history: Array.isArray(v.history) ? v.history : [],
  }));
}

function normalizeSkills(skills: any, gemsDb: Record<string, any> = {}): MaxrollSkillStep[] {
  const steps = skills?.steps || [];
  return steps.map((step: any, stepIdx: number) => ({
    name: step.name || `Step ${stepIdx + 1}`,
    skills: (step.skills || []).map((g: any) => ({
      gems: (g.gems || []).map((gem: any) => {
        const isSupport = gem.id?.includes('SupportGem');
        const version = extractGemVersion(gem.id);
        
        // FIRST: Try to get display name from Maxroll's gems database (most accurate)
        const gemData = gemsDb[gem.id];
        // Prefer displayName (merged from guide HTML), fall back to name if present
        let displayName = gemData?.displayName || gemData?.name;
        let oldName: string | undefined = undefined;
        
        // FALLBACK: If not in database, extract from metadata path
        if (!displayName) {
          const extracted = extractGemName(gem.id);
          displayName = extracted.displayName;
          oldName = extracted.oldName;
        } else {
          // If we got name from DB, also extract metadata name for image fallback
          const metadataName = extractGemName(gem.id).displayName;
          if (metadataName !== displayName) {
            oldName = metadataName; // Metadata name differs, use as fallback
          }
        }
        
        return {
          id: displayName, // Use display name as ID for compatibility
          displayName, // Store display name for UI
          oldName, // Store old/metadata name for image fallback
          level: gem.level || gem.gemLevel || undefined,
          quality: gem.quality || undefined,
          version: version || (isSupport ? 1 : undefined), // Default support gems to version 1
        };
      }),
      note: g.text || undefined,
    })),
  }));
}

function extractGemVersion(metadataPath: string): number | undefined {
  if (!metadataPath) return undefined;
  const versionMatch = metadataPath.match(/(One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten)$/i);
  if (!versionMatch) return undefined;
  
  const versionMap: Record<string, number> = {
    'One': 1, 'Two': 2, 'Three': 3, 'Four': 4, 'Five': 5,
    'Six': 6, 'Seven': 7, 'Eight': 8, 'Nine': 9, 'Ten': 10
  };
  return versionMap[versionMatch[1]];
}

function extractGemName(metadataPath: string): { displayName: string; oldName?: string } {
  if (!metadataPath) return { displayName: 'Unknown' };
  // Extract from paths like "Metadata/Items/Gems/SkillGemUnearth" -> "Unearth"
  const match = metadataPath.match(/(?:Skill|Support)Gem(.+)$/);
  const raw = match ? match[1] : (metadataPath.split('/').pop() || metadataPath);

  // Map old Maxroll metadata names to current game names
  // Based on PoE2 gem renames and Maxroll's display names
  const renameMap: Record<string, string> = {
    // Support gems (verified from guide HTML and game data)
    'Scattershot': 'Multishot',
    'ScattershotTwo': 'MultishotTwo',
    'ScattershotThree': 'MultishotThree',
    'FireInfusion': 'FireAttunement',
    'FireInfusionTwo': 'FireAttunementTwo',
    'FireInfusionThree': 'FireAttunementThree',
    'MagnifiedEffect': 'MagnifiedArea',
    'MagnifiedEffectTwo': 'MagnifiedAreaTwo',
    'MagnifiedEffectThree': 'MagnifiedAreaThree',
    'SkeletalWarriorWeaponSkill': 'AncestralWarriorTotem',
    'MartialTempo': 'TemporalChains',
    'MartialTempoTwo': 'TemporalChainsTwo',
    'MartialTempoThree': 'TemporalChainsThree',
    'FeedingFrenzy': 'CombatFrenzy',
    'FeedingFrenzyTwo': 'CombatFrenzyTwo',
    'Conduction': 'ShockConduction',
    'ConductionTwo': 'ShockConductionTwo',
    'Acceleration': 'ProjectileAcceleration',
    'AccelerationTwo': 'ProjectileAccelerationTwo',
    'SummonSpectre': 'BindSpectre',
    // Additional gems based on PoE2 game names
    'Persistence': 'ProlongedDuration',
    'PersistenceTwo': 'ProlongedDurationTwo',
    'PersistenceThree': 'ProlongedDurationThree',
    'ArcaneTempo': 'ArcaneSurge',
    'ArcaneTempoTwo': 'ArcaneSurgeTwo',
    'ArcaneTempoThree': 'ArcaneSurgeThree',
    'Inspiration': 'IncreasedDuration',
    'InspirationTwo': 'IncreasedDurationTwo',
    'Ingenuity': 'UnboundAvatar',
    'IngenuityTwo': 'UnboundAvatarTwo',
  };

  // Detect version suffix (One, Two, Three, etc.) and convert to number
  const versionMatch = raw.match(/(One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten)$/i);
  const versionMap: Record<string, number> = {
    'One': 1, 'Two': 2, 'Three': 3, 'Four': 4, 'Five': 5,
    'Six': 6, 'Seven': 7, 'Eight': 8, 'Nine': 9, 'Ten': 10
  };
  const version = versionMatch ? versionMap[versionMatch[1]] : undefined;

  // Strip PoE2 version suffixes and trailing digits
  let stripped = raw.replace(/(One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten)$/i, '').replace(/\d+$/, '');
  
  // Keep old name for image fallback
  const oldName = stripped;
  
  // Apply rename mapping (handles old names like Scattershot -> Multishot)
  const wasRenamed = stripped in renameMap;
  if (wasRenamed) {
    stripped = renameMap[stripped];
  }

  // Convert PascalCase to spaced words
  const spaced = stripped.replace(/([a-z])([A-Z])/g, '$1 $2');

  // If it was a support gem path, append "Support" for clarity
  const isSupport = /SupportGem/.test(metadataPath);
  let finalName = isSupport ? `${spaced} Support` : spaced;
  
  // Append version number if present (e.g., "Meat Shield Support 2")
  if (version !== undefined) {
    finalName = `${finalName} ${version}`;
  }

  return {
    displayName: finalName.trim(),
    oldName: wasRenamed ? oldName : undefined, // Only include oldName if it was renamed
  };
}

function normalizeEquipment(equipmentSetups: any[], itemsDb: Record<string, any>, uniqueNames?: Record<string, string>): MaxrollItemSetup[] {
  if (!Array.isArray(equipmentSetups)) return [];
  return equipmentSetups.map((s: any, idx: number) => {
    const resolvedItems: Record<string, any> = {};
    const itemMap = s.items || {};
    
    // Resolve each item ID to actual item data
    for (const [slot, itemId] of Object.entries(itemMap)) {
      const item = itemsDb[String(itemId)];
      if (item) {
        // For unique items, use the name from the guide page if available
        let displayName = item.name || extractBaseName(item.base);
        if (item.rarity === 'unique' && item.unique && uniqueNames?.[item.unique]) {
          displayName = uniqueNames[item.unique];
        }
        
        resolvedItems[slot] = {
          base: item.base,
          name: displayName,
          rarity: item.rarity,
          stats: item.stats,
        };
      }
    }
    
    return {
      id: s.id || String(idx),
      name: s.name || `Setup ${idx + 1}`,
      items: resolvedItems,
      priority: s.priority || {},
    };
  });
}

function extractBaseName(metadataPath: string): string {
  if (!metadataPath) return 'Unknown';
  const segments = metadataPath.split('/');
  return segments[segments.length - 1] || metadataPath;
}

function extractNotes(notes: any): string | undefined {
  if (!notes?.root) return undefined;
  try {
    // Notes use Lexical rich text; extract paragraphs and headings as HTML
    const sections: string[] = [];
    
    if (Array.isArray(notes.root.children)) {
      let currentSection = '';
      
      notes.root.children.forEach((child: any) => {
        if (child.type === 'heading') {
          // If we have accumulated text, save it as a section
          if (currentSection.trim()) {
            sections.push(currentSection.trim());
          }
          // Start new section with heading as HTML
          const headingText = extractTextFromNode(child);
          currentSection = `<h3>${headingText}</h3>\n`;
        } else if (child.type === 'paragraph') {
          // Add paragraph to current section as HTML
          const text = extractFormattedText(child);
          if (text.trim()) {
            currentSection += `<p>${text}</p>\n`;
          }
        } else if (child.type === 'list') {
          // Handle lists as HTML
          const listText = extractListContent(child);
          if (listText.trim()) {
            currentSection += listText + '\n';
          }
        } else {
          // Other node types as paragraphs
          const text = extractFormattedText(child);
          if (text.trim()) {
            currentSection += `<p>${text}</p>\n`;
          }
        }
      });
      
      // Save final section
      if (currentSection.trim()) {
        sections.push(currentSection.trim());
      }
    }
    
    // Format each section to strip HTML and convert to clean markdown
    const formattedSections = sections.map(s => formatSectionContent(s, '').trim()).filter(s => s.length > 0);
    
    return formattedSections.join('\n\n---\n\n') || undefined;
  } catch {
    return undefined;
  }
}

function extractFormattedText(node: any): string {
  if (!node) return '';
  
  // Direct text node with formatting
  if (node.text !== undefined) {
    let text = node.text;
    // Apply formatting based on Lexical format flags
    if (node.format) {
      if (node.format & 1) text = `<b>${text}</b>`; // Bold
      if (node.format & 2) text = `<i>${text}</i>`; // Italic
      if (node.format & 8) text = `<code>${text}</code>`; // Code
    }
    return text;
  }
  
  // Node with children
  if (Array.isArray(node.children)) {
    return node.children.map((child: any) => extractFormattedText(child)).join('');
  }
  
  return '';
}

function extractListContent(listNode: any): string {
  if (!listNode || !Array.isArray(listNode.children)) return '';
  
  const listType = listNode.listType || 'bullet'; // 'bullet', 'number', 'check'
  const isOrdered = listType === 'number';
  const tag = isOrdered ? 'ol' : 'ul';
  
  const items = listNode.children.map((item: any) => {
    if (item.type !== 'listitem') return '';
    const itemText = extractFormattedText(item);
    return `  <li style="margin: 3px 0;">${itemText}</li>`;
  }).filter(Boolean).join('\n');
  
  return items ? `<${tag} style="margin: 5px 0; padding-left: 20px;">\n${items}\n</${tag}>` : '';
}

function extractTextFromNode(node: any): string {
  if (!node) return '';
  
  // Direct text node
  if (node.text) return node.text;
  
  // Node with children (paragraph, list, etc.)
  if (Array.isArray(node.children)) {
    return node.children.map((child: any) => extractTextFromNode(child)).join('');
  }
  
  return '';
}

function findPlannerWithProfile(root: any): { plannerData: any; profile?: any } | null {
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    
    // Check if current object has a planner property with passives
    if (cur.planner && typeof cur.planner === 'object' && cur.planner.passives) {
      return { plannerData: cur, profile: undefined };
    }
    
    // Special case: if this object has profile.data (JSON string), parse and check
    if (cur.profile && typeof cur.profile.data === 'string') {
      try {
        const parsed = JSON.parse(cur.profile.data);
        if (parsed.planner && parsed.planner.passives) {
          return { plannerData: parsed, profile: cur.profile };
        }
      } catch {
        // ignore parse errors
      }
    }
    
    // Continue searching in nested objects
    for (const val of Object.values(cur)) {
      if (val && typeof val === 'object') stack.push(val);
    }
  }
  return null;
}

async function extractPlannerUrlFromGuide(guideUrl: string): Promise<string | null> {
  const res = await fetch(guideUrl, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const html = await res.text();

  // Look for planner URL inside JSON or anchor tags
  const plannerMatch = html.match(/https:\/\/maxroll\.gg\/poe2\/planner\/[A-Za-z0-9]+/);
  if (plannerMatch) return plannerMatch[0];

  // Some pages embed a Remix context similar to planner pages; try to scan it
  const remixMatch = html.match(/window.__remixContext\s*=\s*(\{[\s\S]*?\});<\/script>/);
  if (remixMatch) {
    try {
      const ctx = JSON.parse(remixMatch[1]);
      const plannerUrl = deepFindPlannerUrl(ctx);
      if (plannerUrl) return plannerUrl;
    } catch {
      // ignore
    }
  }

  return null;
}

function deepFindPlannerUrl(obj: any): string | null {
  const stack = [obj];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    if (typeof cur === 'string' && /maxroll\.gg\/poe2\/planner\//.test(cur)) {
      const m = cur.match(/https:\/\/maxroll\.gg\/poe2\/planner\/[A-Za-z0-9]+/);
      if (m) return m[0];
    }
    for (const val of Object.values(cur)) {
      if (val && typeof val === 'object') stack.push(val);
      else if (typeof val === 'string') {
        const m = val.match(/https:\/\/maxroll\.gg\/poe2\/planner\/[A-Za-z0-9]+/);
        if (m) return m[0];
      }
    }
  }
  return null;
}
