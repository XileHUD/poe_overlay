/**
 * Mobalytics Build Parser
 * 
 * Fetches and normalizes Mobalytics build pages into a structured format
 * compatible with the overlay's build system.
 */

export interface MobalyticsGem {
  slug: string | null;
  name: string | null;
  level?: number | null;
}

export interface MobalyticsSkill {
  active: MobalyticsGem;
  supports: MobalyticsGem[];
}

export interface MobalyticsPassives {
  main: string[];
  ascendancy: string[];
  attributeNodes: any[];
  jewels: any[];
  names: Record<string, string>; // slug -> name lookup
}

export interface MobalyticsVariant {
  id: string;
  title: string;
  gear: any; // Raw gear structure from Mobalytics
  skills: MobalyticsSkill[];
  passives: MobalyticsPassives;
  atlas: string[];
  skillsGuide?: string; // Guide text for skills section
  passiveTreeGuide?: string; // Guide text for passive tree section
}

export interface MobalyticsNote {
  type: 'richtext' | 'strengths-weaknesses';
  title: string;
  body?: string;
  strengths?: string[];
  weaknesses?: string[];
}

export interface MobalyticsBuild {
  source: 'mobalytics';
  title: string;
  author?: string; // Creator/author name
  className?: string; // Character class (e.g., 'Monk', 'Warrior')
  ascendancyName?: string; // Ascendancy class (e.g., 'Invoker', 'Titan')
  variants: MobalyticsVariant[];
  notes: MobalyticsNote[];
}

/**
 * Normalize selectedSlugs array which can contain strings or objects with .slug property
 * Preserves allocation order from the array
 */
function normalizeSelectedSlugs(slugs: any): string[] {
  if (!slugs || !Array.isArray(slugs)) return [];
  
  return slugs.map((item: any) => {
    // If it's already a string, return it
    if (typeof item === 'string') return item;
    
    // If it's an object with .slug property, extract it
    if (item && typeof item === 'object' && item.slug) {
      return item.slug;
    }
    
    // Fallback: convert to string
    return String(item);
  }).filter(Boolean); // Remove any empty/null values
}

/**
 * Fetch and parse a Mobalytics build from a URL
 */
export async function fetchMobalyticsBuild(url: string): Promise<MobalyticsBuild> {
  // Validate URL - accept both builds and profile URLs
  const urlPattern = /mobalytics\.gg\/poe-2\/(builds|profile)/i;
  if (!urlPattern.test(url)) {
    throw new Error('Invalid Mobalytics URL. Expected a URL containing "mobalytics.gg/poe-2/"');
  }

  console.log('[Mobalytics Parser] Fetching build from:', url);

  // Fetch the page
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch Mobalytics page: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  console.log('[Mobalytics Parser] Page fetched, size:', html.length);

  // Extract PRELOADED_STATE
  const stateMatch = html.match(/window\.__PRELOADED_STATE__=({[\s\S]*?});<\/script>/);
  if (!stateMatch) {
    throw new Error('Could not find __PRELOADED_STATE__ in page. The page structure may have changed.');
  }

  // Parse the JSON (handle escaped slashes)
  const stateJson = stateMatch[1].replace(/\\u002F/g, '/');
  const state = JSON.parse(stateJson);
  console.log('[Mobalytics Parser] State extracted');

  // Normalize the state into our format
  return normalizeMobalyticsState(state);
}

/**
 * Normalize PRELOADED_STATE into our build format
 * Exported for testing purposes
 */
export function normalizeMobalyticsState(state: any): MobalyticsBuild {
  const gql = state?.poe2State?.apollo?.graphql;
  if (!gql) {
    throw new Error('Missing poe2State.apollo.graphql in page data');
  }

  // Find the build document - prefer the one with content (the main page build)
  // Other documents in the page are usually featured/related builds without full content
  const docEntries = Object.entries(gql).filter(([k]) => k.startsWith('Poe2UserGeneratedDocument:'));
  if (docEntries.length === 0) {
    throw new Error('Poe2UserGeneratedDocument not found in page data');
  }

  // Find the document with content (the main build being viewed)
  let docEntry = docEntries.find(([k, v]: [string, any]) => v.content && Array.isArray(v.content) && v.content.length > 0);
  
  // Fallback to first document if none have content
  if (!docEntry) {
    docEntry = docEntries[0];
  }

  const doc = docEntry[1] as any;
  
  console.log('[Mobalytics Parser] Using document:', docEntry[0], 'with', doc.content?.length || 0, 'widgets');

  // Build variant title map from the Build Variants widget
  const variantsWidget = doc.content?.find((c: any) => c.__typename === 'NgfDocumentCmWidgetContentVariantsV1');
  const variantTitleById = buildVariantTitleMap(gql, variantsWidget);

  // Extract variants - check multiple possible locations
  let variants = doc.data?.buildVariants?.values || [];
  
  // Fallback: if no variants in data, try extracting from widgets
  if (variants.length === 0 && variantsWidget?.data?.childrenVariants) {
    console.log('[Mobalytics Parser] No variants in data.buildVariants.values, attempting widget extraction');
    variants = extractVariantsFromWidgets(gql, variantsWidget, doc.content || []);
  }
  
  if (variants.length === 0) {
    throw new Error('No build variants found. The build may be empty or the page structure has changed.');
  }
  
  console.log('[Mobalytics Parser] Found', variants.length, 'variant(s)');

  // Build a map of widget content by widget ID
  const widgetContentById: Record<string, { skillsGuide?: string; passiveTreeGuide?: string }> = {};
  
  for (const widget of doc.content || []) {
    const widgetId = widget.id;
    if (!widgetId) continue;
    
    if (widget.__typename === 'Poe2DocumentUgWidgetSkillGemsV1' && widget.data?.description) {
      widgetContentById[widgetId] = {
        ...widgetContentById[widgetId],
        skillsGuide: richTextToMarkdown(widget.data.description),
      };
    }
    
    if (widget.__typename === 'Poe2DocumentUgWidgetPassiveTreeV1' && widget.data?.description) {
      widgetContentById[widgetId] = {
        ...widgetContentById[widgetId],
        passiveTreeGuide: richTextToMarkdown(widget.data.description),
      };
    }
  }
  
  // Build a map from variant ID to widget content by looking up variant children
  const variantGuideContent: Record<string, { skillsGuide?: string; passiveTreeGuide?: string }> = {};
  
  if (variantsWidget?.data?.childrenVariants) {
    for (const childRef of variantsWidget.data.childrenVariants) {
      const child = gql[childRef.__ref];
      if (!child || !child.id || !child.childrenIds) continue;
      
      const variantId = child.id;
      variantGuideContent[variantId] = {};
      
      // Look through the widget IDs for this variant
      for (const widgetId of child.childrenIds) {
        if (widgetContentById[widgetId]) {
          if (widgetContentById[widgetId].skillsGuide) {
            variantGuideContent[variantId].skillsGuide = widgetContentById[widgetId].skillsGuide;
          }
          if (widgetContentById[widgetId].passiveTreeGuide) {
            variantGuideContent[variantId].passiveTreeGuide = widgetContentById[widgetId].passiveTreeGuide;
          }
        }
      }
    }
  }

  const normVariants: MobalyticsVariant[] = variants.map((v: any, index: number) => {
    // Build gem name lookup from priority gems
    const gemNameLookup: Record<string, string> = {};
    (v.skillGems?.priorityGems || [])
      .filter((g: any) => g?.gemSlug && g?.name)
      .forEach((g: any) => {
        gemNameLookup[g.gemSlug] = g.name;
      });

    // Build passive name lookup from priority lists
    const passiveNameLookup: Record<string, string> = {};
    [
      ...(v.passiveTree?.mainTree?.priorityList || []),
      ...(v.passiveTree?.ascendancyTree?.priorityList || []),
    ]
      .filter((p: any) => p?.slug && p?.name)
      .forEach((p: any) => {
        passiveNameLookup[p.slug] = p.name;
      });

    // Extract skills
    const skills: MobalyticsSkill[] = (v.skillGems?.gems || []).map((slot: any) => {
      const supports: MobalyticsGem[] = (slot.subSkills || []).map((s: any) => ({
        slug: s.gemSlug || null,
        name: s.name || gemNameLookup[s.gemSlug] || null,
      }));

      return {
        active: {
          slug: slot.activeSkill?.gemSlug || null,
          name: slot.activeSkill?.name || gemNameLookup[slot.activeSkill?.gemSlug] || null,
          level: slot.activeSkill?.level || null,
        },
        supports,
      };
    });

    return {
      id: v.id,
      title: variantTitleById[v.id] || v.id,
      gear: v.equipment || null,
      skills,
      passives: {
        main: normalizeSelectedSlugs(v.passiveTree?.mainTree?.selectedSlugs),
        ascendancy: normalizeSelectedSlugs(v.passiveTree?.ascendancyTree?.selectedSlugs),
        attributeNodes: v.passiveTree?.attributeNodes || [],
        jewels: v.passiveTree?.jewels || [],
        names: passiveNameLookup,
      },
      atlas: v.atlasTree?.selectedSlugs || [],
      skillsGuide: variantGuideContent[v.id]?.skillsGuide,
      passiveTreeGuide: variantGuideContent[v.id]?.passiveTreeGuide,
    };
  });

  // Extract notes/guide sections
  const notes: MobalyticsNote[] = [];
  for (const block of doc.content || []) {
    if (block.__typename === 'NgfDocumentCmWidgetRichTextSimplifiedV2') {
      notes.push({
        type: 'richtext',
        title: block.data?.title || '',
        body: richTextToMarkdown(block.data?.content),
      });
    } else if (block.__typename === 'NgfDocumentCmWidgetStrengthsAndWeaknessnessesV1') {
      notes.push({
        type: 'strengths-weaknesses',
        title: block.data?.title || 'Strengths and Weaknesses',
        strengths: richTextToMarkdown(block.data?.strengths).split('\n').filter(Boolean),
        weaknesses: richTextToMarkdown(block.data?.weaknesses).split('\n').filter(Boolean),
      });
    }
  }

  // Extract class and ascendancy from tags (most reliable source)
  let className: string | undefined;
  let ascendancyName: string | undefined;
  
  if (doc.tags?.data && Array.isArray(doc.tags.data)) {
    const classTag = doc.tags.data.find((t: any) => t.groupSlug === 'class');
    const ascTag = doc.tags.data.find((t: any) => t.groupSlug === 'ascendancy');
    
    if (classTag?.name) className = classTag.name;
    if (ascTag?.name) ascendancyName = ascTag.name;
  }
  
  // Fallback: try to extract from title or passives
  if (!className) {
    className = extractClassFromTitle(doc.data?.name || '');
  }
  if (!ascendancyName) {
    ascendancyName = inferAscendancyFromPassives(normVariants[0]?.passives);
  }

  return {
    source: 'mobalytics',
    title: doc.data?.name || 'Mobalytics Build',
    author: resolveAuthorName(gql, doc.author),
    className,
    ascendancyName,
    variants: normVariants,
    notes,
  };
}

/**
 * Extract class name from build title
 */
function extractClassFromTitle(title: string): string | undefined {
  const classes = ['Warrior', 'Monk', 'Ranger', 'Mercenary', 'Witch', 'Sorceress'];
  for (const className of classes) {
    if (title.toLowerCase().includes(className.toLowerCase())) {
      return className;
    }
  }
  return undefined;
}

/**
 * Infer ascendancy from passive node names
 */
function inferAscendancyFromPassives(passives: MobalyticsPassives | undefined): string | undefined {
  if (!passives || !passives.names) return undefined;
  
  const nodeNames = Object.values(passives.names);
  
  // Monk ascendancies
  if (nodeNames.some(n => n && (n.includes('Thunder') || n.includes('Grace') || n.includes('Sunder')))) {
    return 'Invoker';
  }
  if (nodeNames.some(n => n && (n.includes('Palm') || n.includes('Adrenaline')))) {
    return 'Acolyte of Chayula';
  }
  
  // Warrior ascendancies  
  if (nodeNames.some(n => n && (n.includes('Titan') || n.includes('Unstoppable')))) {
    return 'Titan';
  }
  if (nodeNames.some(n => n && n.includes('Warbringer'))) {
    return 'Warbringer';
  }
  
  // Add more ascendancy patterns as needed
  
  return undefined;
}

/**
 * Extract variants from widget structure when data.buildVariants is missing
 */
function extractVariantsFromWidgets(gql: any, variantsWidget: any, contentWidgets: any[]): any[] {
  const variants: any[] = [];
  const childRefs = variantsWidget?.data?.childrenVariants || [];
  
  for (const childRef of childRefs) {
    const child = gql[childRef.__ref];
    if (!child || !child.id) continue;
    
    const variantId = child.id;
    const title = child.title || variantId;
    
    // Find widgets for this variant
    const widgetIds = child.childrenIds || [];
    let skillGems: any = null;
    let passiveTree: any = null;
    let equipment: any = null;
    let atlasTree: any = null;
    
    for (const widgetId of widgetIds) {
      const widget = contentWidgets.find(w => w.id === widgetId);
      if (!widget) continue;
      
      if (widget.__typename === 'Poe2DocumentUgWidgetSkillGemsV1' && widget.data) {
        skillGems = widget.data;
      } else if (widget.__typename === 'Poe2DocumentUgWidgetPassiveTreeV1' && widget.data) {
        passiveTree = widget.data;
      } else if (widget.__typename === 'Poe2DocumentUgWidgetEquipmentV1' && widget.data) {
        equipment = widget.data;
      } else if (widget.__typename === 'Poe2DocumentUgWidgetAtlasTreeV1' && widget.data) {
        atlasTree = widget.data;
      }
    }
    
    variants.push({
      id: variantId,
      skillGems,
      passiveTree,
      equipment,
      atlasTree,
    });
  }
  
  return variants;
}

/**
 * Resolve author name from author reference
 */
function resolveAuthorName(gql: any, authorRef: any): string | undefined {
  if (!authorRef) return undefined;
  
  // If author is a reference object like { __ref: "NgfDocumentAuthor:..." }
  if (authorRef.__ref && typeof authorRef.__ref === 'string') {
    const authorKey = authorRef.__ref;
    const author = gql[authorKey];
    return author?.name || undefined;
  }
  
  // If author is already resolved with name field
  if (authorRef.name) {
    return authorRef.name;
  }
  
  return undefined;
}

/**
 * Build variant title map from the variants widget
 */
function buildVariantTitleMap(gql: any, widget: any): Record<string, string> {
  const map: Record<string, string> = {};
  const refs = widget?.data?.childrenVariants || [];
  
  refs.forEach((refObj: any) => {
    const ref = refObj?.__ref;
    if (!ref || !gql[ref]) return;
    const title = gql[ref].title || gql[ref].id;
    map[gql[ref].id] = title;
  });

  return map;
}

/**
 * Convert Lexical richtext format to markdown
 */
function lexicalCollectText(node: any): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.text) return node.text;
  // Handle static-data-widget nodes (hyperlinked items like skill gems)
  if (node.type === 'static-data-widget' && node.label) {
    return node.label;
  }
  if (Array.isArray(node.children)) {
    return node.children.map(lexicalCollectText).join('');
  }
  return '';
}

function lexicalToMarkdown(root: any): string {
  if (!root?.children) return '';
  const lines: string[] = [];

  for (const child of root.children) {
    if (child.type === 'paragraph' || child.type === 'linebreak') {
      const text = lexicalCollectText(child).trim();
      if (text) {
        // Add blank line before headings (lines starting with ▸ or other heading markers)
        if (lines.length > 0 && (text.startsWith('▸') || text.startsWith('►') || text.startsWith('•'))) {
          lines.push('');
        }
        lines.push(text);
      }
    } else if (child.type === 'list') {
      for (const item of child.children || []) {
        const text = lexicalCollectText(item).trim();
        if (text) lines.push(`- ${text}`);
      }
    } else {
      const text = lexicalCollectText(child).trim();
      if (text) {
        // Add blank line before headings
        if (lines.length > 0 && (text.startsWith('▸') || text.startsWith('►') || text.startsWith('•'))) {
          lines.push('');
        }
        lines.push(text);
      }
    }
  }

  return lines.join('\n');
}

function richTextToMarkdown(content: any): string {
  if (!content?.value?.root) return '';
  return lexicalToMarkdown(content.value.root);
}
