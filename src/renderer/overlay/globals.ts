import { escapeHtml, formatJoinedModText, highlightText, normalizeCurrency, sanitizeCraftingHtml } from './utils';
import { highlightMatches, buildHighlightTerms } from './highlight';

// Attach to window for gradual migration from inline functions
// This file should be included via a type=module script in overlay.html during the transition.
// No side effects besides setting window.OverlayUtils.
(function(){
  (window as any).OverlayUtils = {
    escapeHtml,
    formatJoinedModText,
    highlightText,
    highlightMatches,
    buildHighlightTerms,
    normalizeCurrency,
    sanitizeCraftingHtml,
  };
})();
