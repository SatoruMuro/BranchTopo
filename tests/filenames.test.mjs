import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../app/lib/filenames.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { exportBaseName, projectFileNames } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("keeps a simple variant name", () => {
  assert.equal(exportBaseName("Type3"), "Type3");
});

test("normalizes unsafe filename characters", () => {
  assert.equal(exportBaseName(" Type 3:case? "), "Type_3_case_");
});

test("uses a fallback and avoids Windows reserved names", () => {
  assert.equal(exportBaseName("  "), "branchtopo");
  assert.equal(exportBaseName("CON"), "_CON");
});

test("combines structure and type names for all exports", () => {
  assert.deepEqual(projectFileNames("AorticArch", "type3"), {
    variantBase: "AorticArch_type3",
    standardBase: "AorticArch_standard",
  });
});
