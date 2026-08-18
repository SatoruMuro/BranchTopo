export type EditMode = "select" | "add_node" | "add_edge" | "delete" | "rename";
export type GraphKey = "standard_graph" | "variant_graph";

export interface BackgroundImageModel {
  path: string;
  image_name: string;
  opacity: number;
  locked: boolean;
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  data_url?: string;
}

export interface NodeModel {
  id: string;
  label: string;
  x: number;
  y: number;
  node_type: string;
  origin_ref_ids: string[];
}

export interface EdgeModel {
  id: string;
  source: string;
  target: string;
  label: string;
  edge_type: string;
  origin_ref_ids: string[];
}

export interface GraphModel {
  name: string;
  root_node_id: string;
  nodes: NodeModel[];
  edges: EdgeModel[];
  background: BackgroundImageModel;
}

export type NodeShiftCalculationStatus = "calculated" | "unmapped" | "unavailable";

export interface NodeShiftEntry {
  standard_node_id: string;
  standard_label: string;
  variant_node_id: string;
  variant_label: string;
  shift_value: number;
  notes: string;
  calculation_status: NodeShiftCalculationStatus;
  calculation_message: string;
}

export interface ScoreModel {
  node_shift_entries: NodeShiftEntry[];
  total_node_shift: number;
  future_score_components: Record<string, unknown>;
}

export interface BranchTopoProject {
  app_name: "BranchTopo";
  app_version: string;
  schema_version: string;
  standard_graph: GraphModel;
  variant_graph: GraphModel;
  score: ScoreModel;
}
