import { EventEmitter } from 'events';

// Passive global keyboard monitor using optional 'iohook'.
// If 'iohook' is not installed, this monitor stays disabled and never emits.
export class KeyboardMonitor extends EventEmitter {
    private hook: any = null;
    public available = false;

    constructor() {
        super();
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const iohook = require('iohook');
            this.hook = iohook;
            this.available = true;
        } catch (e) {
            this.available = false;
        }
    }

    start() {
        if (!this.available || !this.hook) return;
        // Ensure only one listener
        this.hook.removeAllListeners('keydown');
        this.hook.on('keydown', (event: any) => {
            const ctrl = !!(event && (event.ctrlKey || event.metaKey));
            const keycode = event?.keycode;
            const raw = event?.rawcode;
            // IoHook keycode for 'C' is commonly 46; Windows VK_C rawcode is 67
            const isC = keycode === 46 || raw === 67;
            if (ctrl && isC) {
                const ts = Date.now();
                this.emit('copy', ts);
            }
        });
        try {
            this.hook.start();
        } catch {}
    }

    stop() {
        if (!this.available || !this.hook) return;
        try {
            this.hook.stop();
        } catch {}
        this.hook.removeAllListeners('keydown');
    }
}
