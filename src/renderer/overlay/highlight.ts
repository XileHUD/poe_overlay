// Generic lightweight highlight helpers.
// These were referenced (highlightMatches, buildHighlightTerms) but file was empty, causing TS import errors.

export interface HighlightOptions {
	/** CSS class applied to highlighted span */
	className?: string;
	/** If true, escape HTML before highlighting */
	escapeHtml?: boolean;
}

// Basic HTML escape (kept local to avoid utils import loop)
function esc(s: string){
	return s
		.replace(/&/g,'&amp;')
		.replace(/</g,'&lt;')
		.replace(/>/g,'&gt;')
		.replace(/"/g,'&quot;')
		.replace(/'/g,'&#39;');
}

/**
 * Build normalized highlight terms from a free‑form query.
 * Splits on whitespace, trims, dedupes, ignores 1‑char tokens (unless they are digits),
 * and sorts longer terms first so nested replacements don’t split bigger matches.
 */
export function buildHighlightTerms(query: string | null | undefined): string[] {
	if (!query) return [];
	const parts = String(query)
		.split(/\s+/)
		.map(p => p.trim())
		.filter(p => p.length > 1 || /\d/.test(p))
		.map(p => p.toLowerCase());
	const uniq: string[] = [];
	const seen = new Set<string>();
	for (const p of parts){
		if (!seen.has(p)){ seen.add(p); uniq.push(p); }
	}
	// Longer first to avoid partial wrapping of substrings
	return uniq.sort((a,b)=> b.length - a.length);
}

/**
 * Highlight all case‑insensitive occurrences of any term inside the given text.
 * Returns raw HTML string (already escaped unless options.escapeHtml === false).
 */
export function highlightMatches(text: string, terms: string[], opts: HighlightOptions = {}): string {
	if (!text) return '';
	if (!terms || terms.length === 0) return opts.escapeHtml === false ? text : esc(text);
	const className = opts.className || 'hl';
	const source = opts.escapeHtml === false ? text : esc(text);
	// Build one regex combining all terms; escape regex meta
	const pattern = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
	if (!pattern) return source;
	const re = new RegExp(`(${pattern})`,`gi`);
	return source.replace(re, (_m, g1) => `<span class="${className}">${g1}</span>`);
}

// (Optional) convenience: highlight a single query string directly
export function highlightQuery(text: string, query: string | null | undefined, opts: HighlightOptions = {}){
	return highlightMatches(text, buildHighlightTerms(query), opts);
}

// Tiny default CSS hook if consumer wants to inject (left commented intentionally)
// .hl { background: rgba(255,215,0,.15); color: #ffd700; padding:0 1px; border-radius:2px; }

