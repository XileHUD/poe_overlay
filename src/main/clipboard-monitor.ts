import { EventEmitter } from 'events';
import { clipboard } from 'electron';

export class ClipboardMonitor extends EventEmitter {
    private lastClipboardContent = '';
    private isMonitoring = false;
    private monitorInterval: NodeJS.Timeout | null = null;

    constructor() {
        super();
        this.startMonitoring();
    }

    // Allow consumers to force next detection even if content stays the same
    resetLastSeen() {
        this.lastClipboardContent = '';
    }

    startMonitoring() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        this.lastClipboardContent = this.getClipboard();
        
        // Check clipboard every 500ms (less frequent to avoid spam)
        this.monitorInterval = setInterval(() => {
            this.checkClipboard();
        }, 500);
        
        console.log('Clipboard monitoring started');
    }

    stopMonitoring() {
        if (!this.isMonitoring) return;
        
        this.isMonitoring = false;
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }
        
        console.log('Clipboard monitoring stopped');
    }

    private checkClipboard() {
        try {
            const currentContent = this.getClipboard();
            
            // Always attempt emit when content changes; if same content,
            // still emit if we recently lost focus (handled by consumer).
            if (currentContent && currentContent !== this.lastClipboardContent) {
                this.lastClipboardContent = currentContent;
                this.handleClipboardChange(currentContent);
            }
        } catch (error) {
            console.error('Error checking clipboard:', error);
        }
    }

    private getClipboard(): string {
        // Use Electron's clipboard API for reliability across platforms
        // This avoids sporadic PowerShell Get-Clipboard failures on Windows
        try {
            const text = clipboard.readText();
            return (text || '').trim();
        } catch (error) {
            // Extremely rare; keep silent to avoid log spam, just treat as empty
            return '';
        }
    }

    private handleClipboardChange(content: string) {
        if (this.isPoe2Item(content)) {
            this.emit('poe2-item-copied', content);
        }
    }

    private isPoe2Item(text: string): boolean {
        if (!text || text.length < 30) return false;
        
        // Check for PoE2 item patterns
        const poe2Patterns = [
            /^Item Class:/m,
            /^Rarity:/m,
            /^Requires:/m,
            /^Item Level:/m,
            /^Area Level:/m,
            /^Quality:/m,
            /^Energy Shield:/m,
            /^Evasion Rating:/m,
            /^Armour:/m,
            /^Physical Damage:/m,
            /^Elemental Damage:/m
        ];

        // Item must have at least Item Class and Rarity
        const hasItemClass = /^Item Class:/m.test(text);
        const hasRarity = /^Rarity:/m.test(text);
        
        if (!hasItemClass || !hasRarity) return false;

        // Fast-path for Liquid Emotion currency which may have few stat lines
        if (/^Liquid\s+(Ire|Guilt|Greed|Paranoia|Envy|Disgust|Despair|Fear|Suffering|Isolation)$/m.test(text) || /Diluted\s+Liquid\s+/i.test(text) || /Concentrated\s+Liquid\s+/i.test(text)) {
            return true;
        }

        // Special cases: Tablet/Relic/Waystone items may not have typical stats
        const itemClassLine = text.match(/^Item Class:\s*(.*)$/m)?.[1]?.toLowerCase() || '';
        if (/(tablet|relic|waystone)/.test(itemClassLine)) {
            return true;
        }

        // Check for additional PoE2 patterns
        let patternMatches = 0;
        for (const pattern of poe2Patterns) {
            if (pattern.test(text)) {
                patternMatches++;
            }
        }

        // Require at least 3 pattern matches to be confident it's a PoE2 item
        return patternMatches >= 2; // slightly loosen to catch simpler items (emotions, jewels)
    }

    destroy() {
        this.stopMonitoring();
        this.removeAllListeners();
    }
}