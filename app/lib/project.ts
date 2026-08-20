import type {
  BackgroundImageModel,
  BranchTopoProject,
  GraphModel,
  NodeShiftEntry,
} from "../types";
import { calculateNodeShift } from "./scoring";

const emptyBackground = (): BackgroundImageModel => ({
  path: "",
  image_name: "",
  opacity: 0.55,
  locked: true,
  visible: true,
  x: 0,
  y: 0,
  width: 0,
  height: 0,
});

const emptyGraph = (name: string): GraphModel => ({
  name,
  root_node_id: "",
  nodes: [],
  edges: [],
  background: emptyBackground(),
});

export function createProject(): BranchTopoProject {
  return {
    app_name: "BranchTopo",
    app_version: "0.1.3-web",
    schema_version: "0.2",
    structure_name: "",
    type_name: "",
    standard_graph: emptyGraph("Standard Pattern"),
    variant_graph: emptyGraph("Variant Pattern"),
    score: {
      node_shift_entries: [],
      total_node_shift: 0,
      future_score_components: {},
    },
  };
}

export function newId(prefix: "node" | "edge"): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
}

export function syncScoreEntries(project: BranchTopoProject): NodeShiftEntry[] {
  const previous = new Map(
    project.score.node_shift_entries.map((entry) => [entry.standard_node_id, entry]),
  );
  return project.standard_graph.nodes.map((standard) => {
    const existing = previous.get(standard.id);
    const originMatch = project.variant_graph.nodes.find((node) =>
      node.origin_ref_ids.includes(standard.id),
    );
    const selectedId = existing?.variant_node_id || originMatch?.id || "";
    const selected = project.variant_graph.nodes.find((node) => node.id === selectedId);
    return {
      standard_node_id: standard.id,
      standard_label: standard.label,
      variant_node_id: selected?.id || "",
      variant_label: selected?.label || "",
      shift_value: Math.max(0, Math.min(5, existing?.shift_value ?? 0)),
      notes: existing?.notes ?? "",
      calculation_status: existing?.calculation_status ?? "unavailable",
      calculation_message: existing?.calculation_message ?? "Select root nodes to calculate.",
    };
  });
}

export function withUpdatedScore(
  project: BranchTopoProject,
  entries = syncScoreEntries(project),
): BranchTopoProject {
  const calculation = calculateNodeShift(project, entries);
  return {
    ...project,
    score: {
      ...project.score,
      node_shift_entries: calculation.entries,
      total_node_shift: calculation.total,
    },
  };
}

export function copyStandardToVariant(project: BranchTopoProject): BranchTopoProject {
  const nodeIds = new Map<string, string>();
  const nodes = project.standard_graph.nodes.map((node) => {
    const id = newId("node");
    nodeIds.set(node.id, id);
    return { ...node, id, origin_ref_ids: [node.id, ...node.origin_ref_ids] };
  });
  const edges = project.standard_graph.edges.flatMap((edge) => {
    const source = nodeIds.get(edge.source);
    const target = nodeIds.get(edge.target);
    return source && target
      ? [{ ...edge, id: newId("edge"), source, target, origin_ref_ids: [edge.id, ...edge.origin_ref_ids] }]
      : [];
  });
  const next = {
    ...project,
    variant_graph: {
      name: "Variant Pattern",
      root_node_id: project.standard_graph.root_node_id
        ? nodeIds.get(project.standard_graph.root_node_id) || ""
        : "",
      nodes,
      edges,
      background: project.variant_graph.background,
    },
  };
  return withUpdatedScore(next);
}

export function projectForDownload(project: BranchTopoProject): BranchTopoProject {
  const cleanBackground = (background: BackgroundImageModel): BackgroundImageModel => {
    const settings = { ...background };
    delete settings.data_url;
    return settings;
  };
  const scored = withUpdatedScore(project);
  return {
    ...scored,
    standard_graph: { ...scored.standard_graph, background: cleanBackground(scored.standard_graph.background) },
    variant_graph: { ...scored.variant_graph, background: cleanBackground(scored.variant_graph.background) },
  };
}

export function normalizeProject(value: unknown, preserveBackgroundData = false): BranchTopoProject {
  if (!value || typeof value !== "object") throw new Error("Invalid project file");
  const incoming = value as Partial<BranchTopoProject>;
  if (!incoming.standard_graph || !incoming.variant_graph) throw new Error("Graph data is missing");
  const fallback = createProject();
  const normalizeGraph = (graph: Partial<GraphModel>, fallbackGraph: GraphModel): GraphModel => ({
    name: String(graph.name || fallbackGraph.name),
    root_node_id: String(graph.root_node_id || ""),
    nodes: Array.isArray(graph.nodes) ? graph.nodes : [],
    edges: Array.isArray(graph.edges) ? graph.edges : [],
    background: {
      ...fallbackGraph.background,
      ...(graph.background || {}),
      data_url: preserveBackgroundData ? graph.background?.data_url : undefined,
    },
  });
  const normalized: BranchTopoProject = {
    ...fallback,
    ...incoming,
    app_name: "BranchTopo",
    structure_name: typeof incoming.structure_name === "string" ? incoming.structure_name : fallback.structure_name,
    type_name: typeof incoming.type_name === "string" ? incoming.type_name : fallback.type_name,
    standard_graph: normalizeGraph(incoming.standard_graph, fallback.standard_graph),
    variant_graph: normalizeGraph(incoming.variant_graph, fallback.variant_graph),
    score: { ...fallback.score, ...(incoming.score || {}) },
  };
  return withUpdatedScore(normalized);
}
