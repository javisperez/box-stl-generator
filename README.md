# 3D Box STL file Generator

A web-based parametric box generator for 3D printing. Design custom boxes with compartments, chamfers, and a matching lid — a classic cap lid, a drawer-style sleeve, or a hinged lid with snap-fit hinges — then export ready-to-print STL files for any slicer. Everything runs in the browser; nothing is uploaded anywhere.

**Try it live:** [https://chanchalsakardeqh.github.io/3d-Box-STL-FILE-Generator/](https://chanchalsakardeqh.github.io/3d-Box-STL-FILE-Generator/)

## Features

- **Real-time 3D preview** — the box updates live as you adjust parameters; preview the lid closed on the box (or the box inside its sleeve) before printing

- **Parametric box** — width/depth/height (10–200 mm), wall thickness, 45° chamfers on the outer vertical edges

- **Compartments** — up to 10 dividers each along width and depth, with adjustable positions and divider thickness

- **Finger slots** — aligned notches cut down from the top edge of the walls and dividers so cards and other flat items can be pinched out, with adjustable width, depth, and position; each open span between dividers gets its own notch, and divider notching can be toggled off separately

- **Custom holes** — place individually sized, individually positioned circle, square, diamond, hexagon, triangle, or slot cutouts on any box wall, the box floor, or the lid cap. Circles on the floor or lid can switch to **4 symmetric corner holes** for mounting screws, with independent width/depth insets so the rectangle matches real screw spacing, plus sliders to slide the whole group off-center. Slots can use independent width and length instead of a single size. Lid holes automatically avoid the engraved/embossed text area.

- **Three lid styles**
  - **Lid** — cap with a lip that hangs into the box, with configurable lip height and printer-fit tolerance
  - **Drawer sleeve** — open-front cover the box slides into, with optional finger notches
  - **Hinged lid** — flat lid with pin-less snap hinges (1–3 along the back edge); the printed lid snaps into the box, no assembly hardware
  
- **Lid decoration** — engraved or embossed text/emoji (rotatable in 90° steps) and cutout patterns (circles, squares, diamonds, hexagons, triangles, slots)

- **Smart generators** — volume calculator, compartment calculator, and a division designer that builds layouts from exact compartment sizes

- **Printer fit check** — pick from built-in printer presets (Bambu Lab, Prusa, Creality, Voron, Elegoo) or a custom plate size; the plate is outlined in the preview and you're warned when a part won't fit

- **Projects** — save/load designs in the browser, and share them as JSON files anyone can import

- **STL export** — floating export panel with per-part material estimates (grams of PLA); parts download separately with auto-generated names like `myproject_box_120x90x55.stl`

- **Spec sheet export** — download a PDF with every dimension you'd want on hand before printing: outer/inner box size, exact interior size of each compartment, every custom hole's face/shape/size/position, lid or sleeve dimensions and fit tolerance, hinge specs, engraved text details, and the STL filenames it produces

- **Watertight geometry** — parts are built to be manifold and verified to export with zero open edges, so they slice cleanly

  

**Features added by Chanchal Sakarde : (On top of Original Author)**

One new file was added (`src/utils/specSheetExporter.ts`); everything else below was done as edits to existing files.

| File                                | What changed                                                 |
| ------------------------------------ | ------------------------------------------------------------ |
| `src/utils/boxGenerator.ts`         | Added `CustomHoleFace`, `CustomHoleShape`, `CustomHole`, and `LidCustomHole` types, `CUSTOM_HOLE_FACES` / `CUSTOM_HOLE_SHAPES` exports, `makeCustomHole()` / `makeLidCustomHole()` helpers, the `customHoleCutouts()` and `lidCustomHoleCutouts()` geometry functions, corner-screw-hole support (`cornerHoles` / `cornerInsetX` / `cornerInsetY` fields and a shared `clampCornerInset()` helper), independent slot width/length fields, `customHoles` / `lidCustomHoles` fields on `BoxParams`, and wired all of it into `generateBox()` and `generateLid()` |
| `src/utils/specSheetExporter.ts` *(new)* | PDF spec-sheet generator (built on a new `jspdf` dependency) — outer/inner dimensions, exact per-compartment interior sizes, every custom hole's face/shape/size/position, lid or sleeve dimensions and tolerance, hinge specs, text details, and the STL filenames the current design will produce |
| `src/utils/projectStorage.ts`       | Added `customHoles: []` / `lidCustomHoles: []` to `DEFAULTS`, and validation/sanitization in `normalizeParams()` for custom holes, lid custom holes, and corner-hole fields — including migrating older saves that used a single-value `cornerInset` field to the newer independent width/depth insets — so old saves and share links keep loading |
| `src/components/ControlPanel.tsx`   | Added `addCustomHole` / `updateCustomHole` / `removeCustomHole` handlers (and their lid-tab equivalents) and the "Custom Holes" UI section — Face/Shape dropdowns, Size vs. independent slot Width/Length, the corner-screw-hole checkbox with its inset and group-shift sliders — in both the Box tab and the Lid tab |
| `scripts/check-stl.ts`              | Added mesh-integrity test configurations covering every hole face and shape, corner screw holes (box floor, friction lid, hinged lid, text-exclusion interaction, off-center group shifts), and independent slot dimensions |
| `package.json`                      | Added the `jspdf` dependency used by the spec-sheet PDF export |
| `src/App.tsx`                       | Wired up the "Spec Sheet (PDF)" export button next to the existing "Export all" control |

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

**Finger Slots** cut aligned notches down from the top edge so you can pinch flat contents (cards, coins) out of each compartment: **X Walls** notches the left/right walls and every X divider, **Z Walls** the front/back walls and every Z divider. A three-way **Outer Walls / Outer + Dividers / Dividers Only** choice controls which walls actually get notched — pick **Dividers Only** to leave the outside smooth and only add finger access between compartments. Width, depth, and position along the wall are adjustable; the notch always stays clear of corners, chamfers, and the floor, and the back wall stays solid when a hinge is enabled.

**Cutout Pattern** perforates the box's outer side walls and floor with a repeating shape (circles, squares, diamonds, hexagons, triangles, slots) to save filament, with adjustable feature size and spacing. Two checkboxes extend it further: **Also cut the pattern into divider walls** (dividers stay solid by default) and **Keep the base solid (exclude the floor)**, for a box that's ventilated on the sides but has a clean, unperforated bottom.

**Custom Holes** let you punch an individually sized, individually positioned hole into any wall or the floor: pick the face, shape, size (or independent width/length for slots), and position. On the floor, a **Circles** hole can switch to **4 symmetric corner holes** for mounting screws — set how far each hole sits from the edge on each axis, then optionally slide the whole 4-hole group off-center.

### Lid

Choose **Lid** (cap with lip) or **Drawer Sleeve**, and toggle **preview in place** to see the parts assembled. Options depend on the style:

- **Lip height** (2–20 mm) and **tolerance** (0.1–1 mm) for fit — sleeves have their own sliding-fit tolerance and optional finger cutouts
- **Hinges** (lid style only) — 1–3 pin-less snap hinges; hinged lids are flat (no lip) so they print without supports
- **Text / Emoji** — 8–40 mm, 0.3–2 mm deep, engraved or embossed, rotatable 0/90/180/270°
- **Pattern** — cutout pattern through the lid cap or sleeve walls, with adjustable feature size and spacing; on the lid cap, **Coverage Width/Depth (%)** and **Position X/Y (%)** shrink the cutout area down to a scalable region (a half, a quarter, or any custom fraction) and slide it around instead of always covering the whole cap
- **Custom Holes** — same per-hole shape/size/position controls as the Box tab's custom holes, punched through the lid cap; includes the 4-corner screw-hole option for circles, and automatically avoids the text area (hidden for drawer sleeves, which have no cap). Width/Length/Size sliders cap out at however much room the lid actually has — derived from the box's width/depth, wall thickness, and Fit Tolerance — rather than a fixed number, so a larger box unlocks larger holes

### Settings

- **Printer Plate Size** — presets or custom dimensions; drawn in the preview and used for fit warnings
- **Projects** — name, save, load, and delete designs (persisted in the browser)
- **Share** — export the current design as a JSON file, or import someone else's

### Preview & Export

Left-drag to rotate, right-drag to pan, scroll to zoom. The floating export control in the viewer shows each printable part with its footprint and material estimate — download them individually as STL. The **Spec Sheet (PDF)** button next to it downloads a printable summary of every dimension in the current design — box and lid/sleeve size, compartment sizes, hole positions, hinge specs, and the STL filenames — handy to check over before you start slicing.

## Tech Stack

- **React** + **TypeScript**, built with **Vite**
- **Three.js** + **React Three Fiber** for rendering
- **@jscad/modeling** for parametric CAD geometry
- **Tailwind CSS** + **shadcn/ui** for the interface

Notable changes are documented in the [CHANGELOG](CHANGELOG.md).

## License

This project is licensed under the [Mozilla Public License 2.0](LICENSE).
