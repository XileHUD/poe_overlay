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

// Items panels (PoE2)
import './overlay/crafting/uniques/globals';
import './overlay/crafting/bases/globals';

// Items panels (PoE1)
import './overlay/items/poe1/uniques/globals';
import './overlay/items/poe1/bases/globals';

// Crafting panels (PoE1)
import './overlay/crafting/poe1/scarabs/globals';
import './overlay/crafting/poe1/currency/globals';
import './overlay/crafting/poe1/essences/globals';
import './overlay/crafting/poe1/fossils/globals';
import './overlay/crafting/poe1/embers/globals';

// Glossar
import './overlay/crafting/glossar/globals';

// Modifiers (filter/render pipeline)
import './overlay/modifiers/globals';

// Character: Quest Passives
import './overlay/character/quest-passives/globals';

// Tools
import './overlay/tools/regex/globals';

function enableNumberScrollWheel(): void {
    const precisionFromStep = (step: string): number => {
        if (!step || step === 'any') return 0;
        const dot = step.indexOf('.');
        if (dot === -1) return 0;
        return step.length - dot - 1;
    };

    const attachWheel = (input: HTMLInputElement): void => {
        if ((input as any)._wheelAttached) return;
        (input as any)._wheelAttached = true;

        input.addEventListener('wheel', (event: WheelEvent) => {
            if (event.ctrlKey) return; // allow browser zoom gesture
            event.preventDefault();

            const stepAttr = input.step;
            const stepVal = stepAttr && stepAttr !== 'any' ? Number(stepAttr) : 1;
            const step = Number.isFinite(stepVal) && stepVal !== 0 ? stepVal : 1;
            const direction = event.deltaY < 0 ? 1 : -1;

            const currentValue = Number(input.value || 0) || 0;
            let nextValue = currentValue + step * direction;

            if (input.min !== '') {
                const minVal = Number(input.min);
                if (Number.isFinite(minVal)) {
                    nextValue = Math.max(nextValue, minVal);
                }
            }
            if (input.max !== '') {
                const maxVal = Number(input.max);
                if (Number.isFinite(maxVal)) {
                    nextValue = Math.min(nextValue, maxVal);
                }
            }

            const precision = precisionFromStep(stepAttr || '');
            if (precision > 0) {
                const multiplier = Math.pow(10, precision);
                nextValue = Math.round(nextValue * multiplier) / multiplier;
            } else {
                nextValue = Math.round(nextValue);
            }

            input.value = String(nextValue);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }, { passive: false });
    };

    const scanInputs = (root: ParentNode = document): void => {
        root.querySelectorAll<HTMLInputElement>('input[type="number"]').forEach(attachWheel);
    };

    scanInputs();

    if (typeof MutationObserver === 'undefined') return;
    if (!(window as any)._numberWheelObserver) {
        try {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node instanceof HTMLInputElement) {
                            if (node.type === 'number') attachWheel(node);
                        } else if (node instanceof HTMLElement) {
                            scanInputs(node);
                        }
                    });
                });
            });
            if (document.body) {
                observer.observe(document.body, { childList: true, subtree: true });
                (window as any)._numberWheelObserver = observer;
            }
        } catch {
            // noop - observer not critical
        }
    }
}

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

    enableNumberScrollWheel();
});
