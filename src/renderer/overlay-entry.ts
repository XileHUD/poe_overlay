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

// Items panels
import './overlay/crafting/uniques/globals';
import './overlay/crafting/bases/globals';

// Glossar
import './overlay/crafting/glossar/globals';

// Modifiers (filter/render pipeline)
import './overlay/modifiers/globals';

// Character: Quest Passives
import './overlay/character/quest-passives/globals';
