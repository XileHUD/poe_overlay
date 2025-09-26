// Attach Catalysts API on window as OverlayCatalysts for backward-compatible delegation
import * as Catalysts from "./module";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).OverlayCatalysts = Catalysts;
