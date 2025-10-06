// Attach Socketables API on window as OverlaySocketables for backward-compatible delegation
import * as Socketables from "./module";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).OverlaySocketables = Socketables;
