// Entry module to attach all Overlay* window facades for overlay.html to delegate to
// Keep this lightweight; it only imports "globals" files that set window.Overlay*

// Utils shim
import './overlay/globals';

// History
import './overlay/history/globals';

// Crafting panels (already migrated)
import './overlay/crafting/liquid/globals';
import './overlay/crafting/annoints/globals';
import './overlay/crafting/essences/globals';
import './overlay/crafting/catalysts/globals';
import './overlay/crafting/socketables/globals';
import './overlay/crafting/omens/globals';
import './overlay/crafting/currency/globals';

// Items panels
import './overlay/crafting/uniques/globals';
import './overlay/crafting/bases/globals';

// Glossar
import './overlay/crafting/glossar/globals';

// Modifiers (filter/render pipeline)
import './overlay/modifiers/globals';

// Character: Quest Passives
import './overlay/character/quest-passives/globals';

// Tools
import './overlay/tools/regex/globals';

// Global ESC key handler to close overlay (unless pinned)
window.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape' && window.electronAPI) {
            // Check if we're in a modal or input that might want ESC
            const activeElement = document.activeElement;
            const isInInput = activeElement && (
                activeElement.tagName === 'INPUT' ||
                activeElement.tagName === 'TEXTAREA' ||
                activeElement.tagName === 'SELECT'
            );
            
            // If not in an input and overlay exists, close it
            if (!isInInput) {
                e.preventDefault();
                console.log('[ESC] Closing overlay');
                window.electronAPI.hideOverlay();
            }
        }
    });
});
