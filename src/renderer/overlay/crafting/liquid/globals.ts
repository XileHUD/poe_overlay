// Attach Liquid Emotions API on window as OverlayLiquid for backward-compatible delegation
import * as Liquid from "./module";

// Expose to window
// We don't declare global types here to avoid conflicts; centralize in types/global.d.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).OverlayLiquid = Liquid;
