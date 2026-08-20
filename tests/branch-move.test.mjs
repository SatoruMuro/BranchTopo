import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../app/lib/branchMove.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { getBranchMoveContext, getBranchMovePlan, moveBranchPoint } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const background = {
  path: "", image_name: "", opacity: 0.55, locked: true, visible: true,
  x: 0, y: 0, width: 0, height: 0,
};

function node(id, x, y) {
  return { id, label: id, x, y, node_type: "branch_node", origin_ref_ids: [] };
}

function edge(id, source, target) {
  return { id, source, target, label: "", edge_type: "branch", origin_ref_ids: [] };
}

function graph() {
  return {
    name: "Variant Pattern",
    root_node_id: "R",
    nodes: [
      node("R", 0, 0), node("A", 0, 50), node("B", 0, 100),
      node("C", 0, 150), node("LA", 70, 50), node("LB", 70, 100),
    ],
    edges: [
      edge("RA", "R", "A"), edge("AB", "A", "B"), edge("BC", "B", "C"),
      edge("ALA", "A", "LA"), edge("BLB", "B", "LB"),
    ],
    background,
  };
}

test("identifies the root-side edge and distal candidates", () => {
  const context = getBranchMoveContext(graph(), "A");
  assert.equal(context.error, "");
  assert.equal(context.parentEdgeId, "RA");
  assert.deepEqual(context.continuationEdgeIds.sort(), ["AB", "ALA"]);
});

test("moves a branch point by bypassing and splitting edges", () => {
  const current = graph();
  const plan = getBranchMovePlan(current, "A", "AB");
  assert.equal(plan.error, "");
  assert.ok(plan.retainedEdgeIds.includes("ALA"));
  assert.ok(plan.eligibleDestinationEdgeIds.includes("BC"));
  assert.ok(!plan.eligibleDestinationEdgeIds.includes("ALA"));

  let sequence = 0;
  const moved = moveBranchPoint(current, "A", "AB", "BC", { x: 12, y: 125 }, () => `new${++sequence}`);
  assert.equal(moved.nodes.find((item) => item.id === "A")?.x, 12);
  assert.equal(moved.nodes.find((item) => item.id === "A")?.y, 125);
  assert.equal(moved.edges.length, current.edges.length);
  assert.ok(moved.edges.some((item) => [item.source, item.target].includes("R") && [item.source, item.target].includes("B")));
  assert.ok(moved.edges.some((item) => [item.source, item.target].includes("B") && [item.source, item.target].includes("A")));
  assert.ok(moved.edges.some((item) => [item.source, item.target].includes("A") && [item.source, item.target].includes("C")));
  assert.ok(moved.edges.some((item) => item.id === "ALA"));
  assert.ok(!moved.edges.some((item) => item.id === "RA" || item.id === "AB" || item.id === "BC"));
});

test("rejects a destination inside the branch carried with the node", () => {
  assert.throws(
    () => moveBranchPoint(graph(), "A", "AB", "ALA", { x: 50, y: 50 }, () => "unused"),
    /highlighted destination edge/,
  );
});
