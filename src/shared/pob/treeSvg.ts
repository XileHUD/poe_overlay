/**
 * Passive Tree SVG Template Generation
 * Based on: https://github.com/HeartofPhos/exile-leveling/blob/main/web/src/state/tree/svg.ts
 */

export interface SkillTreeData {
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  classes: Array<{
    name: string;
    ascendancies: string[];
  }>;
  graphs: Graph[];
  graphIndex: number; // Main tree graph index
  ascendancies: Record<string, {
    id: string;
    startNodeId: string;
    graphIndex: number;
  }>;
  masteryEffects: Record<string, {
    stats: string[];
  }>;
}

export interface Graph {
  nodes: Record<string, Node>;
  connections: Connection[];
}

export interface Node {
  x: number;
  y: number;
  k: 'Normal' | 'Notable' | 'Keystone' | 'Mastery' | 'Jewel' | 'Ascendancy_Start';
  text: string;
  stats?: string[];
}

export interface Connection {
  a: string; // from nodeId
  b: string; // to nodeId
  s?: {
    w: 'CW' | 'CCW'; // winding direction for curved connections
    r: number; // radius
  };
}

export type NodeLookup = Record<string, Node>;

// SVG constants
const PADDING = 550;
const ASCENDANCY_BORDER_RADIUS = 650;
const ASCENDANCY_ASCENDANT_BORDER_RADIUS = 750;
const NODE_STROKE_WIDTH = 0;
const CONNECTION_STROKE_WIDTH = 20;
const CONNECTION_ACTIVE_STROKE_WIDTH = 35;

// CSS class names
const GROUP_NODE_CLASS = 'nodes';
const GROUP_CONNECTION_CLASS = 'connections';
const NODE_MASTERY_CLASS = 'mastery';
const NODE_KEYSTONE_CLASS = 'keystone';
const NODE_NOTABLE_CLASS = 'notable';
const NODE_NORMAL_CLASS = 'normal';
const ASCENDANCY_CLASS = 'ascendancy';
const BORDER_CLASS = 'border';

interface Constants {
  radius: number;
  class?: string;
}

type ConstantsLookup = Partial<Record<Node['k'], Constants>>;

const TREE_CONSTANTS: ConstantsLookup = {
  Mastery: {
    radius: 50,
    class: NODE_MASTERY_CLASS,
  },
  Keystone: {
    radius: 75,
    class: NODE_KEYSTONE_CLASS,
  },
  Notable: {
    radius: 60,
    class: NODE_NOTABLE_CLASS,
  },
  Jewel: {
    radius: 60,
    class: NODE_NOTABLE_CLASS,
  },
  Normal: {
    radius: 40,
    class: NODE_NORMAL_CLASS,
  },
};

const ASCENDANCY_CONSTANTS: ConstantsLookup = {
  Ascendancy_Start: {
    radius: 30,
  },
  Notable: {
    radius: 65,
    class: NODE_NOTABLE_CLASS,
  },
  Normal: {
    radius: 45,
    class: NODE_NORMAL_CLASS,
  },
  Jewel: {
    radius: 65,
    class: NODE_NOTABLE_CLASS,
  },
};

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function buildNode(
  nodeId: string,
  node: Node,
  constantsLookup: ConstantsLookup
): string {
  const constants = constantsLookup[node.k];
  if (!constants) {
    throw new Error(`Missing constant for node kind: ${node.k}`);
  }

  let template = '';
  template += `<circle cx="${node.x}" cy="${node.y}" id="n${nodeId}" r="${constants.radius}" class="${constants.class}">\n`;
  template += `</circle>\n`;

  return template;
}

function buildConnection(connection: Connection, nodeLookup: NodeLookup): string {
  const fromNode = nodeLookup[connection.a];
  const toNode = nodeLookup[connection.b];

  if (!fromNode || !toNode) {
    console.warn(`Connection missing nodes: ${connection.a} -> ${connection.b}`);
    return '';
  }

  const id = `c${connection.a}-${connection.b}`;

  if (connection.s) {
    // Curved connection (arc)
    const sweep = connection.s.w === 'CW' ? 1 : 0;
    const largeArc = 0;

    return `<path id="${id}" d="M ${fromNode.x} ${fromNode.y} A ${connection.s.r} ${connection.s.r} 0 ${largeArc} ${sweep} ${toNode.x} ${toNode.y}"/>\n`;
  } else {
    // Straight line
    return `<line id="${id}" x1="${fromNode.x}" y1="${fromNode.y}" x2="${toNode.x}" y2="${toNode.y}"/>\n`;
  }
}

function buildSubTree(
  graph: Graph,
  nodeLookup: NodeLookup,
  constantsLookup: ConstantsLookup
): string {
  let template = '';

  // Connections first (drawn under nodes)
  template += `<g class="${GROUP_CONNECTION_CLASS}">\n`;
  for (const connection of graph.connections) {
    template += buildConnection(connection, nodeLookup);
  }
  template += `</g>\n`;

  // Nodes on top
  template += `<g class="${GROUP_NODE_CLASS}">\n`;
  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    template += buildNode(nodeId, node, constantsLookup);
  }
  template += `</g>\n`;

  return template;
}

export function buildTemplate(tree: SkillTreeData, nodeLookup: NodeLookup): {
  svg: string;
  viewBox: ViewBox;
  styleTemplate: string;
} {
  const viewBox: ViewBox = {
    x: tree.bounds.minX - PADDING,
    y: tree.bounds.minY - PADDING,
    w: tree.bounds.maxX - tree.bounds.minX + PADDING * 2,
    h: tree.bounds.maxY - tree.bounds.minY + PADDING * 2,
  };

  let svg = '';
  svg += `<svg width="${viewBox.w}" height="${viewBox.h}" viewBox="${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}" xmlns="http://www.w3.org/2000/svg">\n`;

  // Main tree graph
  svg += buildSubTree(tree.graphs[tree.graphIndex], nodeLookup, TREE_CONSTANTS);

  // Ascendancy graphs
  for (const [, ascendancy] of Object.entries(tree.ascendancies)) {
    const startNode = nodeLookup[ascendancy.startNodeId];
    const radius =
      ascendancy.id === 'Ascendant'
        ? ASCENDANCY_ASCENDANT_BORDER_RADIUS
        : ASCENDANCY_BORDER_RADIUS;

    svg += `<g class="${ASCENDANCY_CLASS} ${ascendancy.id}">\n`;
    svg += `<circle cx="${startNode.x}" cy="${startNode.y}" r="${radius}" class="${BORDER_CLASS}"/>\n`;
    svg += buildSubTree(
      tree.graphs[ascendancy.graphIndex],
      nodeLookup,
      ASCENDANCY_CONSTANTS
    );
    svg += `</g>\n`;
  }

  svg += `</svg>\n`;

  // Handlebars-style template for dynamic CSS
  const styleTemplate = `
#{{ styleId }} {
  background-color: {{ backgroundColor }};
}

#{{ styleId }} .${GROUP_NODE_CLASS} {
  fill: {{ nodeColor }};
  stroke: {{ nodeColor }};
  stroke-width: ${NODE_STROKE_WIDTH};
}

#{{ styleId }} .${GROUP_NODE_CLASS} .${NODE_MASTERY_CLASS} {
  fill: hsl(215, 15%, 40%);
  stroke: hsl(215, 15%, 40%);
}

#{{ styleId }} .${GROUP_CONNECTION_CLASS} {
  fill: none;
  stroke: {{ connectionColor }};
  stroke-width: ${CONNECTION_STROKE_WIDTH};
}

#{{ styleId }} .${ASCENDANCY_CLASS} {
  opacity: 0.4;
}

{{#if ascendancy}}
#{{ styleId }} .${ASCENDANCY_CLASS}.{{ ascendancy }} {
  opacity: unset;
}
{{/if}}

#{{ styleId }} .${BORDER_CLASS} {
  fill: none;
  stroke: {{ connectionColor }};
  stroke-width: ${CONNECTION_STROKE_WIDTH};
}

#{{ styleId }} :is({{#each nodesActive}}#n{{this}}{{#unless @last}}, {{/unless}}{{/each}}) {
  fill: {{ nodeActiveColor }};
  stroke: {{ nodeActiveColor }};
}

#{{ styleId }} :is({{#each nodesAdded}}#n{{this}}{{#unless @last}}, {{/unless}}{{/each}}) {
  fill: {{ nodeAddedColor }};
  stroke: {{ nodeAddedColor }};
}

#{{ styleId }} :is({{#each nodesRemoved}}#n{{this}}{{#unless @last}}, {{/unless}}{{/each}}) {
  fill: {{ nodeRemovedColor }};
  stroke: {{ nodeRemovedColor }};
}

#{{ styleId }} :is({{#each connectionsActive}}#{{this}}{{#unless @last}}, {{/unless}}{{/each}}) {
  stroke: {{ connectionActiveColor }};
  stroke-width: ${CONNECTION_ACTIVE_STROKE_WIDTH};
}

#{{ styleId }} :is({{#each connectionsAdded}}#{{this}}{{#unless @last}}, {{/unless}}{{/each}}) {
  stroke: {{ connectionAddedColor }};
  stroke-width: ${CONNECTION_ACTIVE_STROKE_WIDTH};
}

#{{ styleId }} :is({{#each connectionsRemoved}}#{{this}}{{#unless @last}}, {{/unless}}{{/each}}) {
  stroke: {{ connectionRemovedColor }};
  stroke-width: ${CONNECTION_ACTIVE_STROKE_WIDTH};
}
`;

  return { svg, viewBox, styleTemplate };
}
