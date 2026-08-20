"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Focus, ImageOff } from "lucide-react";

import type { EdgeModel, EditMode, GraphKey, GraphModel, NodeModel } from "../types";
import { getBranchMoveContext, getBranchMovePlan, moveBranchPoint } from "../lib/branchMove";
import { newId } from "../lib/project";

export interface GraphCanvasHandle {
  fit: () => void;
  exportPng: () => Promise<string | null>;
}

interface GraphCanvasProps {
  graph: GraphModel;
  graphKey: GraphKey;
  mode: EditMode;
  active: boolean;
  onActivate: () => void;
  onChange: (graph: GraphModel) => void;
  onNotice: (message: string) => void;
}

interface ViewState { x: number; y: number; scale: number }
interface BranchMoveState { nodeId: string; continuationEdgeId: string }
interface BranchPreview { edgeId: string; x: number; y: number }
type DragState =
  | { kind: "node"; id: string; pointerId: number; startX: number; startY: number; originX: number; originY: number }
  | { kind: "background"; pointerId: number; startX: number; startY: number; originX: number; originY: number }
  | { kind: "pan"; pointerId: number; startX: number; startY: number; originX: number; originY: number };

const MIN_SCALE = 0.12;
const MAX_SCALE = 8;

function GraphCanvasComponent(
  { graph, graphKey, mode, active, onActivate, onChange, onNotice }: GraphCanvasProps,
  ref: React.ForwardedRef<GraphCanvasHandle>,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const fittedImageRef = useRef<string>("");
  const [size, setSize] = useState({ width: 640, height: 520 });
  const [view, setView] = useState<ViewState>({ x: 320, y: 260, scale: 1 });
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [branchMove, setBranchMove] = useState<BranchMoveState>({ nodeId: "", continuationEdgeId: "" });
  const [branchPreview, setBranchPreview] = useState<BranchPreview | null>(null);
  const [branchError, setBranchError] = useState("");
  const backgroundLockActive = Boolean(
    graph.background.data_url && graph.background.visible && graph.background.locked,
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: Math.max(280, Math.floor(entry.contentRect.width)),
        height: Math.max(260, Math.floor(entry.contentRect.height)),
      });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setPendingSource(null));
    return () => cancelAnimationFrame(frame);
  }, [mode]);

  const resetBranchMove = useCallback(() => {
    setBranchMove({ nodeId: "", continuationEdgeId: "" });
    setBranchPreview(null);
    setBranchError("");
    setSelectedId(null);
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(resetBranchMove);
    return () => cancelAnimationFrame(frame);
  }, [graphKey, mode, resetBranchMove]);

  useEffect(() => {
    if (mode !== "move_branch") return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") resetBranchMove();
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [mode, resetBranchMove]);

  const branchContext = useMemo(() => branchMove.nodeId
    ? getBranchMoveContext(graph, branchMove.nodeId)
    : null,
  [branchMove.nodeId, graph]);
  const branchPlan = useMemo(() => branchMove.nodeId && branchMove.continuationEdgeId
    ? getBranchMovePlan(graph, branchMove.nodeId, branchMove.continuationEdgeId)
    : null,
  [branchMove.continuationEdgeId, branchMove.nodeId, graph]);

  const bounds = useMemo(() => {
    if (graph.background.data_url && graph.background.width > 0 && graph.background.height > 0) {
      return {
        x: graph.background.x,
        y: graph.background.y,
        width: graph.background.width,
        height: graph.background.height,
      };
    }
    if (graph.nodes.length) {
      const xs = graph.nodes.map((node) => node.x);
      const ys = graph.nodes.map((node) => node.y);
      const minX = Math.min(...xs) - 80;
      const maxX = Math.max(...xs) + 80;
      const minY = Math.min(...ys) - 80;
      const maxY = Math.max(...ys) + 80;
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    return { x: -400, y: -300, width: 800, height: 600 };
  }, [graph.background, graph.nodes]);

  const fit = useCallback(() => {
    const padding = 34;
    const scale = Math.max(
      MIN_SCALE,
      Math.min(MAX_SCALE, Math.min((size.width - padding * 2) / bounds.width, (size.height - padding * 2) / bounds.height)),
    );
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    setView({ x: size.width / 2 - centerX * scale, y: size.height / 2 - centerY * scale, scale });
  }, [bounds, size]);

  useEffect(() => {
    const source = graph.background.data_url || "";
    if (source && fittedImageRef.current !== source) {
      fittedImageRef.current = source;
      requestAnimationFrame(fit);
    }
  }, [fit, graph.background.data_url]);

  useImperativeHandle(ref, () => ({
    fit,
    exportPng: async () => {
      const sourceSvg = svgRef.current;
      if (!sourceSvg) return null;
      const clone = sourceSvg.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("width", String(size.width));
      clone.setAttribute("height", String(size.height));
      const serialized = new XMLSerializer().serializeToString(clone);
      const url = URL.createObjectURL(new Blob([serialized], { type: "image/svg+xml;charset=utf-8" }));
      try {
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("Could not render canvas"));
          image.src = url;
        });
        const canvas = document.createElement("canvas");
        canvas.width = size.width * 2;
        canvas.height = size.height * 2;
        const context = canvas.getContext("2d");
        if (!context) return null;
        context.scale(2, 2);
        context.drawImage(image, 0, 0, size.width, size.height);
        return canvas.toDataURL("image/png");
      } finally {
        URL.revokeObjectURL(url);
      }
    },
  }), [fit, size]);

  const worldPoint = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: (clientX - rect.left - view.x) / view.scale,
      y: (clientY - rect.top - view.y) / view.scale,
    };
  };

  const pointOnEdge = (edge: EdgeModel, clientX: number, clientY: number) => {
    const point = worldPoint(clientX, clientY);
    const source = graph.nodes.find((node) => node.id === edge.source);
    const target = graph.nodes.find((node) => node.id === edge.target);
    if (!point || !source || !target) return null;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const lengthSquared = dx * dx + dy * dy;
    const ratio = lengthSquared
      ? Math.max(0, Math.min(1, ((point.x - source.x) * dx + (point.y - source.y) * dy) / lengthSquared))
      : 0;
    return { x: source.x + dx * ratio, y: source.y + dy * ratio };
  };

  const addNode = (clientX: number, clientY: number) => {
    const point = worldPoint(clientX, clientY);
    if (!point) return;
    const node: NodeModel = {
      id: newId("node"),
      label: `N${graph.nodes.length + 1}`,
      x: point.x,
      y: point.y,
      node_type: "branch_node",
      origin_ref_ids: [],
    };
    onChange({ ...graph, nodes: [...graph.nodes, node] });
    setSelectedId(node.id);
  };

  const nodeAction = (node: NodeModel, event: React.PointerEvent<SVGGElement>) => {
    if (event.button === 1) return;
    event.stopPropagation();
    onActivate();
    if (mode === "move_branch") {
      if (graphKey !== "variant_graph") {
        setBranchError("Move Branch Point is available in Variant Pattern.");
        return;
      }
      const context = getBranchMoveContext(graph, node.id);
      if (context.error) {
        setBranchError(context.error);
        setSelectedId(null);
        return;
      }
      setBranchMove({ nodeId: node.id, continuationEdgeId: "" });
      setBranchPreview(null);
      setBranchError("");
      setSelectedId(node.id);
      return;
    }
    if (mode === "add_edge") {
      if (!pendingSource) {
        setPendingSource(node.id);
        setSelectedId(node.id);
      } else {
        if (pendingSource !== node.id) {
          const duplicate = graph.edges.some((edge) =>
            (edge.source === pendingSource && edge.target === node.id) ||
            (edge.source === node.id && edge.target === pendingSource),
          );
          if (!duplicate) {
            onChange({ ...graph, edges: [...graph.edges, {
              id: newId("edge"), source: pendingSource, target: node.id,
              label: "", edge_type: "branch", origin_ref_ids: [],
            }] });
          }
        }
        setPendingSource(null);
        setSelectedId(null);
      }
      return;
    }
    if (mode === "delete") {
      onChange({
        ...graph,
        nodes: graph.nodes.filter((item) => item.id !== node.id),
        edges: graph.edges.filter((edge) => edge.source !== node.id && edge.target !== node.id),
      });
      setSelectedId(null);
      return;
    }
    if (mode === "rename") {
      const label = window.prompt("Node label", node.label);
      if (label?.trim()) onChange({ ...graph, nodes: graph.nodes.map((item) => item.id === node.id ? { ...item, label: label.trim() } : item) });
      return;
    }
    setSelectedId(node.id);
    dragRef.current = {
      kind: "node", id: node.id, pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY, originX: node.x, originY: node.y,
    };
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const edgeAction = (edge: EdgeModel, event: React.PointerEvent<SVGLineElement>) => {
    if (event.button === 1) return;
    event.stopPropagation();
    onActivate();
    if (mode === "move_branch") {
      if (graphKey !== "variant_graph") {
        setBranchError("Move Branch Point is available in Variant Pattern.");
        return;
      }
      if (!branchMove.nodeId || !branchContext) {
        setBranchError("Select a branch point first.");
        return;
      }
      if (!branchMove.continuationEdgeId) {
        if (!branchContext.continuationEdgeIds.includes(edge.id)) {
          setBranchError("Select one of the orange distal edges.");
          return;
        }
        const plan = getBranchMovePlan(graph, branchMove.nodeId, edge.id);
        if (plan.error) {
          setBranchError(plan.error);
          return;
        }
        setBranchMove((current) => ({ ...current, continuationEdgeId: edge.id }));
        setBranchPreview(null);
        setBranchError("");
        return;
      }
      if (!branchPlan?.eligibleDestinationEdgeIds.includes(edge.id)) {
        setBranchError("Select one of the green destination edges.");
        return;
      }
      const point = pointOnEdge(edge, event.clientX, event.clientY);
      if (!point) return;
      try {
        const movedLabel = graph.nodes.find((node) => node.id === branchMove.nodeId)?.label || "Branch point";
        const next = moveBranchPoint(
          graph,
          branchMove.nodeId,
          branchMove.continuationEdgeId,
          edge.id,
          point,
        );
        resetBranchMove();
        onChange(next);
        onNotice(`${movedLabel} moved; node-shift recalculated`);
      } catch (error) {
        setBranchError(error instanceof Error ? error.message : "Could not move branch point.");
      }
      return;
    }
    if (mode === "delete") {
      onChange({ ...graph, edges: graph.edges.filter((item) => item.id !== edge.id) });
      setSelectedId(null);
    } else if (mode === "rename") {
      const label = window.prompt("Edge label", edge.label);
      if (label !== null) onChange({ ...graph, edges: graph.edges.map((item) => item.id === edge.id ? { ...item, label: label.trim() } : item) });
    } else if (mode === "select") {
      setSelectedId(edge.id);
    }
  };

  const edgePreview = (edge: EdgeModel, event: React.PointerEvent<SVGLineElement>) => {
    if (
      mode !== "move_branch"
      || graphKey !== "variant_graph"
      || !branchPlan?.eligibleDestinationEdgeIds.includes(edge.id)
    ) return;
    const point = pointOnEdge(edge, event.clientX, event.clientY);
    if (point) setBranchPreview({ edgeId: edge.id, ...point });
  };

  const rootPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    onActivate();
    if (event.button === 1) {
      event.preventDefault();
      if (backgroundLockActive) return;
      dragRef.current = {
        kind: "pan", pointerId: event.pointerId,
        startX: event.clientX, startY: event.clientY, originX: view.x, originY: view.y,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    if (mode === "add_node") addNode(event.clientX, event.clientY);
    else if (mode === "select") setSelectedId(null);
  };

  const backgroundPointerDown = (event: React.PointerEvent<SVGImageElement>) => {
    if (event.button !== 0 || mode !== "select" || graph.background.locked) return;
    event.stopPropagation();
    onActivate();
    dragRef.current = {
      kind: "background", pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY,
      originX: graph.background.x, originY: graph.background.y,
    };
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const pointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (backgroundLockActive && (drag.kind === "pan" || drag.kind === "background")) {
      dragRef.current = null;
      return;
    }
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (drag.kind === "pan") {
      setView((current) => ({ ...current, x: drag.originX + dx, y: drag.originY + dy }));
    } else if (drag.kind === "background") {
      onChange({ ...graph, background: { ...graph.background, x: drag.originX + dx / view.scale, y: drag.originY + dy / view.scale } });
    } else {
      onChange({
        ...graph,
        nodes: graph.nodes.map((node) => node.id === drag.id
          ? { ...node, x: drag.originX + dx / view.scale, y: drag.originY + dy / view.scale }
          : node),
      });
    }
  };

  const pointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const zoom = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    if (backgroundLockActive) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const oldScale = view.scale;
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, event.deltaY < 0 ? oldScale * 1.12 : oldScale / 1.12));
    const world = { x: (pointer.x - view.x) / oldScale, y: (pointer.y - view.y) / oldScale };
    setView({ x: pointer.x - world.x * scale, y: pointer.y - world.y * scale, scale });
  };

  const branchEdgeRole = (edgeId: string) => {
    if (mode !== "move_branch" || graphKey !== "variant_graph" || !branchContext) return "";
    if (edgeId === branchContext.parentEdgeId) return "cut";
    if (!branchMove.continuationEdgeId && branchContext.continuationEdgeIds.includes(edgeId)) return "candidate";
    if (edgeId === branchMove.continuationEdgeId) return "cut";
    if (branchPlan?.retainedEdgeIds.includes(edgeId)) return "retained";
    if (branchPlan?.eligibleDestinationEdgeIds.includes(edgeId)) return "destination";
    return "";
  };

  const previewGeometry = (() => {
    if (!branchPreview || !branchPlan) return null;
    const destination = graph.edges.find((edge) => edge.id === branchPreview.edgeId);
    const parentEdge = graph.edges.find((edge) => edge.id === branchPlan.parentEdgeId);
    const continuation = graph.edges.find((edge) => edge.id === branchPlan.continuationEdgeId);
    if (!destination || !parentEdge || !continuation) return null;
    const neighbor = (edge: EdgeModel) => graph.nodes.find((node) =>
      node.id === (edge.source === branchPlan.nodeId ? edge.target : edge.source),
    );
    const parentNeighbor = neighbor(parentEdge);
    const continuationNeighbor = neighbor(continuation);
    const destinationSource = graph.nodes.find((node) => node.id === destination.source);
    const destinationTarget = graph.nodes.find((node) => node.id === destination.target);
    if (!parentNeighbor || !continuationNeighbor || !destinationSource || !destinationTarget) return null;
    const retainedNeighbors = branchPlan.retainedEdgeIds.flatMap((edgeId) => {
      const edge = graph.edges.find((item) => item.id === edgeId);
      const node = edge ? neighbor(edge) : null;
      return node ? [node] : [];
    });
    return { parentNeighbor, continuationNeighbor, destinationSource, destinationTarget, retainedNeighbors };
  })();

  const branchInstruction = graphKey !== "variant_graph"
    ? "Move Branch Point is available in Variant Pattern."
    : branchError
      || (!graph.root_node_id
        ? "Select the Variant root node in the inspector."
        : !branchMove.nodeId
          ? "1  Select a branch point"
          : !branchMove.continuationEdgeId
            ? "2  Select the orange distal continuation edge"
            : "3  Click a green destination edge");

  return (
    <section className={active ? "canvas-panel active-canvas" : "canvas-panel"} data-testid={`${graphKey}-canvas`}>
      <div className="canvas-heading">
        <div>
          <span className="canvas-kicker">{graphKey === "standard_graph" ? "REFERENCE" : "COMPARISON"}</span>
          <h2>{graph.name}</h2>
        </div>
        <div className="canvas-heading-actions">
          {!graph.background.data_url && graph.background.image_name && <span className="missing-image"><ImageOff size={13} /> Missing image</span>}
          <span className="node-count">{graph.nodes.length} nodes · {graph.edges.length} edges</span>
          <button className="canvas-icon-button" onClick={fit} title="Fit canvas" type="button"><Focus size={16} /></button>
        </div>
      </div>
      <div className="canvas-surface" ref={containerRef} onPointerDown={onActivate}>
        <svg
          ref={svgRef}
          className="canvas-svg"
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
          onPointerDown={rootPointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={pointerUp}
          onWheel={zoom}
        >
          <rect width={size.width} height={size.height} fill="#fbfcfc" />
          <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
            {graph.background.data_url && graph.background.visible && (
              <image
                href={graph.background.data_url}
                x={graph.background.x}
                y={graph.background.y}
                width={graph.background.width}
                height={graph.background.height}
                opacity={graph.background.opacity}
                preserveAspectRatio="none"
                onPointerDown={backgroundPointerDown}
                style={{ cursor: mode === "select" && !graph.background.locked ? "move" : "default" }}
              />
            )}
            {graph.edges.map((edge) => {
              const source = graph.nodes.find((node) => node.id === edge.source);
              const target = graph.nodes.find((node) => node.id === edge.target);
              if (!source || !target) return null;
              const selected = selectedId === edge.id;
              const role = branchEdgeRole(edge.id);
              const roleStroke = role === "cut" ? "#d94841"
                : role === "candidate" ? "#d97706"
                  : role === "retained" ? "#0891b2"
                    : role === "destination" ? "#2e8b57"
                      : "";
              return (
                <g key={edge.id} data-edge-id={edge.id}>
                  <line
                    x1={source.x} y1={source.y} x2={target.x} y2={target.y}
                    stroke={roleStroke || (selected ? "#d97706" : "#243b53")}
                    strokeWidth={role ? 4 : selected ? 4 : 3}
                    strokeDasharray={role === "cut" || role === "candidate" ? "7 5" : undefined}
                    vectorEffect="non-scaling-stroke"
                    className="graph-edge"
                    onPointerDown={(event) => edgeAction(edge, event)}
                  />
                  <line
                    x1={source.x} y1={source.y} x2={target.x} y2={target.y}
                    stroke="transparent"
                    strokeWidth={16 / view.scale}
                    className="edge-hit-area"
                    onPointerDown={(event) => edgeAction(edge, event)}
                    onPointerMove={(event) => edgePreview(edge, event)}
                    onPointerLeave={() => {
                      if (branchPreview?.edgeId === edge.id) setBranchPreview(null);
                    }}
                    style={{ cursor: role === "destination" ? "crosshair" : "pointer" }}
                  />
                  {edge.label && (
                    <text
                      x={(source.x + target.x) / 2 + 6 / view.scale}
                      y={(source.y + target.y) / 2 + 4 / view.scale}
                      fontSize={12 / view.scale}
                      fontWeight={700}
                      fill="#102a43"
                      stroke="white"
                      strokeWidth={3 / view.scale}
                      paintOrder="stroke"
                      pointerEvents="none"
                    >{edge.label}</text>
                  )}
                </g>
              );
            })}
            {previewGeometry && branchPreview && (
              <g pointerEvents="none" opacity={0.9}>
                <line
                  x1={previewGeometry.parentNeighbor.x}
                  y1={previewGeometry.parentNeighbor.y}
                  x2={previewGeometry.continuationNeighbor.x}
                  y2={previewGeometry.continuationNeighbor.y}
                  stroke="#d94841"
                  strokeWidth={3}
                  strokeDasharray="7 5"
                  vectorEffect="non-scaling-stroke"
                />
                <line x1={previewGeometry.destinationSource.x} y1={previewGeometry.destinationSource.y} x2={branchPreview.x} y2={branchPreview.y} stroke="#2e8b57" strokeWidth={3} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
                <line x1={branchPreview.x} y1={branchPreview.y} x2={previewGeometry.destinationTarget.x} y2={previewGeometry.destinationTarget.y} stroke="#2e8b57" strokeWidth={3} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
                {previewGeometry.retainedNeighbors.map((node) => (
                  <line key={node.id} x1={branchPreview.x} y1={branchPreview.y} x2={node.x} y2={node.y} stroke="#0891b2" strokeWidth={3} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
                ))}
                <circle r={11 / view.scale} cx={branchPreview.x} cy={branchPreview.y} fill="#fff" stroke="#2e8b57" strokeWidth={3 / view.scale} />
              </g>
            )}
            {graph.nodes.map((node) => {
              const selected = selectedId === node.id || pendingSource === node.id;
              const rootNode = graph.root_node_id === node.id;
              return (
                <g
                  key={node.id}
                  data-node-id={node.id}
                  transform={`translate(${node.x} ${node.y})`}
                  className="graph-node"
                  onPointerDown={(event) => nodeAction(node, event)}
                >
                  {rootNode && (
                    <circle
                      r={15 / view.scale}
                      fill="none"
                      stroke="#d97706"
                      strokeWidth={2 / view.scale}
                      strokeDasharray={`${4 / view.scale} ${3 / view.scale}`}
                      pointerEvents="none"
                    />
                  )}
                  <circle
                    r={10 / view.scale}
                    fill={selected ? "#ffb000" : "#00b8d9"}
                    stroke={selected ? "#9a3412" : "#083344"}
                    strokeWidth={(selected ? 3 : 2) / view.scale}
                  />
                  <text
                    x={15 / view.scale}
                    y={4 / view.scale}
                    fontSize={12 / view.scale}
                    fontWeight={700}
                    fill="#102a43"
                    stroke="white"
                    strokeWidth={3 / view.scale}
                    paintOrder="stroke"
                    pointerEvents="none"
                  >{node.label}</text>
                </g>
              );
            })}
          </g>
        </svg>
        {!graph.background.data_url && graph.nodes.length === 0 && <div className="canvas-empty-copy">Empty canvas</div>}
        {mode === "move_branch" && (graphKey === "variant_graph" || active) && (
          <div className={branchError ? "branch-move-guide error" : "branch-move-guide"}>
            <div><span>MOVE BRANCH POINT</span><strong>{branchInstruction}</strong></div>
            {branchMove.nodeId && <button type="button" onClick={resetBranchMove}>Cancel</button>}
          </div>
        )}
        <div className="zoom-readout">{Math.round(view.scale * 100)}%</div>
      </div>
    </section>
  );
}

export const GraphCanvas = forwardRef(GraphCanvasComponent);
