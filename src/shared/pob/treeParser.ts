/**
 * Parse PoB passive tree URLs to extract allocated nodes
 * Based on: https://github.com/HeartofPhos/exile-leveling/blob/main/web/src/state/tree/url-tree.ts
 */

export interface ParsedTreeUrl {
  version: number;
  classId: number;
  ascendancyId: number;
  nodes: string[];
  masteries: Record<string, string>; // nodeId -> effectId
}

function read_u16(buffer: Uint8Array, offset: number): number {
  return (buffer[offset] << 8) | buffer[offset + 1];  // BIG ENDIAN (like exile-leveling)
}

function read_u32(buffer: Uint8Array, offset: number): number {
  return (
    (buffer[offset] << 24) |
    (buffer[offset + 1] << 16) |
    (buffer[offset + 2] << 8) |
    buffer[offset + 3]
  );
}

function read_u16s(buffer: Uint8Array, offset: number, length: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < length; i++) {
    result.push(read_u16(buffer, offset + i * 2));
  }
  return result;
}

function decodeBase64Url(data: string): Uint8Array {
  // PoB uses URL-safe base64 variant
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function parseTreeUrl(url: string): ParsedTreeUrl {
  // Extract the base64 data after the last slash
  const match = /.*\/(.*?)$/.exec(url);
  if (!match?.[1]) {
    throw new Error(`Invalid tree URL: ${url}`);
  }

  const data = match[1];
  const buffer = decodeBase64Url(data);

  // Read header
  const version = read_u32(buffer, 0);
  const classId = buffer[4];
  const ascendancyId = buffer[5];

  let nodesOffset: number;
  let nodesCount: number;
  let clusterOffset: number;
  let clusterCount: number;
  let masteryOffset: number;
  let masteryCount: number;

  if (version >= 6) {
    // Current format (version 6+)
    nodesOffset = 7;
    nodesCount = buffer[6];
    clusterOffset = nodesOffset + nodesCount * 2 + 1;
    clusterCount = buffer[clusterOffset - 1];
    masteryOffset = clusterOffset + clusterCount * 2 + 1;
    masteryCount = buffer[masteryOffset - 1] * 2;
  } else {
    throw new Error(`Unsupported tree URL version: ${version}`);
  }

  // Read node IDs
  const nodeIds = read_u16s(buffer, nodesOffset, nodesCount);
  const nodes = nodeIds.map((id) => id.toString());

  // Read mastery selections
  const masteries: Record<string, string> = {};
  const masteryData = read_u16s(buffer, masteryOffset, masteryCount);
  for (let i = 0; i < masteryData.length; i += 2) {
    const nodeId = masteryData[i + 1].toString();
    const effectId = masteryData[i].toString();
    masteries[nodeId] = effectId;
  }

  return {
    version,
    classId,
    ascendancyId,
    nodes,
    masteries,
  };
}
