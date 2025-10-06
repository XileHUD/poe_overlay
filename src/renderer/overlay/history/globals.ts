import * as History from './module';
// Attach to window for compatibility with inline code
// Keep names stable so overlay.html can progressively delegate.
(window as any).OverlayHistory = History;
