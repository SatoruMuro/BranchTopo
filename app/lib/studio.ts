import { hierarchy, tree } from "d3-hierarchy";

import type { BranchTopoProject, GraphModel, NodeModel } from "../types";

export interface FigureRecord {
  id: string;
  fileName: string;
  project: BranchTopoProject;
  structureName: string;
  typeName: string;
}

interface HierarchyDatum {
  node: NodeModel;
  children: HierarchyDatum[];
}

export interface PositionedNode {
  id: string;
  label: string;
  x: number;
  y: number;
}

export interface PositionedEdge {
  source: string;
  target: string;
}

export interface GraphLayout {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  error: string;
}

export function naturalCompare(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

export function displayStructure(project: BranchTopoProject): string {
  return project.structure_name.trim() || "Unspecified structure";
}

export function displayType(project: BranchTopoProject, fileName: string): string {
  return project.type_name.trim() || fileName.replace(/\.json$/i, "");
}

export function standardSignature(graph: GraphModel): string {
  const labels = new Map(graph.nodes.map((node) => [node.id, node.label]));
  const edges = graph.edges.map((edge) =>
    [labels.get(edge.source) || edge.source, labels.get(edge.target) || edge.target]
      .sort((a, b) => naturalCompare(a, b))
      .join("--"),
  ).sort(naturalCompare);
  const root = labels.get(graph.root_node_id) || "";
  return `${root}|${edges.join("|")}`;
}

export function layoutRootedGraph(graph: GraphModel, width: number, height: number): GraphLayout {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  if (!graph.root_node_id || !nodes.has(graph.root_node_id)) {
    return { nodes: [], edges: [], error: "Root node is not selected" };
  }
  const adjacency = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of graph.edges) {
    if (!adjacency.has(edge.source) || !adjacency.has(edge.target) || edge.source === edge.target) {
      return { nodes: [], edges: [], error: "Invalid edge" };
    }
    adjacency.get(edge.source)?.push(edge.target);
    adjacency.get(edge.target)?.push(edge.source);
  }
  if (graph.edges.length !== graph.nodes.length - 1) {
    return { nodes: [], edges: [], error: "Graph is not a tree" };
  }

  const visited = new Set<string>();
  const build = (nodeId: string, parentId: string | null): HierarchyDatum | null => {
    if (visited.has(nodeId)) return null;
    visited.add(nodeId);
    const node = nodes.get(nodeId);
    if (!node) return null;
    const children = (adjacency.get(nodeId) || [])
      .filter((neighbor) => neighbor !== parentId)
      .sort((left, right) => {
        const leftNode = nodes.get(left);
        const rightNode = nodes.get(right);
        return (leftNode?.x || 0) - (rightNode?.x || 0)
          || naturalCompare(leftNode?.label || left, rightNode?.label || right);
      })
      .map((childId) => build(childId, nodeId))
      .filter((child): child is HierarchyDatum => Boolean(child));
    return { node, children };
  };
  const data = build(graph.root_node_id, null);
  if (!data || visited.size !== graph.nodes.length) {
    return { nodes: [], edges: [], error: "Graph is disconnected or cyclic" };
  }

  const root = hierarchy(data, (datum) => datum.children);
  tree<HierarchyDatum>().size([Math.max(1, width - 44), Math.max(1, height - 62)])(root);
  return {
    nodes: root.descendants().map((item) => ({
      id: item.data.node.id,
      label: item.data.node.label,
      x: (item.x ?? 0) + 22,
      y: (item.y ?? 0) + 28,
    })),
    edges: root.links().map((link) => ({
      source: link.source.data.node.id,
      target: link.target.data.node.id,
    })),
    error: "",
  };
}

export function heatmapLabels(records: FigureRecord[]): string[] {
  const labels: string[] = [];
  for (const record of records) {
    for (const entry of record.project.score.node_shift_entries) {
      if (
        entry.standard_node_id === record.project.standard_graph.root_node_id
        || entry.calculation_message.startsWith("Terminal node")
      ) continue;
      if (!labels.includes(entry.standard_label)) labels.push(entry.standard_label);
    }
  }
  return labels;
}
