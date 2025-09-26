// Extracted utility functions from inline overlay.html (no behavior changes)

export function formatJoinedModText(raw: any): string {
  if (!raw) return '';
  let s = String(raw).trim();

  // Normalise weird whitespace first
  s = s.replace(/\s+/g, ' ');

  // Explicit separators from PoEDB that denoted family boundaries but were stripped when copying
  // Treat each <hr class="mod-same-family"> as a hard newline boundary
  s = s.replace(/<hr[^>]*mod-same-family[^>]*>/gi, '\n');

  // Known repeated phrase boundaries that should always start a new line (except at start)
  const START_PATTERNS = [
    'Area contains', 'Monsters deal', 'Monsters have', 'Monsters are', 'Monsters gain', 'Monsters take', 'Monsters cannot',
    'Removes', 'Adds', 'Gains', 'Gain', 'Grants',
    'Minions deal', 'Minions have', 'Minions gain', 'Minions take',
    'Socketed Gems', 'Gems in this item',
    'While ', 'During ', 'Skills ', 'Attacks ', 'Projectiles ',
    'You have', 'You gain'
  ];

  const applyStartPatternNewlines = () => {
    for (const pat of START_PATTERNS) {
      const re = new RegExp(`(?!^)(?<!\\n)${pat.replace(/ /g, '\\s?')}`, 'g');
      s = s.replace(re, m => `\n${m}`);
    }
  };
  applyStartPatternNewlines();

  // Repeated 'Area contains' occurrences (some pages concat many).
  s = s.replace(/(?!^)Area contains/g, '\nArea contains');

  // If a range or number+% starts immediately after a letter/%) with no space, break: Fire15% -> Fire\n15%
  s = s.replace(/([a-zA-Z%)])((?:\d+|\(\d+|\(\d+–\d+\))(?:%|)(?:\s|\(|#))/g, (m, a, b) => `${a}\n${b}`);

  // Newline before placeholder '#%' segments if multiple in one string
  s = s.replace(/(?!^)#%/g, '\n#%');

  // Flask-specific: split common combined patterns
  s = s.replace(/(?<!^|#% )#% increased Amount Recovered/g, '\n#% increased Amount Recovered');
  s = s.replace(/(?<!^|#% )#% more Recovery if used/g, '\n#% more Recovery if used');

  // Duplicate word glued (MonstersMonsters) => split
  s = s.replace(/(Monsters)(Monsters\b)/g, '$1\n$2');
  s = s.replace(/(Area)(Area contains)/g, '$1\n$2');

  // If we still have long chains with no newline but multiple number ranges, split before each following one.
  s = s.replace(/(\)|%)(?=(?:\s*\d+%|\s*#%|\s*\(\d+–\d+\)%))/g, '$1\n');

  // Space fix: sometimes boundaries had no space (RecoveredRemoves)
  s = s.replace(/([a-z%)])([A-Z])/g, '$1 $2');
  s = s.replace(/(%)([A-Za-z])/g, '$1 $2');
  // After inserting missing spaces we may have created new opportunities to split on start patterns
  applyStartPatternNewlines();
  // Specific flask family glue: RecoveredRemoves -> Recovered\nRemoves
  s = s.replace(/(Recovered)\s?(Removes\b)/g, '$1\n$2');
  // Undo undesirable splits like 'to' \n 'Attacks'
  s = s.replace(/to\s*\n\s*(Attacks\b)/g, 'to $1');

  // Multi-component defence hybrids sometimes glue a new +range immediately after previous component
  // e.g. +(6–9) to Evasion Rating+(1–4)% to maximum Energy Shield
  s = s.replace(/(?<!^)\+(?=\(\d+[–-]\d+\)\s*%?\s*(?:to|#))/g, '\n+');
  // Or closing parenthesis of first component directly followed by next opening parenthesis of a % range
  s = s.replace(/\)(?=\(\d+[–-]\d+\)%)/g, ')\n');

  // Collapse accidental multiple newlines/spaces
  s = s.replace(/ +/g, ' ');
  s = s.replace(/\n{2,}/g, '\n');

  // Strip any leftover placeholder artifacts like %%RANGE0%% or stray %RANGE tokens (defensive)
  s = s.replace(/%%RANGE\d+%%/g, () => '');
  s = s.replace(/%RANGE\b/g, '');

  // Trim each line
  const lines = s.split('\n').map(l => l.trim()).filter(Boolean);
  return lines.join('<br>');
}

// Highlight numbers, percentages, hash symbols, dashes, and brackets in blue
export function highlightText(text: string): string {
  if (!text) return text as unknown as string;

  // Highlight ranges in parentheses first: (6–9), (10-15), etc.
  text = text.replace(/(\([0-9]+[–-][0-9]+%?\))/g, '<span style="color: var(--accent-blue); font-weight: 600;">$1</span>');

  // Highlight plus signs before numbers/ranges
  text = text.replace(/\+(?=[\(\d])/g, '<span style="color: var(--accent-blue); font-weight: 600;">+</span>');

  // Highlight standalone numbers (but not those already wrapped)
  text = text.replace(/\b(\d+(?:\.\d+)?)\b/g, function(match, _num, offset, string: string) {
    const before = string.substring(0, offset as number);
    const after = string.substring((offset as number) + match.length);
    if (before.lastIndexOf('<span') > before.lastIndexOf('</span>')) return match;
    return '<span style="color: var(--accent-blue); font-weight: 600;">' + match + '</span>';
  });

  // Highlight percentage signs
  text = text.replace(/%/g, function(match, offset, string: string) {
    const before = string.substring(0, offset as number);
    if (before.lastIndexOf('<span') > before.lastIndexOf('</span>')) return match;
    return '<span style="color: var(--accent-blue); font-weight: 600;">%</span>';
  });

  // Highlight hash symbols
  text = text.replace(/#/g, function(match, offset, string: string) {
    const before = string.substring(0, offset as number);
    if (before.lastIndexOf('<span') > before.lastIndexOf('</span>')) return match;
    return '<span style="color: var(--accent-blue); font-weight: 600;">#</span>';
  });

  // Highlight dashes in ranges
  text = text.replace(/([–-])(?=\d)/g, function(match, dash, offset, string: string) {
    const before = string.substring(0, offset as number);
    if (before.lastIndexOf('<span') > before.lastIndexOf('</span>')) return match;
    return '<span style="color: var(--accent-blue); font-weight: 600;">' + dash + '</span>';
  });

  // Highlight parentheses characters themselves (if not already wrapped as part of range earlier)
  text = text.replace(/[()]/g, function(match, offset, string: string) {
    const before = string.substring(0, offset as number);
    if (before.lastIndexOf('<span') > before.lastIndexOf('</span>')) return match;
    return '<span style="color: var(--accent-blue); font-weight: 600;">' + match + '</span>';
  });

  return text;
}

export function escapeHtml(str: any): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Normalize currency labels to canonical keys used across filters/totals/UI
export function normalizeCurrency(c: any): string {
  const raw = (c || '').toString().toLowerCase().trim();
  if (!raw) return '';
  const s = raw
    .replace(/\borbs?\b/g, '')
    .replace(/\borb\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (/^(ex|exa|exalt|exalted)/.test(s)) return 'exalted';
  if (/^(div|divi|divine)/.test(s)) return 'divine';
  if (/^(ann|annul|annulment)/.test(s)) return 'annul';
  if (/^(c|chaos)/.test(s)) return 'chaos';
  if (/altar/.test(s)) return 'altar';
  return s;
}

export function sanitizeCraftingHtml(html: any): string {
  if (!html) return '';
  let out = html as string;
  // Remove script/style entirely
  out = out.replace(/<script[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style[^>]*>[\s\S]*?<\/style>/gi,'');
  // Unwrap anchors
  out = out.replace(/<a\b[^>]*>/gi,'').replace(/<\/a>/gi,'');
  // Strip unwanted attributes except class on span.mod-value
  out = out.replace(/<(span)([^>]*)>/gi, (m, _tag, attrs) => {
    if (/class\s*=\s*"mod-value"/i.test(attrs)) return `<span class="mod-value">`;
    return '<span>';
  });
  // Remove any remaining on* handlers
  out = out.replace(/ on\w+="[^"]*"/gi,'');
  return out;
}
