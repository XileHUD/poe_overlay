export type OverlayVersion = 'poe1' | 'poe2';

export function isOverlayVersion(value: unknown): value is OverlayVersion {
  return value === 'poe1' || value === 'poe2';
}

export const OVERLAY_VERSIONS: OverlayVersion[] = ['poe1', 'poe2'];
