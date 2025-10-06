import * as fs from 'fs';
import * as path from 'path';

interface ImageIndex {
  built: boolean;
  map: Record<string,string>; // URL or basename(lower) -> absolute path
  mtime: number;
}

const index: ImageIndex = { built: false, map: {}, mtime: 0 };

/**
 * Returns the bundled-images directory path.
 * Images are stored with base64-encoded URL as filename.
 */
function bundledImagesDir(): string {
  const res = (process as any).resourcesPath || process.cwd();
  return path.join(res, 'bundled-images');
}

/**
 * Decode base64-encoded filename to get original URL.
 * Files are named like: aHR0cHM6Ly9jZG4ucG9lMmRiLnR3L2ltYWdlL0FydC8uLi4ud2VicA.webp
 * The part before .webp is base64 encoded URL.
 */
function decodeFilename(filename: string): string | null {
  try {
    // Remove .webp extension
    const base64Part = filename.replace(/\.webp$/, '');
    // Decode base64
    const decoded = Buffer.from(base64Part, 'base64').toString('utf-8');
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Scan bundled-images directory and build index.
 * Synchronous version for compatibility with existing code.
 */
function buildIndexOnce(): void {
  if (index.built) return;
  
  try {
    const dir = bundledImagesDir();
    console.log('[ImageResolver] Building index from:', dir);
    
    if (!fs.existsSync(dir)) {
      console.warn('[ImageResolver] Directory not found:', dir);
      index.built = true;
      return;
    }
    
    const entries = fs.readdirSync(dir);
    console.log(`[ImageResolver] Found ${entries.length} files in bundled-images`);
    
    let indexed = 0;
    for (const filename of entries) {
      const fullPath = path.join(dir, filename);
      const originalUrl = decodeFilename(filename);
      
      if (originalUrl) {
        // Index by full URL (preserve ORIGINAL case for exact match)
        index.map[originalUrl] = fullPath;
        // ALSO index by lowercase for case-insensitive fallback
        const lowerUrl = originalUrl.toLowerCase();
        if (!index.map[lowerUrl]) {
          index.map[lowerUrl] = fullPath;
        }
        indexed++;
        
        // Also index by basename for fallback matching
        try {
          const basename = path.basename(new URL(originalUrl).pathname).toLowerCase();
          if (!index.map[basename]) {
            index.map[basename] = fullPath;
          }
        } catch {
          // URL parsing failed, skip basename indexing
        }
      }
    }
    
    console.log(`[ImageResolver] Indexed ${indexed} images successfully`);
    index.built = true;
    index.mtime = Date.now();
  } catch (err) {
    console.error('[ImageResolver] Failed to build image index:', err);
    index.built = true; // Mark as done even on error to avoid infinite retry
  }
}

export function resolveLocalImage(original: string): string | null {
  try { buildIndexOnce(); } catch {}
  if (!original) return null;
  
  // Try EXACT match first (preserves original case from bundled filename)
  const exactMatch = index.map[original];
  if (exactMatch) {
    return exactMatch;
  }
  
  // Try lowercase match as fallback (case-insensitive)
  const normalized = original.toLowerCase();
  const lowerMatch = index.map[normalized];
  if (lowerMatch) {
    return lowerMatch;
  }
  
  // Try basename match as last resort
  const cleaned = (() => {
    try {
      if (/^https?:/i.test(original)) {
        const u = new URL(original);
        return path.basename(u.pathname).toLowerCase();
      }
      // strip query / fragments manually if not a full URL
      const p = original.split(/[?#]/)[0];
      return path.basename(p).toLowerCase();
    } catch { return path.basename(original).toLowerCase(); }
  })();
  
  if (cleaned && index.map[cleaned]) {
    return index.map[cleaned];
  }
  
  return null;
}

/**
 * Attempt to resolve an image when caller only has a name or slug (no URL provided).
 * This creates heuristic basenames based on known PoE2 CDN naming patterns and
 * tries to match against the basename index we already created.
 */
export function resolveByNameOrSlug(nameOrSlug: string): string | null {
  try { buildIndexOnce(); } catch {}
  if (!nameOrSlug) return null;
  const key = nameOrSlug.trim().toLowerCase();
  if (!key) return null;

  // If key already directly matches a basename in index, return it
  if (index.map[key]) return index.map[key];

  // Generate candidate basenames (without extension) we have seen patterns for.
  // Observed patterns in bundled files: skillicons/4k/<gemname>.webp, atlaspassives/<node>.webp, ascendancy/<passive>.webp
  const simplified = key
    .replace(/['`]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  const candidates: string[] = [];
  candidates.push(simplified + '.webp');
  candidates.push(simplified + 'skill.webp'); // e.g. sorceressarc -> sorceressarcskill.webp pattern sometimes
  candidates.push(simplified.replace(/_skill$/, '') + '.webp');

  // Try each candidate by scanning existing basename keys (endsWith match)
  for (const cand of candidates) {
    const foundKey = Object.keys(index.map).find(k => k.endsWith(cand));
    if (foundKey) {
      console.log(`[ImageResolver] 🔎 Heuristic match '${nameOrSlug}' -> '${foundKey}'`);
      return index.map[foundKey];
    }
  }

  return null;
}

export function getImageIndexMeta() { return { built: index.built, count: Object.keys(index.map).length, mtime: index.mtime }; }
