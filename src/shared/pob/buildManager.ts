/**
 * POB Build Manager
 * Manages multiple saved POB builds with activate/rename/delete functionality
 */

import type { PobBuildEntry, PobBuildsList, StoredPobBuild } from './types.js';

/**
 * Generate a unique ID for a build
 */
function generateBuildId(): string {
  return `pob_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a default name for a build
 */
function generateDefaultName(build: StoredPobBuild): string {
  const className = build.className || 'Unknown';
  const ascendancy = build.ascendancyName ? ` ${build.ascendancyName}` : '';
  return `${className}${ascendancy}`;
}

/**
 * Create an empty builds list
 */
export function createEmptyBuildsList(): PobBuildsList {
  return {
    builds: [],
    activeId: null
  };
}

/**
 * Add a new build to the list
 */
export function addBuild(
  buildsList: PobBuildsList,
  build: StoredPobBuild,
  customName?: string
): PobBuildsList {
  const now = Date.now();
  const id = generateBuildId();
  const name = customName || generateDefaultName(build);
  
  const newEntry: PobBuildEntry = {
    id,
    name,
    build,
    isActive: true, // New builds are automatically active
    createdAt: now,
    updatedAt: now
  };
  
  // Deactivate all existing builds
  const existingBuilds = Array.isArray(buildsList?.builds) ? buildsList.builds : [];
  const updatedBuilds = existingBuilds.map(b => ({
    ...b,
    isActive: false
  }));
  
  // Add new build and set as active
  return {
    builds: [...updatedBuilds, newEntry],
    activeId: id
  };
}

/**
 * Delete a build from the list
 */
export function deleteBuild(buildsList: PobBuildsList, buildId: string): PobBuildsList {
  const existingBuilds = Array.isArray(buildsList?.builds) ? buildsList.builds : [];
  const updatedBuilds = existingBuilds.filter(b => b.id !== buildId);
  
  // If we deleted the active build, activate the most recently updated one
  let newActiveId = buildsList?.activeId || null;
  if (buildsList?.activeId === buildId) {
    if (updatedBuilds.length > 0) {
      // Sort by updatedAt descending and pick the first
      const sorted = [...updatedBuilds].sort((a, b) => b.updatedAt - a.updatedAt);
      newActiveId = sorted[0].id;
      // Mark it as active
      return {
        builds: updatedBuilds.map(b => ({
          ...b,
          isActive: b.id === newActiveId
        })),
        activeId: newActiveId
      };
    } else {
      newActiveId = null;
    }
  }
  
  return {
    builds: updatedBuilds,
    activeId: newActiveId
  };
}

/**
 * Rename a build
 */
export function renameBuild(
  buildsList: PobBuildsList,
  buildId: string,
  newName: string
): PobBuildsList {
  const now = Date.now();
  const existingBuilds = Array.isArray(buildsList?.builds) ? buildsList.builds : [];
  
  return {
    ...buildsList,
    builds: existingBuilds.map(b => 
      b.id === buildId 
        ? { ...b, name: newName.trim() || generateDefaultName(b.build), updatedAt: now }
        : b
    )
  };
}

/**
 * Set a build as active
 */
export function setActiveBuild(buildsList: PobBuildsList, buildId: string): PobBuildsList {
  const existingBuilds = Array.isArray(buildsList?.builds) ? buildsList.builds : [];
  
  // Make sure the build exists
  const buildExists = existingBuilds.some(b => b.id === buildId);
  if (!buildExists) {
    return buildsList || createEmptyBuildsList();
  }
  
  const now = Date.now();
  
  return {
    builds: existingBuilds.map(b => ({
      ...b,
      isActive: b.id === buildId,
      updatedAt: b.id === buildId ? now : b.updatedAt
    })),
    activeId: buildId
  };
}

/**
 * Get the currently active build
 */
export function getActiveBuild(buildsList: PobBuildsList): StoredPobBuild | null {
  if (!buildsList?.activeId) return null;
  
  const existingBuilds = Array.isArray(buildsList?.builds) ? buildsList.builds : [];
  const activeBuild = existingBuilds.find(b => b.id === buildsList.activeId);
  return activeBuild ? activeBuild.build : null;
}

/**
 * Get a build by ID
 */
export function getBuildById(buildsList: PobBuildsList, buildId: string): PobBuildEntry | null {
  const existingBuilds = Array.isArray(buildsList?.builds) ? buildsList.builds : [];
  return existingBuilds.find(b => b.id === buildId) || null;
}

/**
 * Get all builds sorted by most recently updated
 */
export function getAllBuilds(buildsList: PobBuildsList): PobBuildEntry[] {
  const existingBuilds = Array.isArray(buildsList?.builds) ? buildsList.builds : [];
  return [...existingBuilds].sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Check if a build name already exists (case-insensitive)
 */
export function buildNameExists(buildsList: PobBuildsList, name: string, excludeId?: string): boolean {
  const normalizedName = name.trim().toLowerCase();
  const existingBuilds = Array.isArray(buildsList?.builds) ? buildsList.builds : [];
  return existingBuilds.some(
    b => b.name.toLowerCase() === normalizedName && b.id !== excludeId
  );
}

/**
 * Migrate legacy pobBuild to new builds list format
 */
export function migrateLegacyBuild(legacyBuild: StoredPobBuild): PobBuildsList {
  const now = Date.now();
  const id = generateBuildId();
  const name = generateDefaultName(legacyBuild);
  
  const entry: PobBuildEntry = {
    id,
    name,
    build: legacyBuild,
    isActive: true,
    createdAt: legacyBuild.importedAt || now,
    updatedAt: now
  };
  
  return {
    builds: [entry],
    activeId: id
  };
}
