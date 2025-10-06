// Attach Bases API on window as OverlayBases for backward-compatible delegation
import * as Bases from "./module";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).OverlayBases = Bases;
