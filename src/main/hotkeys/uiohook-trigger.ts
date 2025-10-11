import type { UiohookKeyboardEvent } from 'uiohook-napi';

type Logger = (message: string, details?: unknown) => void;
type UiohookModule = typeof import('uiohook-napi');

type HoldDurations = {
    modifierDownDelay: number;
    keyHold: number;
    unwindDelay: number;
};

type TriggerCopyOptions = {
    includeAlt?: boolean;
    logger?: Logger;
    hold?: Partial<HoldDurations>;
};

const DEFAULT_HOLD: HoldDurations = {
    modifierDownDelay: 18,
    keyHold: 36,
    unwindDelay: 20
};

let attemptedLoad = false;
let uiohookModule: UiohookModule | null = null;
let moduleLoadPromise: Promise<UiohookModule | null> | null = null;
let listenersAttached = false;
let hookStarted = false;
let moduleLoadError: unknown = null;

const pressedPhysicalKeys = new Set<number>();

let keydownHandler: ((event: UiohookKeyboardEvent) => void) | null = null;
let keyupHandler: ((event: UiohookKeyboardEvent) => void) | null = null;

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function loadModule(logger?: Logger): Promise<UiohookModule | null> {
    if (uiohookModule) return uiohookModule;
    if (attemptedLoad && moduleLoadError) {
        logger?.('[Hotkey] uIOhook previously failed to load', moduleLoadError);
        return null;
    }

    if (!moduleLoadPromise) {
        attemptedLoad = true;
        moduleLoadPromise = import('uiohook-napi')
            .then((mod) => {
                uiohookModule = mod;
                moduleLoadError = null;
                return mod;
            })
            .catch((err) => {
                moduleLoadError = err;
                logger?.('[Hotkey] Failed to import uiohook-napi', err);
                uiohookModule = null;
                return null;
            })
            .finally(() => {
                moduleLoadPromise = null;
            });
    }

    return moduleLoadPromise;
}

function ensureListeners(module: UiohookModule): void {
    if (listenersAttached) return;

    keydownHandler = (event: UiohookKeyboardEvent) => {
        pressedPhysicalKeys.add(event.keycode);
    };
    keyupHandler = (event: UiohookKeyboardEvent) => {
        pressedPhysicalKeys.delete(event.keycode);
    };

    module.uIOhook.on('keydown', keydownHandler);
    module.uIOhook.on('keyup', keyupHandler);
    listenersAttached = true;
}

async function ensureHookStarted(logger?: Logger): Promise<UiohookModule | null> {
    const module = await loadModule(logger);
    if (!module) return null;

    ensureListeners(module);

    if (!hookStarted) {
        try {
            module.uIOhook.start();
            hookStarted = true;
        } catch (err) {
            logger?.('[Hotkey] Failed to start uIOhook listener', err);
            return null;
        }
    }

    return module;
}

function modifierKeyCodes(module: UiohookModule) {
    const { UiohookKey } = module;
    const isMac = process.platform === 'darwin';

    const control = isMac ? UiohookKey.Meta : UiohookKey.Ctrl;
    const controlVariants = isMac
        ? [UiohookKey.Meta, UiohookKey.MetaRight ?? UiohookKey.Meta]
        : [UiohookKey.Ctrl, UiohookKey.CtrlRight ?? UiohookKey.Ctrl];

    const alt = UiohookKey.Alt;
    const altVariants = [UiohookKey.Alt, UiohookKey.AltRight ?? UiohookKey.Alt];

    return { control, controlVariants, alt, altVariants, c: UiohookKey.C };
}

export async function initializeUiohookTrigger(logger?: Logger): Promise<boolean> {
    return Boolean(await ensureHookStarted(logger));
}

export function isUiohookActive(): boolean {
    return hookStarted;
}

export async function triggerCopyShortcut(options: TriggerCopyOptions = {}): Promise<boolean> {
    const module = await ensureHookStarted(options.logger);
    if (!module) return false;

    const timings: HoldDurations = {
        modifierDownDelay: options.hold?.modifierDownDelay ?? DEFAULT_HOLD.modifierDownDelay,
        keyHold: options.hold?.keyHold ?? DEFAULT_HOLD.keyHold,
        unwindDelay: options.hold?.unwindDelay ?? DEFAULT_HOLD.unwindDelay
    };

    const { uIOhook } = module;
    const { control, controlVariants, alt, altVariants, c } = modifierKeyCodes(module);
    const modifiersPressedByUs: number[] = [];
    const includeAlt = options.includeAlt ?? true;

    try {
        const ctrlAlreadyDown = controlVariants.some((code) => pressedPhysicalKeys.has(code));
        if (!ctrlAlreadyDown) {
            uIOhook.keyToggle(control, 'down');
            modifiersPressedByUs.push(control);
            await sleep(timings.modifierDownDelay);
        }

        const altAlreadyDown = altVariants.some((code) => pressedPhysicalKeys.has(code));
        if (includeAlt && !altAlreadyDown) {
            uIOhook.keyToggle(alt, 'down');
            modifiersPressedByUs.push(alt);
            await sleep(timings.modifierDownDelay);
        }

        const cPhysicallyDown = pressedPhysicalKeys.has(c);

        if (!cPhysicallyDown) {
            uIOhook.keyToggle(c, 'down');
            await sleep(timings.keyHold);
            uIOhook.keyToggle(c, 'up');
        } else {
            // If C is already held, emit an up/down pair while restoring the state
            uIOhook.keyToggle(c, 'up');
            await sleep(timings.modifierDownDelay);
            uIOhook.keyToggle(c, 'down');
            await sleep(timings.modifierDownDelay);
        }

        await sleep(timings.unwindDelay);

        for (let i = modifiersPressedByUs.length - 1; i >= 0; i--) {
            const key = modifiersPressedByUs[i];
            uIOhook.keyToggle(key, 'up');
            await sleep(timings.modifierDownDelay);
        }

        return true;
    } catch (err) {
        options.logger?.('[Hotkey] uIOhook trigger failed', err);
        // Attempt to release any modifiers we pressed if an error occurs
        for (const key of modifiersPressedByUs.reverse()) {
            try { uIOhook.keyToggle(key, 'up'); } catch { /* noop */ }
        }
        return false;
    }
}

export function shutdownUiohookTrigger(logger?: Logger): void {
    if (!uiohookModule) return;

    if (listenersAttached) {
        if (keydownHandler) {
            uiohookModule.uIOhook.removeListener('keydown', keydownHandler);
            keydownHandler = null;
        }
        if (keyupHandler) {
            uiohookModule.uIOhook.removeListener('keyup', keyupHandler);
            keyupHandler = null;
        }
        listenersAttached = false;
    }

    if (hookStarted) {
        try {
            uiohookModule.uIOhook.stop();
        } catch (err) {
            logger?.('[Hotkey] Failed to stop uIOhook listener', err);
        }
        hookStarted = false;
    }

    pressedPhysicalKeys.clear();
}
