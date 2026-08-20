import type { EdgeModel, GraphModel } from "../types";

export interface BranchMoveContext {
  nodeId: string;
  parentEdgeId: string;
  continuationEdgeIds: string[];
  error: string;
}

export interface BranchMovePlan extends BranchMoveContext {
  continuationEdgeId: string;
  retainedEdgeIds: string[];
  eligibleDestinationEdgeIds: string[];
}

interface RootedGraph {
  parent: Map<string, string | null>;
  parentEdge: Map<string, string>;
  adjacency: Map<string, Array<{ nodeId: string; edgeId: string }>>;
}

function buildRootedGraph(graph: GraphModel): { rooted: RootedGraph | null; error: string } {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  if (!graph.root_node_id || !nodeIds.has(graph.root_node_id)) {
    return { rooted: null, error: "Select the Variant root node first." };
  }
  if (graph.edges.length !== graph.nodes.length - 1) {
    return { rooted: null, error: "Variant Pattern must be a connected tree." };
  }

  const adjacency = new Map(graph.nodes.map((node) => [
    node.id,
    [] as Array<{ nodeId: string; edgeId: string }>,
  ]));
  const pairs = new Set<string>();
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target) || edge.source === edge.target) {
      return { rooted: null, error: "Variant Pattern contains an invalid edge." };
    }
    const pair = [edge.source, edge.target].sort().join("::");
    if (pairs.has(pair)) return { rooted: null, error: "Variant Pattern contains duplicate edges." };
    pairs.add(pair);
    adjacency.get(edge.source)?.push({ nodeId: edge.target, edgeId: edge.id });
    adjacency.get(edge.target)?.push({ nodeId: edge.source, edgeId: edge.id });
  }

  const parent = new Map<string, string | null>([[graph.root_node_id, null]]);
  const parentEdge = new Map<string, string>();
  const queue = [graph.root_node_id];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const neighbor of adjacency.get(current) || []) {
      if (neighbor.nodeId === parent.get(current)) continue;
      if (parent.has(neighbor.nodeId)) {
        return { rooted: null, error: "Variant Pattern must not contain cycles." };
      }
      parent.set(neighbor.nodeId, current);
      parentEdge.set(neighbor.nodeId, neighbor.edgeId);
      queue.push(neighbor.nodeId);
    }
  }
  if (parent.size !== graph.nodes.length) {
    return { rooted: null, error: "Variant Pattern must be connected." };
  }
  return { rooted: { parent, parentEdge, adjacency }, error: "" };
}

export function getBranchMoveContext(graph: GraphModel, nodeId: string): BranchMoveContext {
  const result = buildRootedGraph(graph);
  if (!result.rooted) {
    return { nodeId, parentEdgeId: "", continuationEdgeIds: [], error: result.error };
  }
  if (nodeId === graph.root_node_id) {
    return { nodeId, parentEdgeId: "", continuationEdgeIds: [], error: "The root node cannot be moved." };
  }
  const incident = result.rooted.adjacency.get(nodeId) || [];
  if (incident.length < 3) {
    return { nodeId, parentEdgeId: "", continuationEdgeIds: [], error: "Select a branching node with at least three edges." };
  }
  const parentEdgeId = result.rooted.parentEdge.get(nodeId) || "";
  const continuationEdgeIds = incident
    .filter((neighbor) => result.rooted?.parent.get(neighbor.nodeId) === nodeId)
    .map((neighbor) => neighbor.edgeId);
  if (!parentEdgeId || !continuationEdgeIds.length) {
    return { nodeId, parentEdgeId, continuationEdgeIds: [], error: "This node has no distal continuation edge." };
  }
  return { nodeId, parentEdgeId, continuationEdgeIds, error: "" };
}

export function getBranchMovePlan(
  graph: GraphModel,
  nodeId: string,
  continuationEdgeId: string,
): BranchMovePlan {
  const context = getBranchMoveContext(graph, nodeId);
  const empty = {
    ...context,
    continuationEdgeId,
    retainedEdgeIds: [] as string[],
    eligibleDestinationEdgeIds: [] as string[],
  };
  if (context.error) return empty;
  if (!context.continuationEdgeIds.includes(continuationEdgeId)) {
    return { ...empty, error: "Select one of the highlighted distal edges." };
  }

  const removed = new Set([context.parentEdgeId, continuationEdgeId]);
  const retainedEdgeIds = graph.edges
    .filter((edge) => (edge.source === nodeId || edge.target === nodeId) && !removed.has(edge.id))
    .map((edge) => edge.id);
  const adjacency = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of graph.edges) {
    if (removed.has(edge.id)) continue;
    adjacency.get(edge.source)?.push(edge.target);
    adjacency.get(edge.target)?.push(edge.source);
  }
  const movingComponent = new Set<string>([nodeId]);
  const queue = [nodeId];
  for (let index = 0; index < queue.length; index += 1) {
    for (const neighbor of adjacency.get(queue[index]) || []) {
      if (movingComponent.has(neighbor)) continue;
      movingComponent.add(neighbor);
      queue.push(neighbor);
    }
  }
  const eligibleDestinationEdgeIds = graph.edges
    .filter((edge) => !removed.has(edge.id))
    .filter((edge) => !movingComponent.has(edge.source) && !movingComponent.has(edge.target))
    .map((edge) => edge.id);
  return {
    ...context,
    continuationEdgeId,
    retainedEdgeIds,
    eligibleDestinationEdgeIds,
    error: eligibleDestinationEdgeIds.length ? "" : "No valid destination edge is available.",
  };
}

function lineage(...edges: EdgeModel[]): string[] {
  return Array.from(new Set(edges.flatMap((edge) => [edge.id, ...edge.origin_ref_ids])));
}

function otherEnd(edge: EdgeModel, nodeId: string): string {
  return edge.source === nodeId ? edge.target : edge.source;
}

function defaultEdgeId(): string {
  return `edge_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
}

export function moveBranchPoint(
  graph: GraphModel,
  nodeId: string,
  continuationEdgeId: string,
  destinationEdgeId: string,
  point: { x: number; y: number },
  createEdgeId: () => string = defaultEdgeId,
): GraphModel {
  const plan = getBranchMovePlan(graph, nodeId, continuationEdgeId);
  if (plan.error) throw new Error(plan.error);
  if (!plan.eligibleDestinationEdgeIds.includes(destinationEdgeId)) {
    throw new Error("Select a highlighted destination edge.");
  }
  const parentEdge = graph.edges.find((edge) => edge.id === plan.parentEdgeId);
  const continuationEdge = graph.edges.find((edge) => edge.id === continuationEdgeId);
  const destinationEdge = graph.edges.find((edge) => edge.id === destinationEdgeId);
  if (!parentEdge || !continuationEdge || !destinationEdge) {
    throw new Error("An edge required for this move is missing.");
  }

  const parentNeighbor = otherEnd(parentEdge, nodeId);
  const continuationNeighbor = otherEnd(continuationEdge, nodeId);
  const removed = new Set([parentEdge.id, continuationEdge.id, destinationEdge.id]);
  const bypassLabel = parentEdge.label === continuationEdge.label ? parentEdge.label : "";
  const bypassType = parentEdge.edge_type === continuationEdge.edge_type
    ? parentEdge.edge_type
    : "branch";
  const nextEdges: EdgeModel[] = [
    ...graph.edges.filter((edge) => !removed.has(edge.id)),
    {
      id: createEdgeId(),
      source: parentNeighbor,
      target: continuationNeighbor,
      label: bypassLabel,
      edge_type: bypassType,
      origin_ref_ids: lineage(parentEdge, continuationEdge),
    },
    {
      id: createEdgeId(),
      source: destinationEdge.source,
      target: nodeId,
      label: destinationEdge.label,
      edge_type: destinationEdge.edge_type,
      origin_ref_ids: lineage(destinationEdge),
    },
    {
      id: createEdgeId(),
      source: nodeId,
      target: destinationEdge.target,
      label: destinationEdge.label,
      edge_type: destinationEdge.edge_type,
      origin_ref_ids: lineage(destinationEdge),
    },
  ];
  return {
    ...graph,
    nodes: graph.nodes.map((node) => node.id === nodeId ? { ...node, ...point } : node),
    edges: nextEdges,
  };
}
