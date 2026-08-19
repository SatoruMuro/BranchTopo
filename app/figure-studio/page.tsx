"use client";

import {
  ArrowLeft,
  Download,
  FileImage,
  FileUp,
  GitBranch,
  Grid3X3,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { StudioFigure, type FigureMode } from "../components/StudioFigure";
import { exportBaseName } from "../lib/filenames";
import { normalizeProject } from "../lib/project";
import {
  displayStructure,
  displayType,
  naturalCompare,
  standardSignature,
  type FigureRecord,
} from "../lib/studio";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function serializedSvg(svg: SVGSVGElement): { body: string; width: number; height: number } {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const viewBox = svg.viewBox.baseVal;
  const width = Math.max(1, viewBox.width || svg.width.baseVal.value);
  const height = Math.max(1, viewBox.height || svg.height.baseVal.value);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  return { body: new XMLSerializer().serializeToString(clone), width, height };
}

export default function FigureStudio() {
  const [records, setRecords] = useState<FigureRecord[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [selectedStructure, setSelectedStructure] = useState("");
  const [mode, setMode] = useState<FigureMode>("atlas");
  const [columns, setColumns] = useState(3);
  const [notice, setNotice] = useState("No datasets loaded");
  const fileInput = useRef<HTMLInputElement>(null);
  const figureRef = useRef<SVGSVGElement>(null);

  const structures = useMemo(() =>
    Array.from(new Set(records.map((record) => record.structureName))).sort(naturalCompare),
  [records]);
  const activeStructure = structures.includes(selectedStructure)
    ? selectedStructure
    : (structures[0] || "");
  const visibleRecords = useMemo(() => records
    .filter((record) => record.structureName === activeStructure)
    .sort((left, right) => naturalCompare(left.typeName, right.typeName)),
  [activeStructure, records]);
  const incompatibleCount = useMemo(() => {
    if (!visibleRecords.length) return 0;
    const reference = standardSignature(visibleRecords[0].project.standard_graph);
    return visibleRecords.filter((record) => standardSignature(record.project.standard_graph) !== reference).length;
  }, [visibleRecords]);

  const loadFiles = async (files: FileList) => {
    const next: FigureRecord[] = [];
    const failures: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const project = normalizeProject(JSON.parse(await file.text()));
        next.push({
          id: crypto.randomUUID(),
          fileName: file.name,
          structureName: displayStructure(project),
          typeName: displayType(project, file.name),
          project,
        });
      } catch (error) {
        failures.push(`${file.name}: ${error instanceof Error ? error.message : "Invalid project"}`);
      }
    }
    setRecords((current) => [...current, ...next]);
    setErrors(failures);
    setNotice(`${next.length} dataset${next.length === 1 ? "" : "s"} loaded`);
  };

  const clearAll = () => {
    if (!records.length || !window.confirm("Remove all loaded datasets from Figure Studio?")) return;
    setRecords([]);
    setErrors([]);
    setNotice("Datasets cleared");
  };

  const figureBaseName = () => {
    const structure = exportBaseName(activeStructure, "structure");
    return `${structure}_${mode === "atlas" ? "topology_atlas" : "node_shift_heatmap"}`;
  };

  const exportSvg = () => {
    if (!figureRef.current) return;
    const { body } = serializedSvg(figureRef.current);
    downloadBlob(new Blob([body], { type: "image/svg+xml;charset=utf-8" }), `${figureBaseName()}.svg`);
    setNotice("SVG export started");
  };

  const exportPng = async () => {
    if (!figureRef.current) return;
    const { body, width, height } = serializedSvg(figureRef.current);
    const url = URL.createObjectURL(new Blob([body], { type: "image/svg+xml;charset=utf-8" }));
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Could not render figure"));
        image.src = url;
      });
      const scale = Math.max(1, Math.min(3, 12000 / width, 12000 / height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.scale(scale, scale);
      context.drawImage(image, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Could not encode PNG");
      downloadBlob(blob, `${figureBaseName()}.png`);
      setNotice(`PNG export started (${scale.toFixed(1)}x)`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "PNG export failed");
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  return (
    <main className="studio-shell">
      <header className="studio-header">
        <div className="brand-block">
          <Link className="studio-back-button" href="/" title="Back to BranchTopo"><ArrowLeft size={18} /></Link>
          <div className="brand-mark"><GitBranch size={19} /></div>
          <div><h1>BranchTopo Figure Studio</h1><p>Publication figure workspace</p></div>
        </div>
        <div className="header-status"><span className="status-dot" />Local session</div>
      </header>

      <div className="studio-command-bar" aria-label="Figure controls">
        <button className="tool-button" type="button" onClick={() => fileInput.current?.click()}><FileUp size={17} /><span>Import JSON</span></button>
        <input
          ref={fileInput}
          className="visually-hidden"
          type="file"
          accept="application/json,.json"
          multiple
          onChange={(event) => { if (event.target.files?.length) void loadFiles(event.target.files); event.target.value = ""; }}
        />
        <button className="icon-button" type="button" title="Clear loaded datasets" disabled={!records.length} onClick={clearAll}><Trash2 size={17} /></button>
        <div className="command-divider" />
        <label className="studio-inline-field">Structure
          <select value={activeStructure} disabled={!structures.length} onChange={(event) => setSelectedStructure(event.target.value)}>
            {!structures.length && <option value="">None</option>}
            {structures.map((structure) => <option value={structure} key={structure}>{structure}</option>)}
          </select>
        </label>
        <div className="studio-segmented" aria-label="Figure view">
          <button className={mode === "atlas" ? "active" : ""} type="button" onClick={() => setMode("atlas")}><Grid3X3 size={15} />Atlas</button>
          <button className={mode === "heatmap" ? "active" : ""} type="button" onClick={() => setMode("heatmap")}><Table2 size={15} />Heatmap</button>
        </div>
        {mode === "atlas" && (
          <label className="studio-inline-field compact">Columns
            <select value={columns} onChange={(event) => setColumns(Number(event.target.value))}>
              {[2, 3, 4, 5].map((value) => <option value={value} key={value}>{value}</option>)}
            </select>
          </label>
        )}
        <div className="command-spacer" />
        <button className="tool-button" type="button" disabled={!visibleRecords.length} onClick={exportSvg}><Download size={17} /><span>SVG</span></button>
        <button className="tool-button" type="button" disabled={!visibleRecords.length} onClick={() => void exportPng()}><FileImage size={17} /><span>PNG</span></button>
      </div>

      <div className="studio-workspace">
        <aside className="studio-datasets">
          <div className="studio-panel-heading"><span>DATASETS</span><strong>{records.length}</strong></div>
          <div className="studio-dataset-list">
            {records.map((record) => (
              <div className={record.structureName === activeStructure ? "studio-dataset active" : "studio-dataset"} key={record.id}>
                <button className="studio-dataset-main" type="button" onClick={() => setSelectedStructure(record.structureName)}>
                  <strong>{record.typeName}</strong>
                  <span>{record.structureName} - score {record.project.score.total_node_shift}</span>
                </button>
                <button className="studio-remove" type="button" title={`Remove ${record.typeName}`} onClick={() => setRecords((current) => current.filter((item) => item.id !== record.id))}><X size={14} /></button>
              </div>
            ))}
            {!records.length && <div className="studio-empty-list">No JSON datasets</div>}
          </div>
          {errors.length > 0 && <div className="studio-errors">{errors.map((error) => <div key={error}>{error}</div>)}</div>}
        </aside>

        <section className="studio-stage">
          {visibleRecords.length ? (
            <>
              {incompatibleCount > 0 && <div className="studio-warning">{incompatibleCount} dataset{incompatibleCount === 1 ? " has" : "s have"} a different Standard topology.</div>}
              <div className="studio-figure-scroll">
                <StudioFigure ref={figureRef} records={visibleRecords} mode={mode} columns={columns} structureName={activeStructure} />
              </div>
            </>
          ) : (
            <div className="studio-empty-stage"><FileUp size={28} /><strong>Import BranchTopo JSON files</strong></div>
          )}
        </section>
      </div>

      <footer className="status-bar"><span>{mode.toUpperCase()}</span><span>{notice}</span><span>{visibleRecords.length} visible</span><span>{incompatibleCount ? `${incompatibleCount} mismatch` : "Standards aligned"}</span></footer>
    </main>
  );
}
