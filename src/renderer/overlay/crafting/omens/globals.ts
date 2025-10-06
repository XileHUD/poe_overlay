// Attach Omens API on window as OverlayOmens for backward-compatible delegation
import * as Omens from "./module";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).OverlayOmens = Omens;
