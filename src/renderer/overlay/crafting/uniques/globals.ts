// Attach Uniques API on window as OverlayUniques for backward-compatible delegation
import * as Uniques from "./module";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).OverlayUniques = Uniques;
