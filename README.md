# 3D Box Generator

A web-based parametric box generator for 3D printing. Design custom boxes with compartments, chamfers, and a matching lid — a classic cap lid, a drawer-style sleeve, or a hinged lid with snap-fit hinges — then export ready-to-print STL files for any slicer. Everything runs in the browser; nothing is uploaded anywhere.

**Try it live:** [https://javisperez.github.io/box-stl-generator/](https://javisperez.github.io/box-stl-generator/)

## Features

- **Real-time 3D preview** — the box updates live as you adjust parameters, in a dark-themed viewport with a free-orbit **perspective** view or a fixed **isometric** view with dimension rulers (width, depth and height, for the box and any lid or sleeve beside it)
- **Parametric box** — width and depth up to your printer plate, height up to 200 mm, wall thickness, 45° chamfers on the outer vertical edges, and a choice of entering **outer size** or the **inner cavity** you need (walls and a fit tolerance are added for you)
- **Visual divider editor** — a top-down plan of the box where you drag each divider into place, add or remove them (up to 10 along each axis), space them evenly, or clear them all. Each cell shows its clear size in mm, and a **Numbers** mode lets you type exact positions instead
- **Dividers you control** — adjustable divider thickness and **divider height**, so dividers can sit below the rim
- **Cutout patterns** — circles, squares, diamonds, hexagons, triangles or slots through the box walls to save filament, optionally also through the **dividers**, with the **floor** kept flat and solid if you prefer
- **Finger slots** — aligned notches cut down from the top edge so cards and other flat items can be pinched out, with adjustable width, depth and position. Notch the outer walls, the dividers, or both, and optionally give each notch a **rounded (U-shaped) bottom**
- **Three closure styles**
  - **Lid** — cap with a lip that hangs into the box, with configurable lip height and printer-fit tolerance
  - **Drawer sleeve** — open-front cover the box slides into, with optional finger notches
  - **Hinged lid** — flat lid with pin-less snap hinges (1–3 along the back edge); the printed lid snaps into the box, no assembly hardware
- **Lid decoration** — engraved or embossed text/emoji (rotatable in 90° steps) and the same cutout patterns through the lid or sleeve
- **Start from…** — build a layout from a target volume, from the size and count of the items you want to store, or from exact compartment depths; the compartments come out at exactly the sizes you ask for
- **Printer fit check** — pick from built-in printer presets (Bambu Lab, Prusa, Creality, Voron, Elegoo) or a custom plate size; the plate is outlined in the preview. **Auto-arrange** lays the box and lid next to each other on the plate (turning a part a quarter turn only when that helps) and tells you whether they fit together
- **Projects** — save and load designs in the browser from a project manager with thumbnails, search, duplicate and delete; share a design as a link or a JSON file, and back up or restore your whole library
- **STL export** — the box and lid download as separate STL files with auto-generated names like `myproject_box_120x90x55.stl`, with per-part material estimates (grams of PLA, PETG or ABS)
- **Watertight geometry** — parts are built to be manifold and verified to export with zero open edges, so they slice cleanly

## Getting Started

Requires [Node.js](https://nodejs.org/) 22.13+ and [pnpm](https://pnpm.io/).

```bash
pnpm install
pnpm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`).

To build for production:

```bash
pnpm run build    # type-checks and bundles into dist/
pnpm run preview  # serve the production build locally
```

To run the mesh-integrity checks (also run by CI and before every push):

```bash
pnpm run check:stl
```

Pushes to `main` deploy automatically to GitHub Pages via [deploy.yml](.github/workflows/deploy.yml).

## Usage

### Top bar

- **Project name** — click it to open the project manager; click the arrow beside it for a quick menu to save, load or start a new project
- **⋯ menu** — copy a share link, export the current project as JSON, export your whole library, or import a JSON file
- **Export** — downloads the box (and the lid or sleeve, if there is one) as STL files

### Box tab

- **Start from…** — opens a dialog with three shortcuts: a target **volume** (100–10,000 cm³), an **items** grid (the size and number of things to store), or exact **division** depths
- **Size** — switch between **Outer size** and **Inner cavity**; in inner-cavity mode a tolerance (0–10 mm) is added to what you enter, and the walls are added on top. The sliders are coloured by axis: amber for width, green for depth, blue for height
- **Dividers** — the top-view editor described above, plus divider thickness and divider height. Thickness is clamped so it never exceeds the outer wall
- **Walls** — wall thickness (1–10 mm) and chamfer size
- **Details** — **Finger slots** notch the left/right walls and X dividers (**X walls**), the front/back walls and Z dividers (**Z walls**), or **both**, with separate switches for the outer walls and the dividers and a **Rounded bottom** option. The back wall stays solid when there is a hinged lid. **Cutout pattern** picks a shape, size and spacing, with switches to cut the floor and the dividers too

### Lid tab

Choose **None**, **Lid**, **Sleeve** or **Hinged**, and toggle **preview in place** to see the parts assembled. Options depend on the style:

- **Fit** — **tolerance** (0.1–1 mm) and **lip height** (2–20 mm) for a lid; sleeves have their own sliding-fit tolerance and optional finger cutouts
- **Hinge** — 1–3 pin-less snap hinges with adjustable barrel and axle diameter; hinged lids are flat (no lip) so they print without supports
- **Cutouts** — a pattern through the lid cap or sleeve walls, with adjustable feature size and spacing
- **Text** — 8–40 mm, 0.3–2 mm deep, engraved or embossed, rotatable 0/90/180/270°

### Print tab

- **Printer plate** — presets or custom dimensions, drawn in the preview. You are warned in red when a part is too big for the plate on its own, and in amber when the box and lid each fit but not together
- **Auto-arrange parts** — places the box and lid side by side on the plate in the preview, turning a part a quarter turn only when that is what makes it fit (exported STL files are not affected)
- **Material and parts** — PLA, PETG or ABS, with each part's size, estimated weight and a download button

### Project manager

Click the project name in the top bar. Each project is a card with a sketch of the box, its size, compartment count and closure type. Open, duplicate or delete projects, search by name or size, sort by recent or name, import a JSON file, or export your whole library. Unsaved work appears as a dashed card you can name and save.

### Preview

In perspective view, left-drag to rotate, right-drag to pan and scroll to zoom. In isometric view the angle is fixed: drag to pan and scroll to zoom.

## Tech Stack

- **React** + **TypeScript**, built with **Vite**
- **Three.js** + **React Three Fiber** for rendering
- **@jscad/modeling** for parametric CAD geometry
- **Tailwind CSS** + **shadcn/ui** for the interface

Notable changes are documented in the [CHANGELOG](CHANGELOG.md).

## License

This project is licensed under the [Apache License 2.0](LICENSE).

If you redistribute this software, modified or not, you must keep the
attribution in the [NOTICE](NOTICE) file (or reproduce it in your
documentation or app), include a copy of the license, and state any changes
you made to the files.

Versions published before 2026-10-27 were released under the Mozilla Public
License 2.0 and remain available under those terms.
