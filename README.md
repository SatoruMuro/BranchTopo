# BranchTopo Web

BranchTopo Web is a local-first browser application for constructing, editing, and scoring anatomical branching patterns as node-edge graphs. It is the browser-based v0.1 successor to the PySide6 prototype.

All graph editing, scoring, and exports run in the browser. The app does not upload project data or reference images to an application server.

## v0.1 Scope

- Side-by-side Standard Pattern and Variant Pattern canvases.
- Background images with opacity, lock, positioning, zoom, and pan.
- Add, move, rename, and delete nodes.
- Add, rename, and delete edges.
- Copy Standard Pattern to Variant Pattern while preserving origin references.
- Rooted-tree validation and automatic node-shift calculation from graph connectivity.
- Automatic node mapping for copied nodes, with manual correction when needed.
- IndexedDB autosave on the current device.
- JSON project import/export.
- CSV scoring export.
- PNG export for both canvases.
- Reusable structure and type names applied consistently to JSON, CSV, and PNG filenames.
- Figure Studio for comparing multiple saved variants as a topology atlas or node-shift heatmap.
- SVG and high-resolution PNG figure export.

BranchTopo does not extract or interpret graphs from images and does not perform automatic anatomical classification. It automatically calculates only the node-shift score after the user constructs both graphs and selects their corresponding root nodes. It does not calculate edge loss, edge gain, edge loss change, node fusion, or branch-order change scores.

## Requirements

- Node.js 22.13 or newer for local development.
- A current Chrome, Edge, or Safari browser.

## Run Locally

```powershell
cd BranchTopoWeb
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:3000`.

## Basic Workflow

1. Select the Standard Pattern canvas.
2. Load an optional reference image with Background.
3. Adjust opacity and lock the background in the canvas inspector.
4. Add and rename standard nodes, then connect them with edges.
5. Select the standard root node in the canvas inspector.
6. Load the variant reference image on the Variant Pattern canvas.
7. Copy the standard graph to the variant and edit it over the variant image. The corresponding variant root is copied automatically.
8. Open Scoring. Copied nodes are mapped automatically; correct any mapping that is not one-to-one.
9. Review the automatically calculated attachment shift for each node and add optional notes.
10. Save project JSON and export CSV or PNG files.

Automatic scoring requires each graph to be a connected tree without cycles. BranchTopo compares the ancestor order of corresponding non-terminal branching nodes. A node receives one step for each branching node that it crosses in the distal direction; passive parent changes in the crossed nodes and downstream nodes are not counted again. Unmapped nodes and ambiguous or invalid graphs are reported instead of being guessed.

Use the mouse wheel to zoom and the middle mouse button to pan while the background is unlocked. Locking a visible background freezes the canvas view so those gestures cannot move the tracing reference. Nodes and labels keep a readable on-screen size while zooming.

## Local Storage and Project Files

The current working project, including loaded background image data, is autosaved in IndexedDB on the current browser and device.

Explicit JSON exports remain the portable project backup. To keep v0.1 project files small, background image binary data is not embedded in exported JSON. The image filename and display settings are saved. A JSON project still loads when its background image is unavailable; load the image again to restore the background.

Use the New project button in the upper-right file controls to clear both graphs, backgrounds, mappings, and scores after confirming. Export JSON first when the current project may be needed later.

Set Structure name and Type in the right inspector before exporting. For example, `AorticArch` and `type3` produce `AorticArch_type3.json`, `AorticArch_type3.csv`, and `AorticArch_type3.png`. The standard canvas is exported as `AorticArch_standard.png`. Both names are stored in the project JSON.

Clearing browser site data can remove the autosaved copy, so export JSON regularly.

## Figure Studio

Open Figure Studio from the editor toolbar. Select multiple BranchTopo JSON files with **Import JSON**. Files are grouped by their stored Structure name, and variants within the selected structure are ordered naturally by Type.

The **Atlas** view shows one Standard topology followed by each variant topology. Shifted branch nodes are highlighted and annotated with the calculated step count. The column control changes the plate layout.

The **Heatmap** view places variants in rows and scored branching nodes in columns. The final column shows the total node-shift score. Both views can be exported directly as editable SVG or high-resolution PNG. Figure Studio runs locally in the browser and does not upload imported JSON data.

For consistent figures, use the same Standard Pattern for all JSON files in a structure group. Figure Studio displays a warning when the stored Standard topology differs between files.

## Quality Checks

```powershell
npm.cmd run lint
npm.cmd exec tsc -- --noEmit
npm.cmd run build
```
