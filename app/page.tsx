"use client";

import {
  CirclePlus,
  Copy,
  Download,
  FileDown,
  FilePlus2,
  FolderOpen,
  Focus,
  GitBranch,
  ImagePlus,
  Link2,
  Lock,
  MousePointer2,
  Pencil,
  Save,
  TableProperties,
  Trash2,
  Unlock,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { GraphCanvas, type GraphCanvasHandle } from "./components/GraphCanvas";
import { ScoringDialog } from "./components/ScoringDialog";
import { downloadDataUrl, downloadProject, downloadScoreCsv } from "./lib/downloads";
import { projectFileNames } from "./lib/filenames";
import {
  copyStandardToVariant,
  createProject,
  normalizeProject,
  syncScoreEntries,
  withUpdatedScore,
} from "./lib/project";
import { loadLocalProject, saveLocalProject } from "./lib/storage";
import type { BranchTopoProject, EditMode, GraphKey, GraphModel } from "./types";

const modeTools: Array<{ mode: EditMode; label: string; icon: typeof MousePointer2 }> = [
  { mode: "select", label: "Select / Move", icon: MousePointer2 },
  { mode: "add_node", label: "Add Node", icon: CirclePlus },
  { mode: "add_edge", label: "Add Edge", icon: Link2 },
  { mode: "delete", label: "Delete", icon: Trash2 },
  { mode: "rename", label: "Rename", icon: Pencil },
];

const modeLabel: Record<EditMode, string> = {
  select: "SELECT / MOVE",
  add_node: "ADD NODE",
  add_edge: "ADD EDGE",
  delete: "DELETE",
  rename: "RENAME",
};

export default function Home() {
  const [project, setProject] = useState<BranchTopoProject>(() => createProject());
  const [mode, setMode] = useState<EditMode>("select");
  const [activeGraph, setActiveGraph] = useState<GraphKey>("standard_graph");
  const [scoreOpen, setScoreOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [notice, setNotice] = useState("Local project");
  const backgroundInput = useRef<HTMLInputElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const standardCanvas = useRef<GraphCanvasHandle>(null);
  const variantCanvas = useRef<GraphCanvasHandle>(null);

  useEffect(() => {
    loadLocalProject()
      .then((saved) => { if (saved) setProject(saved); })
      .catch(() => setSaveState("error"))
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      setSaveState("saving");
      saveLocalProject(project).then(() => setSaveState("saved")).catch(() => setSaveState("error"));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [hydrated, project]);

  const activeModel = project[activeGraph];
  const activeCanvas = activeGraph === "standard_graph" ? standardCanvas : variantCanvas;
  const total = project.score.node_shift_entries.reduce((sum, entry) => sum + entry.shift_value, 0);

  const updateGraph = (key: GraphKey, graph: GraphModel) => {
    setProject((current) => withUpdatedScore({ ...current, [key]: graph }));
  };

  const updateActiveBackground = (patch: Partial<GraphModel["background"]>) => {
    setProject((current) => {
      const graph = current[activeGraph];
      return { ...current, [activeGraph]: { ...graph, background: { ...graph.background, ...patch } } };
    });
  };

  const updateActiveRoot = (rootNodeId: string) => {
    setProject((current) => {
      const next: BranchTopoProject = {
        ...current,
        [activeGraph]: { ...current[activeGraph], root_node_id: rootNodeId },
      };
      if (activeGraph === "standard_graph") {
        const variantRoot = current.variant_graph.nodes.find((node) =>
          node.origin_ref_ids.includes(rootNodeId),
        );
        if (variantRoot) {
          next.variant_graph = { ...current.variant_graph, root_node_id: variantRoot.id };
        }
      }
      return withUpdatedScore(next, syncScoreEntries(next));
    });
  };

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice("Local project"), 2400);
  };

  const loadBackground = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const image = new Image();
      image.onload = () => {
        setProject((current) => {
          const graph = current[activeGraph];
          return {
            ...current,
            [activeGraph]: {
              ...graph,
              background: {
                path: file.name,
                image_name: file.name,
                opacity: 0.55,
                locked: true,
                visible: true,
                x: -image.naturalWidth / 2,
                y: -image.naturalHeight / 2,
                width: image.naturalWidth,
                height: image.naturalHeight,
                data_url: dataUrl,
              },
            },
          };
        });
        showNotice(`Loaded ${file.name}`);
      };
      image.onerror = () => showNotice("Could not load image");
      image.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const openScoring = () => {
    setProject((current) => withUpdatedScore(current, syncScoreEntries(current)));
    setScoreOpen(true);
  };

  const copyGraph = () => {
    if (
      (project.variant_graph.nodes.length || project.variant_graph.edges.length) &&
      !window.confirm("Replace the current variant graph with a copy of the standard graph?")
    ) return;
    setProject((current) => copyStandardToVariant(current));
    setActiveGraph("variant_graph");
    showNotice("Standard graph copied to variant");
  };

  const newProject = () => {
    if (!window.confirm("Clear the current project and start a new one? Export JSON first if you need a backup.")) return;
    setProject(createProject());
    setActiveGraph("standard_graph");
    setMode("select");
    setScoreOpen(false);
    showNotice("New project created");
  };

  const loadProjectFile = async (file: File) => {
    try {
      const parsed = normalizeProject(JSON.parse(await file.text()));
      setProject(parsed);
      setActiveGraph("standard_graph");
      setMode("select");
      showNotice("Project loaded");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Could not load project");
    }
  };

  const exportPng = async () => {
    const [standard, variant] = await Promise.all([
      standardCanvas.current?.exportPng(),
      variantCanvas.current?.exportPng(),
    ]);
    const names = projectFileNames(project.structure_name, project.type_name);
    if (standard) downloadDataUrl(standard, `${names.standardBase}.png`);
    if (variant) window.setTimeout(() => downloadDataUrl(variant, `${names.variantBase}.png`), 250);
    showNotice("PNG export started");
  };

  const statusText = useMemo(() => {
    if (saveState === "saving") return "Saving locally";
    if (saveState === "error") return "Local save failed";
    return "Saved locally";
  }, [saveState]);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <div className="brand-mark"><GitBranch size={19} /></div>
          <div><h1>BranchTopo</h1><p>Anatomical branch scoring</p></div>
        </div>
        <div className={`header-status ${saveState === "error" ? "save-error" : ""}`}>
          <span className="status-dot" />{statusText}
        </div>
      </header>

      <div className="command-bar" aria-label="Graph tools">
        <button className="tool-button" title="Load background image" type="button" onClick={() => backgroundInput.current?.click()}><ImagePlus size={17} /><span>Background</span></button>
        <div className="command-divider" />
        <div className="tool-group">
          {modeTools.map(({ mode: toolMode, label, icon: Icon }) => (
            <button
              className={mode === toolMode ? "tool-button active" : "tool-button"}
              key={toolMode}
              type="button"
              title={label}
              onClick={() => setMode(toolMode)}
            ><Icon size={17} /><span>{label}</span></button>
          ))}
        </div>
        <div className="command-divider" />
        <button className="tool-button" title="Copy standard to variant" type="button" onClick={copyGraph}><Copy size={17} /><span>Copy to Variant</span></button>
        <button className="tool-button" title="Open scoring table" type="button" onClick={openScoring}><TableProperties size={17} /><span>Scoring</span></button>
        <div className="command-spacer" />
        <button className="icon-button" title="New project" type="button" onClick={newProject}><FilePlus2 size={18} /></button>
        <button className="icon-button" title="Load project" type="button" onClick={() => projectInput.current?.click()}><FolderOpen size={18} /></button>
        <button className="icon-button" title="Save project JSON" type="button" onClick={() => { downloadProject(project); showNotice("Project JSON saved"); }}><Save size={18} /></button>
        <button className="icon-button" title="Export scoring CSV" type="button" onClick={() => { downloadScoreCsv(project); showNotice("CSV export started"); }}><FileDown size={18} /></button>
        <button className="icon-button" title="Export both canvases as PNG" type="button" onClick={() => void exportPng()}><Download size={18} /></button>
        <input
          ref={backgroundInput}
          className="visually-hidden"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/bmp,image/tiff"
          onChange={(event) => { const file = event.target.files?.[0]; if (file) loadBackground(file); event.target.value = ""; }}
        />
        <input
          ref={projectInput}
          className="visually-hidden"
          type="file"
          accept="application/json,.json"
          onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadProjectFile(file); event.target.value = ""; }}
        />
      </div>

      <div className="workspace-with-inspector">
        <div className="workspace">
          <GraphCanvas
            ref={standardCanvas}
            graph={project.standard_graph}
            graphKey="standard_graph"
            mode={mode}
            active={activeGraph === "standard_graph"}
            onActivate={() => setActiveGraph("standard_graph")}
            onChange={(graph) => updateGraph("standard_graph", graph)}
          />
          <GraphCanvas
            ref={variantCanvas}
            graph={project.variant_graph}
            graphKey="variant_graph"
            mode={mode}
            active={activeGraph === "variant_graph"}
            onActivate={() => setActiveGraph("variant_graph")}
            onChange={(graph) => updateGraph("variant_graph", graph)}
          />
        </div>

        <aside className="inspector">
          <div className="project-export-section">
            <label htmlFor="structure-name">Structure name</label>
            <input
              id="structure-name"
              type="text"
              maxLength={80}
              value={project.structure_name}
              placeholder="AorticArch"
              onChange={(event) => setProject((current) => ({ ...current, structure_name: event.target.value }))}
            />
            <label htmlFor="type-name">Type</label>
            <input
              id="type-name"
              type="text"
              maxLength={80}
              value={project.type_name}
              placeholder="type3"
              onChange={(event) => setProject((current) => ({ ...current, type_name: event.target.value }))}
            />
            <span>{projectFileNames(project.structure_name, project.type_name).variantBase}.json / .csv / .png<br />{projectFileNames(project.structure_name, project.type_name).standardBase}.png</span>
          </div>
          <div className="inspector-heading"><span>CANVAS</span><strong>{activeModel.name}</strong></div>
          <div className="inspector-section">
            <label className="root-field" htmlFor="root-node">
              <span>Root node</span>
              <select
                id="root-node"
                value={activeModel.root_node_id}
                disabled={!activeModel.nodes.length}
                onChange={(event) => updateActiveRoot(event.target.value)}
              >
                <option value="">Not selected</option>
                {activeModel.nodes.map((node) => <option value={node.id} key={node.id}>{node.label}</option>)}
              </select>
            </label>
            <label className="field-label" htmlFor="background-opacity">Background opacity <span>{Math.round(activeModel.background.opacity * 100)}%</span></label>
            <input
              id="background-opacity"
              type="range"
              min={0}
              max={100}
              value={Math.round(activeModel.background.opacity * 100)}
              disabled={!activeModel.background.data_url}
              onChange={(event) => updateActiveBackground({ opacity: Number(event.target.value) / 100 })}
            />
            <button
              className="setting-button"
              type="button"
              disabled={!activeModel.background.data_url}
              onClick={() => updateActiveBackground({ locked: !activeModel.background.locked })}
            >{activeModel.background.locked ? <Lock size={15} /> : <Unlock size={15} />}<span>{activeModel.background.locked ? "Background locked" : "Background unlocked"}</span></button>
            <button className="setting-button" type="button" onClick={() => activeCanvas.current?.fit()}><Focus size={15} /><span>Fit active canvas</span></button>
          </div>
          <div className="inspector-section inspector-summary">
            <div><span>Background</span><strong title={activeModel.background.image_name}>{activeModel.background.image_name || "None"}</strong></div>
            <div><span>Nodes</span><strong>{activeModel.nodes.length}</strong></div>
            <div><span>Edges</span><strong>{activeModel.edges.length}</strong></div>
            <div><span>Root</span><strong>{activeModel.nodes.find((node) => node.id === activeModel.root_node_id)?.label || "Not selected"}</strong></div>
          </div>
          <div className="inspector-spacer" />
          <div className="score-summary"><span>NODE-SHIFT TOTAL</span><strong>{total}</strong><button type="button" onClick={openScoring}>Open table</button></div>
        </aside>
      </div>

      <footer className="status-bar">
        <span>{modeLabel[mode]}</span><span>{notice}</span><span>{activeModel.name}</span><span>Node-shift total: {total}</span>
      </footer>

      {scoreOpen && <ScoringDialog project={project} onChange={setProject} onClose={() => setScoreOpen(false)} />}
    </main>
  );
}
