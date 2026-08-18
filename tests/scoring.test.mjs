import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../app/lib/scoring.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { calculateNodeShift } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const background = {
  path: "", image_name: "", opacity: 0.55, locked: true, visible: true,
  x: 0, y: 0, width: 0, height: 0,
};

function node(id, origin = []) {
  return { id, label: id, x: 0, y: 0, node_type: "branch_node", origin_ref_ids: origin };
}

function edge(id, source, target) {
  return { id, source, target, label: "", edge_type: "branch", origin_ref_ids: [] };
}

function makeProject(variantAttachment = "vB", roots = ["R", "vR"]) {
  const standardNodes = [node("R"), node("A"), node("B"), node("C"), node("X")];
  const variantNodes = standardNodes.map((item) => node(`v${item.id}`, [item.id]));
  const standard = {
    name: "Standard Pattern", root_node_id: roots[0], nodes: standardNodes,
    edges: [edge("s1", "R", "A"), edge("s2", "A", "B"), edge("s3", "B", "C"), edge("s4", "A", "X")],
    background,
  };
  const variant = {
    name: "Variant Pattern", root_node_id: roots[1], nodes: variantNodes,
    edges: [edge("v1", "vR", "vA"), edge("v2", "vA", "vB"), edge("v3", "vB", "vC"), edge("v4", variantAttachment, "vX")],
    background,
  };
  return {
    app_name: "BranchTopo", app_version: "test", schema_version: "test",
    standard_graph: standard, variant_graph: variant,
    score: { node_shift_entries: [], total_node_shift: 0, future_score_components: {} },
  };
}

function entries(project) {
  return project.standard_graph.nodes.map((standard) => ({
    standard_node_id: standard.id,
    standard_label: standard.label,
    variant_node_id: `v${standard.id}`,
    variant_label: `v${standard.id}`,
    shift_value: 0,
    notes: "",
    calculation_status: "unavailable",
    calculation_message: "",
  }));
}

test("calculates a one-step attachment shift", () => {
  const project = makeProject("vB");
  const result = calculateNodeShift(project, entries(project));
  assert.equal(result.error, "");
  assert.equal(result.total, 1);
  assert.equal(result.entries.find((entry) => entry.standard_node_id === "X")?.shift_value, 1);
});

test("calculates multiple steps along the standard tree", () => {
  const project = makeProject("vC");
  const result = calculateNodeShift(project, entries(project));
  assert.equal(result.total, 2);
  assert.match(
    result.entries.find((entry) => entry.standard_node_id === "X")?.calculation_message || "",
    /2 steps/,
  );
});

test("refuses to guess without corresponding roots", () => {
  const project = makeProject("vB", ["", ""]);
  const result = calculateNodeShift(project, entries(project));
  assert.equal(result.total, 0);
  assert.match(result.error, /Select a root node/);
  assert.ok(result.entries.every((entry) => entry.calculation_status === "unavailable"));
});
