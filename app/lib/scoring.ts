import type {
  BranchTopoProject,
  GraphModel,
  NodeShiftEntry,
} from "../types";

interface RootedTree {
  adjacency: Map<string, string[]>;
  parent: Map<string, string | null>;
}

export interface NodeShiftCalculation {
  entries: NodeShiftEntry[];
  total: number;
  error: string;
}

function buildRootedTree(graph: GraphModel): { tree: RootedTree | null; error: string } {
  if (!graph.nodes.length) return { tree: null, error: "Add nodes before calculating." };
  if (!graph.root_node_id || !graph.nodes.some((node) => node.id === graph.root_node_id)) {
    return { tree: null, error: `Select a root node for ${graph.name}.` };
  }

  const adjacency = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  const edgeKeys = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.source === edge.target || !adjacency.has(edge.source) || !adjacency.has(edge.target)) {
      return { tree: null, error: `${graph.name} contains an invalid edge.` };
    }
    const key = [edge.source, edge.target].sort().join("::");
    if (edgeKeys.has(key)) return { tree: null, error: `${graph.name} contains duplicate edges.` };
    edgeKeys.add(key);
    adjacency.get(edge.source)?.push(edge.target);
    adjacency.get(edge.target)?.push(edge.source);
  }

  if (graph.edges.length !== graph.nodes.length - 1) {
    return { tree: null, error: `${graph.name} must be a connected tree without cycles.` };
  }

  const parent = new Map<string, string | null>([[graph.root_node_id, null]]);
  const queue = [graph.root_node_id];
  for (let index = 0; index < queue.length; index += 1) {
    const nodeId = queue[index];
    for (const neighbor of adjacency.get(nodeId) || []) {
      if (neighbor === parent.get(nodeId)) continue;
      if (parent.has(neighbor)) {
        return { tree: null, error: `${graph.name} must not contain cycles.` };
      }
      parent.set(neighbor, nodeId);
      queue.push(neighbor);
    }
  }
  if (parent.size !== graph.nodes.length) {
    return { tree: null, error: `${graph.name} must be connected.` };
  }
  return { tree: { adjacency, parent }, error: "" };
}

function distance(adjacency: Map<string, string[]>, source: string, target: string): number | null {
  if (source === target) return 0;
  const visited = new Set([source]);
  const queue: Array<{ id: string; distance: number }> = [{ id: source, distance: 0 }];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const neighbor of adjacency.get(current.id) || []) {
      if (visited.has(neighbor)) continue;
      if (neighbor === target) return current.distance + 1;
      visited.add(neighbor);
      queue.push({ id: neighbor, distance: current.distance + 1 });
    }
  }
  return null;
}

function unavailable(entries: NodeShiftEntry[], message: string): NodeShiftCalculation {
  return {
    entries: entries.map((entry) => ({
      ...entry,
      shift_value: 0,
      calculation_status: entry.variant_node_id ? "unavailable" : "unmapped",
      calculation_message: entry.variant_node_id ? message : "Select a corresponding variant node.",
    })),
    total: 0,
    error: message,
  };
}

export function calculateNodeShift(
  project: BranchTopoProject,
  entries: NodeShiftEntry[],
): NodeShiftCalculation {
  if (!entries.length) return { entries, total: 0, error: "" };

  const standardResult = buildRootedTree(project.standard_graph);
  if (!standardResult.tree) return unavailable(entries, standardResult.error);
  const variantResult = buildRootedTree(project.variant_graph);
  if (!variantResult.tree) return unavailable(entries, variantResult.error);
  const standardTree = standardResult.tree;
  const variantTree = variantResult.tree;

  const variantIds = new Set(project.variant_graph.nodes.map((node) => node.id));
  const mappingCounts = new Map<string, number>();
  for (const entry of entries) {
    if (variantIds.has(entry.variant_node_id)) {
      mappingCounts.set(entry.variant_node_id, (mappingCounts.get(entry.variant_node_id) || 0) + 1);
    }
  }
  const variantToStandard = new Map<string, string>();
  for (const entry of entries) {
    if (mappingCounts.get(entry.variant_node_id) === 1) {
      variantToStandard.set(entry.variant_node_id, entry.standard_node_id);
    }
  }

  const standardRootEntry = entries.find(
    (entry) => entry.standard_node_id === project.standard_graph.root_node_id,
  );
  if (!standardRootEntry || standardRootEntry.variant_node_id !== project.variant_graph.root_node_id) {
    return unavailable(entries, "The standard and variant root nodes must correspond.");
  }

  const standardNodes = new Map(project.standard_graph.nodes.map((node) => [node.id, node]));
  const nextEntries = entries.map((entry): NodeShiftEntry => {
    if (!variantIds.has(entry.variant_node_id)) {
      return {
        ...entry,
        shift_value: 0,
        calculation_status: "unmapped",
        calculation_message: "Select a corresponding variant node.",
      };
    }
    if ((mappingCounts.get(entry.variant_node_id) || 0) > 1) {
      return {
        ...entry,
        shift_value: 0,
        calculation_status: "unavailable",
        calculation_message: "This variant node is mapped more than once.",
      };
    }
    if (entry.standard_node_id === project.standard_graph.root_node_id) {
      return {
        ...entry,
        shift_value: 0,
        calculation_status: "calculated",
        calculation_message: "Root node.",
      };
    }

    const standardParent = standardTree.parent.get(entry.standard_node_id);
    let variantAncestor = variantTree.parent.get(entry.variant_node_id) ?? null;
    while (variantAncestor && !variantToStandard.has(variantAncestor)) {
      variantAncestor = variantTree.parent.get(variantAncestor) ?? null;
    }
    const variantParentStandard = variantAncestor ? variantToStandard.get(variantAncestor) : undefined;
    if (!standardParent || !variantParentStandard) {
      return {
        ...entry,
        shift_value: 0,
        calculation_status: "unavailable",
        calculation_message: "A corresponding upstream attachment could not be identified.",
      };
    }

    const shift = distance(standardTree.adjacency, standardParent, variantParentStandard);
    if (shift === null) {
      return {
        ...entry,
        shift_value: 0,
        calculation_status: "unavailable",
        calculation_message: "The attachment points are not connected in the standard graph.",
      };
    }
    const standardParentLabel = standardNodes.get(standardParent)?.label || standardParent;
    const variantParentLabel = standardNodes.get(variantParentStandard)?.label || variantParentStandard;
    return {
      ...entry,
      shift_value: shift,
      calculation_status: "calculated",
      calculation_message: shift === 0
        ? "Attachment unchanged."
        : `${standardParentLabel} to ${variantParentLabel}: ${shift} step${shift === 1 ? "" : "s"}.`,
    };
  });
  const total = nextEntries.reduce((sum, entry) =>
    entry.calculation_status === "calculated" ? sum + entry.shift_value : sum, 0);
  const unavailableCount = nextEntries.filter((entry) => entry.calculation_status !== "calculated").length;
  return {
    entries: nextEntries,
    total,
    error: unavailableCount ? `${unavailableCount} node${unavailableCount === 1 ? "" : "s"} could not be calculated.` : "",
  };
}
