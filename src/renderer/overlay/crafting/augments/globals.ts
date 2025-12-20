// Attach Augments API on window as OverlayAugments (with backward-compatible OverlaySocketables alias)
import * as Augments from "./module";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).OverlayAugments = Augments;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).OverlaySocketables = Augments; // Legacy alias
