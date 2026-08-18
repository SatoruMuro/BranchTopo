# BranchTopo Web

BranchTopo Web is a local-first browser application for constructing, editing, and scoring anatomical branching patterns as node-edge graphs. It is the browser-based v0.1 successor to the PySide6 prototype.

All graph editing, scoring, and exports run in the browser. The app does not upload project data or reference images to an application server.

## v0.1 Scope

- Side-by-side Standard Pattern and Variant Pattern canvases.
- Background images with opacity, lock, positioning, zoom, and pan.
- Add, move, rename, and delete nodes.
- Add, rename, and delete edges.
- Copy Standard Pattern to Variant Pattern while preserving origin references.
- Manual node mapping and node-shift values from 0 to 5.
- IndexedDB autosave on the current device.
- JSON project import/export.
- CSV scoring export.
- PNG export for both canvases.

BranchTopo v0.1 does not perform automatic image analysis, automatic graph interpretation, automatic classification, or automatic scoring. It does not calculate edge loss, edge gain, edge loss change, node fusion, or branch-order change scores.

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
5. Load the variant reference image on the Variant Pattern canvas.
6. Copy the standard graph to the variant and edit it over the variant image.
7. Open Scoring and assign each standard node to a variant node.
8. Enter node-shift values and optional notes.
9. Save project JSON and export CSV or PNG files.

Use the mouse wheel to zoom and the middle mouse button to pan while the background is unlocked. Locking a visible background freezes the canvas view so those gestures cannot move the tracing reference. Nodes and labels keep a readable on-screen size while zooming.

## Local Storage and Project Files

The current working project, including loaded background image data, is autosaved in IndexedDB on the current browser and device.

Explicit JSON exports remain the portable project backup. To keep v0.1 project files small, background image binary data is not embedded in exported JSON. The image filename and display settings are saved. A JSON project still loads when its background image is unavailable; load the image again to restore the background.

Clearing browser site data can remove the autosaved copy, so export JSON regularly.

## Quality Checks

```powershell
npm.cmd run lint
npm.cmd exec tsc -- --noEmit
npm.cmd run build
```
