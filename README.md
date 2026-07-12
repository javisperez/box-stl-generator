# 3D Box Generator

A web-based parametric box generator for 3D printing. Design custom boxes with compartments, chamfers, and a matching lid — a classic cap lid, a drawer-style sleeve, or a hinged lid with snap-fit hinges — then export ready-to-print STL files for any slicer. Everything runs in the browser; nothing is uploaded anywhere.

**Try it live:** [https://javisperez.github.io/box-stl-generator/](https://javisperez.github.io/box-stl-generator/)

## Features

- **Real-time 3D preview** — the box updates live as you adjust parameters; preview the lid closed on the box (or the box inside its sleeve) before printing
- **Parametric box** — width/depth/height (10–200 mm), wall thickness, 45° chamfers on the outer vertical edges
- **Compartments** — up to 10 dividers each along width and depth, with adjustable positions and divider thickness
- **Three lid styles**
  - **Lid** — cap with a lip that hangs into the box, with configurable lip height and printer-fit tolerance
  - **Drawer sleeve** — open-front cover the box slides into, with optional finger notches
  - **Hinged lid** — flat lid with pin-less snap hinges (1–3 along the back edge); the printed lid snaps into the box, no assembly hardware
- **Lid decoration** — engraved or embossed text/emoji (rotatable in 90° steps) and cutout patterns (circles, squares, diamonds, hexagons, triangles, slots)
- **Smart generators** — volume calculator, compartment calculator, and a division designer that builds layouts from exact compartment sizes
- **Printer fit check** — pick from built-in printer presets (Bambu Lab, Prusa, Creality, Voron, Elegoo) or a custom plate size; the plate is outlined in the preview and you're warned when a part won't fit
- **Projects** — save/load designs in the browser, and share them as JSON files anyone can import
- **STL export** — floating export panel with per-part material estimates (grams of PLA); parts download separately with auto-generated names like `myproject_box_120x90x55.stl`
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

Pushes to `main` deploy automatically to GitHub Pages via [deploy.yml](.github/workflows/deploy.yml).

## Usage

The control panel has four tabs:

### Generator

Shortcuts that configure the box for you:

- **Volume Calculator** — enter a target volume (100–10,000 cm³) and get proportional dimensions
- **Compartment Calculator** — enter an item's size and count, and get a grid layout that fits
- **Division Designer** — specify exact compartment depths and let it place the dividers

### Box

Dimensions (10–200 mm per axis), wall thickness (1–10 mm), chamfer size, and X/Z dividers — set the count, then drag each divider's position (1–99% of the inner space). Divider thickness is adjustable and clamped so it never exceeds the outer wall.

### Lid

Choose **Lid** (cap with lip) or **Drawer Sleeve**, and toggle **preview in place** to see the parts assembled. Options depend on the style:

- **Lip height** (2–20 mm) and **tolerance** (0.1–1 mm) for fit — sleeves have their own sliding-fit tolerance and optional finger cutouts
- **Hinges** (lid style only) — 1–3 pin-less snap hinges; hinged lids are flat (no lip) so they print without supports
- **Text / Emoji** — 8–40 mm, 0.3–2 mm deep, engraved or embossed, rotatable 0/90/180/270°
- **Pattern** — cutout pattern through the lid cap or sleeve walls, with adjustable feature size and spacing

### Settings

- **Printer Plate Size** — presets or custom dimensions; drawn in the preview and used for fit warnings
- **Projects** — name, save, load, and delete designs (persisted in the browser)
- **Share** — export the current design as a JSON file, or import someone else's

### Preview & Export

Left-drag to rotate, right-drag to pan, scroll to zoom. The floating export control in the viewer shows each printable part with its footprint and material estimate — download them individually as STL.

## Tech Stack

- **React** + **TypeScript**, built with **Vite**
- **Three.js** + **React Three Fiber** for rendering
- **@jscad/modeling** for parametric CAD geometry
- **Tailwind CSS** + **shadcn/ui** for the interface

Notable changes are documented in the [CHANGELOG](CHANGELOG.md).

## License

This project is licensed under the [Mozilla Public License 2.0](LICENSE).
