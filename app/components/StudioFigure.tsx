"use client";

import { forwardRef, useMemo } from "react";

import type { FigureRecord } from "../lib/studio";
import { heatmapLabels, layoutRootedGraph } from "../lib/studio";
import type { GraphModel, NodeShiftEntry } from "../types";

export type FigureMode = "atlas" | "heatmap";

interface StudioFigureProps {
  records: FigureRecord[];
  mode: FigureMode;
  columns: number;
  structureName: string;
}

type FigureSvgRef = React.ForwardedRef<SVGSVGElement>;

interface GraphPanel {
  key: string;
  title: string;
  subtitle: string;
  graph: GraphModel;
  shifts: Map<string, NodeShiftEntry>;
}

function nodeFill(entry: NodeShiftEntry | undefined, rootNode: boolean): string {
  if (rootNode) return "#153b44";
  if (!entry || entry.shift_value === 0) return "#12a7bd";
  if (entry.shift_value === 1) return "#f59e0b";
  return "#d94841";
}

function AtlasFigure({ records, columns, structureName, svgRef }: Omit<StudioFigureProps, "mode"> & { svgRef: FigureSvgRef }) {
  const panels = useMemo<GraphPanel[]>(() => {
    if (!records.length) return [];
    const first = records[0];
    return [
      {
        key: "standard",
        title: "Standard",
        subtitle: "Node-shift 0",
        graph: first.project.standard_graph,
        shifts: new Map(),
      },
      ...records.map((record) => ({
        key: record.id,
        title: record.typeName,
        subtitle: `Node-shift ${record.project.score.total_node_shift}`,
        graph: record.project.variant_graph,
        shifts: new Map(record.project.score.node_shift_entries.map((entry) => [entry.variant_node_id, entry])),
      })),
    ];
  }, [records]);
  const panelWidth = 286;
  const panelHeight = 270;
  const gap = 14;
  const safeColumns = Math.max(1, Math.min(columns, panels.length || 1));
  const rows = Math.ceil(panels.length / safeColumns);
  const width = 36 + safeColumns * panelWidth + (safeColumns - 1) * gap;
  const height = 66 + rows * panelHeight + Math.max(0, rows - 1) * gap + 24;

  return (
    <svg ref={svgRef} className="publication-figure" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-label="Topology atlas">
      <rect width={width} height={height} fill="#ffffff" />
      <text x={18} y={27} fill="#17202a" fontSize={18} fontWeight={700}>{structureName} topology atlas</text>
      <text x={18} y={47} fill="#66727f" fontSize={10}>{records.length} variant{records.length === 1 ? "" : "s"}</text>
      {panels.map((panel, index) => {
        const column = index % safeColumns;
        const row = Math.floor(index / safeColumns);
        const x = 18 + column * (panelWidth + gap);
        const y = 62 + row * (panelHeight + gap);
        const layout = layoutRootedGraph(panel.graph, panelWidth - 18, panelHeight - 54);
        const positions = new Map(layout.nodes.map((node) => [node.id, node]));
        return (
          <g key={panel.key} transform={`translate(${x} ${y})`}>
            <rect width={panelWidth} height={panelHeight} rx={4} fill="#fbfcfc" stroke="#cfd6dc" />
            <text x={12} y={20} fill="#17202a" fontSize={12} fontWeight={700}>{panel.title}</text>
            <text x={panelWidth - 12} y={20} fill="#66727f" fontSize={9} textAnchor="end">{panel.subtitle}</text>
            <line x1={10} y1={31} x2={panelWidth - 10} y2={31} stroke="#e1e6e9" />
            {layout.error ? (
              <text x={panelWidth / 2} y={panelHeight / 2} textAnchor="middle" fill="#b42318" fontSize={11}>{layout.error}</text>
            ) : (
              <g transform="translate(9 39)">
                {layout.edges.map((edge) => {
                  const source = positions.get(edge.source);
                  const target = positions.get(edge.target);
                  return source && target ? <line key={`${edge.source}-${edge.target}`} x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke="#82919c" strokeWidth={1.6} /> : null;
                })}
                {layout.nodes.map((node) => {
                  const entry = panel.shifts.get(node.id);
                  const shifted = Boolean(entry?.shift_value);
                  return (
                    <g key={node.id} transform={`translate(${node.x} ${node.y})`}>
                      <circle r={shifted ? 7 : 5.5} fill={nodeFill(entry, panel.graph.root_node_id === node.id)} stroke="#ffffff" strokeWidth={1.5} />
                      <text x={9} y={3.5} fill="#24323d" fontSize={9} fontWeight={shifted ? 700 : 500}>{node.label}</text>
                      {shifted && <text x={0} y={-10} fill="#9a3412" fontSize={8} fontWeight={700} textAnchor="middle">+{entry?.shift_value}</text>}
                    </g>
                  );
                })}
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function HeatmapFigure({ records, structureName, svgRef }: Omit<StudioFigureProps, "mode" | "columns"> & { svgRef: FigureSvgRef }) {
  const labels = heatmapLabels(records);
  const rowHeight = 36;
  const cellWidth = 58;
  const labelWidth = 132;
  const top = 88;
  const width = Math.max(520, 36 + labelWidth + (labels.length + 1) * cellWidth + 28);
  const height = Math.max(220, top + records.length * rowHeight + 48);
  const fillFor = (value: number) => value === 0 ? "#eef2f3" : value === 1 ? "#82d2cf" : value === 2 ? "#f6c85f" : "#e36b5d";
  return (
    <svg ref={svgRef} className="publication-figure" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-label="Node-shift heatmap">
      <rect width={width} height={height} fill="#ffffff" />
      <text x={18} y={27} fill="#17202a" fontSize={18} fontWeight={700}>{structureName} node-shift heatmap</text>
      <text x={18} y={47} fill="#66727f" fontSize={10}>{records.length} variant{records.length === 1 ? "" : "s"}</text>
      <text x={18} y={top - 12} fill="#52616c" fontSize={9} fontWeight={700}>TYPE</text>
      {labels.map((label, index) => (
        <text key={label} x={18 + labelWidth + index * cellWidth + cellWidth / 2} y={top - 12} fill="#52616c" fontSize={9} fontWeight={700} textAnchor="middle">{label}</text>
      ))}
      <text x={18 + labelWidth + labels.length * cellWidth + cellWidth / 2} y={top - 12} fill="#153b44" fontSize={9} fontWeight={700} textAnchor="middle">TOTAL</text>
      {records.map((record, rowIndex) => {
        const values = new Map(record.project.score.node_shift_entries.map((entry) => [entry.standard_label, entry.shift_value]));
        const y = top + rowIndex * rowHeight;
        return (
          <g key={record.id}>
            <rect x={18} y={y} width={width - 36} height={rowHeight - 2} fill={rowIndex % 2 ? "#fbfcfc" : "#ffffff"} />
            <text x={24} y={y + 22} fill="#24323d" fontSize={10} fontWeight={600}>{record.typeName}</text>
            {labels.map((label, columnIndex) => {
              const value = values.get(label) || 0;
              const x = 18 + labelWidth + columnIndex * cellWidth;
              return (
                <g key={label}>
                  <rect x={x + 3} y={y + 3} width={cellWidth - 6} height={rowHeight - 8} rx={3} fill={fillFor(value)} />
                  <text x={x + cellWidth / 2} y={y + 22} fill="#17202a" fontSize={10} fontWeight={700} textAnchor="middle">{value}</text>
                </g>
              );
            })}
            <rect x={18 + labelWidth + labels.length * cellWidth + 3} y={y + 3} width={cellWidth - 6} height={rowHeight - 8} rx={3} fill="#153b44" />
            <text x={18 + labelWidth + labels.length * cellWidth + cellWidth / 2} y={y + 22} fill="#ffffff" fontSize={10} fontWeight={700} textAnchor="middle">{record.project.score.total_node_shift}</text>
          </g>
        );
      })}
      <g transform={`translate(18 ${height - 25})`}>
        {[0, 1, 2, 3].map((value, index) => <g key={value} transform={`translate(${index * 55} 0)`}><rect width={18} height={12} rx={2} fill={fillFor(value)} /><text x={23} y={10} fill="#66727f" fontSize={8}>{value === 3 ? "3+" : value}</text></g>)}
      </g>
    </svg>
  );
}

function StudioFigureComponent(props: StudioFigureProps, ref: React.ForwardedRef<SVGSVGElement>) {
  if (!props.records.length) return null;
  return props.mode === "atlas"
    ? <AtlasFigure records={props.records} columns={props.columns} structureName={props.structureName} svgRef={ref} />
    : <HeatmapFigure records={props.records} structureName={props.structureName} svgRef={ref} />;
}

export const StudioFigure = forwardRef(StudioFigureComponent);
