---
name: create-diagram
description: Draws Dapr architecture diagrams in the docs.dapr.io style as SVG, with optional PNGs for slides. Use for "draw a diagram of my Dapr app". For diagram to workflow code use create-workflow-from-diagram.
---

# Create a Dapr Diagram

## Overview

This skill draws a Dapr diagram as code and exports it to an SVG (and, with Chromium, PNGs) in the user's project. It copies a small engine into a `diagrams/` folder, you write one scene file per diagram, and the exporter renders it. All design rules, the layout method and the engine API are in [`REFERENCE.md`](REFERENCE.md). This file is only the workflow.

`<skill dir>` is the directory that contains this SKILL.md. Relative paths in this file, such as `scripts/setup.mjs`, resolve from there. `<diagramsDir>` is the folder you set up below, `diagrams` by default.

## Prerequisites

Check before creating any file:

- Node.js 22 or newer: run `node --version`. If it is older or missing, tell the user and stop.

## Set up

1. Pick the folder name: `diagrams`, unless the user names another one.
2. Run `node <skill dir>/scripts/setup.mjs <diagramsDir>` and act on the exit code:
   - **0**: created, or already up to date. Missing scaffold files are restored.
   - **2**: the skill ships a newer engine than the project's copy. Ask the user whether to refresh. On yes, re-run with `--refresh`. Scenes and `out/` are not touched.
   - **3**: the folder exists and is not a create-diagram folder. Ask the user for another folder name and re-run.
3. Ask the user once whether they want PNGs for slides. Chromium (installed with `@playwright/test` 1.56.1 into the diagrams folder, about 150 MB) gives three things: drawings centred in their canvas, a check that labels still fit when Inter is not installed, and light and dark PNGs. On yes, run the setup command again with `--with-browser`. On no, you get SVG only. Do not ask again.
   - On Linux the font check needs Arial and Courier-metric fonts, for example the `fonts-liberation` package.
   - If the project or a parent folder already has its own `@playwright/test`, the engine may use that one.
   - To enable Chromium later, re-run setup with `--with-browser`.

Never edit `<diagramsDir>/_engine/`. Setup replaces it on refresh, so edits are lost.

## Understand the diagram

Work from what the user gave you:

- **A description**: list the components and connections you read from it.
- **An image or sketch**: read it, then list what you see. Do not copy anything you doubt.
- **A Mermaid block**: some convert and some do not (sequence and gantt stay Mermaid). See [Converting a Mermaid block](REFERENCE.md#converting-a-mermaid-block).

Confirm that list with the user before drawing, and ask about anything ambiguous. Use docs.dapr.io terms for Dapr concepts (sidecar, building block, component). See [Turning a source into a layout](REFERENCE.md#turning-a-source-into-a-layout).

## Build the scene

Read [`REFERENCE.md`](REFERENCE.md) first: [Design rules](REFERENCE.md#design-rules), [The scene contract](REFERENCE.md#the-scene-contract), [Engine API](REFERENCE.md#engine-api) and the [Worked example](REFERENCE.md#worked-example). Then:

1. Write `<diagramsDir>/scenes/<name>.mjs`. The name is lowercase words joined by hyphens, such as `order-flow`.
2. Register it in `<diagramsDir>/scenes/index.mjs`.
3. Check the [Traps already hit](REFERENCE.md#traps-already-hit) before exporting.

## Export and look

1. Run `node <diagramsDir>/_engine/export.mjs --only <name>` (or without `--only` for every scene).
2. Without Chromium it prints "Chromium not installed: skipped centring, fallback-font check and PNGs. See SKILL.md to enable." That is expected. Offer the Chromium step above only if the user did not decline it. See [Without Chromium](REFERENCE.md#without-chromium) for what to do differently.
3. With Chromium the fallback-font check runs after the SVGs are written. If it fails, widen the shape or shorten the label, then export again.
4. Look at the result in both themes. Read `<diagramsDir>/out/<name>-light.png` and `<name>-dark.png` if they exist. A transparent dark PNG looks washed out on a white viewer, so judge it as if on a dark background. Without PNGs, open the SVG.
5. Fix what you see (overlaps, crowded labels, arrows that cross) and export again.

`out/` belongs to the exporter. Never put a hand-made file there.

## Verify

You MUST run this and fix every failure it reports:

```bash
node <diagramsDir>/_engine/export.mjs --check
```

It renders and validates every scene and fails if a file in `out/` is out of date.

## Folder structure

```text
<diagramsDir>/
  _engine/          # copied by setup, do not edit
  scenes/
    index.mjs       # registry
    <name>.mjs      # one scene per diagram
  out/
    <name>.svg      # light and dark in one file
    <name>-light.png, <name>-dark.png   # only with Chromium
```

## Final message

Tell the user, briefly:

- Where the files are: `<diagramsDir>/out/<name>.svg` and, if made, the two PNGs.
- Which file to use where. The SVG follows light and dark mode in browsers, so use it for docs sites and READMEs. In slides, use `<name>-light.png` on a light background and `<name>-dark.png` on a dark one.
- How to regenerate: `node diagrams/_engine/export.mjs`.
- How to refresh the engine: `node <skill dir>/scripts/setup.mjs diagrams --refresh`.
