"use client";

import { X } from "lucide-react";

import type { BranchTopoProject, NodeShiftEntry } from "../types";
import { withUpdatedScore } from "../lib/project";

interface ScoringDialogProps {
  project: BranchTopoProject;
  onChange: (project: BranchTopoProject) => void;
  onClose: () => void;
}

export function ScoringDialog({ project, onChange, onClose }: ScoringDialogProps) {
  const updateEntry = (standardId: string, patch: Partial<NodeShiftEntry>) => {
    const entries = project.score.node_shift_entries.map((entry) => {
      if (entry.standard_node_id !== standardId) return entry;
      const next = { ...entry, ...patch };
      if (patch.variant_node_id !== undefined) {
        const variant = project.variant_graph.nodes.find((node) => node.id === patch.variant_node_id);
        next.variant_label = variant?.label || "";
      }
      return next;
    });
    onChange(withUpdatedScore(project, entries));
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="score-dialog" role="dialog" aria-modal="true" aria-labelledby="score-title">
        <header className="dialog-header">
          <div>
            <span className="canvas-kicker">MANUAL SCORING</span>
            <h2 id="score-title">Node-shift scoring</h2>
          </div>
          <button className="icon-button" type="button" title="Close scoring table" onClick={onClose}><X size={19} /></button>
        </header>
        <div className="score-table-wrap">
          <table className="score-table">
            <thead><tr><th>Standard node</th><th>Variant node</th><th>Shift value</th><th>Notes</th></tr></thead>
            <tbody>
              {project.score.node_shift_entries.map((entry) => (
                <tr key={entry.standard_node_id}>
                  <td><strong>{entry.standard_label}</strong></td>
                  <td>
                    <select
                      aria-label={`Variant node for ${entry.standard_label}`}
                      value={entry.variant_node_id}
                      onChange={(event) => updateEntry(entry.standard_node_id, { variant_node_id: event.target.value })}
                    >
                      <option value="">Unmapped</option>
                      {project.variant_graph.nodes.map((node) => <option value={node.id} key={node.id}>{node.label}</option>)}
                    </select>
                  </td>
                  <td>
                    <input
                      aria-label={`Shift value for ${entry.standard_label}`}
                      className="shift-input"
                      type="number"
                      min={0}
                      max={5}
                      value={entry.shift_value}
                      onChange={(event) => updateEntry(entry.standard_node_id, { shift_value: Math.max(0, Math.min(5, Number(event.target.value))) })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Notes for ${entry.standard_label}`}
                      type="text"
                      value={entry.notes}
                      placeholder="Optional note"
                      onChange={(event) => updateEntry(entry.standard_node_id, { notes: event.target.value })}
                    />
                  </td>
                </tr>
              ))}
              {!project.score.node_shift_entries.length && (
                <tr><td colSpan={4} className="empty-table">Add standard nodes before scoring.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <footer className="dialog-footer">
          <div><span>Total node-shift</span><strong>{project.score.total_node_shift}</strong></div>
          <button className="primary-button" type="button" onClick={onClose}>Done</button>
        </footer>
      </section>
    </div>
  );
}
