import type { BranchTopoProject } from "../types";
import { projectFileNames } from "./filenames";
import { projectForDownload, syncScoreEntries, withUpdatedScore } from "./project";

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadProject(project: BranchTopoProject): void {
  const body = JSON.stringify(projectForDownload(project), null, 2);
  const { variantBase } = projectFileNames(project.structure_name, project.type_name);
  downloadBlob(new Blob([body], { type: "application/json" }), `${variantBase}.json`);
}

const csvValue = (value: string | number): string => `"${String(value).replaceAll('"', '""')}"`;

export function downloadScoreCsv(project: BranchTopoProject): void {
  const scored = withUpdatedScore(project, syncScoreEntries(project));
  const rows = [
    ["standard_node_id", "standard_label", "variant_node_id", "variant_label", "shift_value", "calculation_status", "calculation_message", "notes"],
    ...scored.score.node_shift_entries.map((entry) => [
      entry.standard_node_id,
      entry.standard_label,
      entry.variant_node_id,
      entry.variant_label,
      entry.shift_value,
      entry.calculation_status,
      entry.calculation_message,
      entry.notes,
    ]),
    ["", "TOTAL", "", "", scored.score.total_node_shift, "", "", ""],
  ];
  const csv = rows.map((row) => row.map(csvValue).join(",")).join("\r\n");
  const { variantBase } = projectFileNames(project.structure_name, project.type_name);
  downloadBlob(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }), `${variantBase}.csv`);
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
}
