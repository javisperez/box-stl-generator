# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
with date-based entries since the project has no version releases.

## 2026-07-16

### Added
- **mm readouts for divider positions.** Each X/Z divider slider now shows its
  position in millimetres next to the percentage (distance from the inner wall
  face to the divider's centreline), and a summary under each division group
  lists the resulting clear compartment widths/depths, noting that the divider
  thickness comes out of the compartments.
- **More help text across the control panel.** The Box tab now states that
  width/depth/height are outer dimensions and shows the computed usable
  interior; wall thickness, chamfer and division sliders explain what they
  affect; the Generator calculators clarify whether their inputs are interior
  or outer sizes (Division Designer's preview now breaks total depth into
  compartments + walls); and the Lid tab explains lip height and the hinge
  barrel diameter.

## 2026-07-14

### Added
- **Finger slots.** New "Finger Slots" section in the Box tab cuts aligned
  notches down from the top edge so flat contents (cards, coins, tokens) can
  be pinched out of each compartment. "X Walls" notches the left/right outer
  walls and every X divider; "Z Walls" notches the front/back walls and every
  Z divider ("Both" does both). Width, depth and position along the wall are
  adjustable; the notch is confined to the inner cavity span (clear of
  corners and chamfers), stops just above the floor, and the back wall stays
  solid when a hinge is enabled. Wall cutout patterns automatically keep
  their holes clear of the notches, and the `check:stl` sweep gained five
  finger-slot configurations (dividers, chamfer, patterns, max-depth
  off-centre extremes, hinge) — all pass the edge/face integrity checks.
- **Mesh-integrity guard rail.** A new validator (`src/utils/meshValidator.ts`)
  checks exported triangle soups for open edges, non-manifold edges,
  flipped/duplicate facets, zero-area triangles and inside-out shells. It runs
  in three places:
  - `pnpm run check:stl` sweeps 22 representative export configurations
    (all patterns × chamfer, dividers, text lids, hinges, sleeve) through the
    exact export pipeline (~0.6 s).
  - A pre-push git hook (`.githooks/pre-push`, auto-installed via the
    `prepare` script pointing `core.hooksPath` at `.githooks`) blocks pushes
    when any configuration exports broken geometry. Bypass with
    `git push --no-verify`.
  - CI runs the same sweep before every Pages deploy.
  The in-app STL export also validates and asks for confirmation before
  downloading a mesh that failed the checks.
- **Share links.** "Copy Share Link" encodes the current project into the URL
  fragment (`#p=…`); opening the link on any device loads the project. The
  fragment never leaves the browser — nothing is sent to or stored on a
  server.
- **Project library backup.** "Export All Projects" writes the whole saved-
  project library to one JSON file; importing it on another machine merges the
  projects into the local library (same names are overwritten). Import still
  accepts single-project files.

### Fixed
- **Hinged lid exported a non-manifold STL** (caught by the first run of the
  new sweep). The lid knuckle's mounting arm had its back-bottom corner edge
  exactly on the barrel revolve's 270° vertex line, fusing two shells along
  one edge — 4 faces per edge, flagged by slicers. The arm is now inset 0.3 mm
  toward its mount, so it volume-overlaps the slab/wall and clears the
  barrel's tangent line (box-side arms get the same overlap for print
  strength).

## 2026-07-13

### Fixed
- **Malformed STL exports for patterned boxes.** Exporting a box with a cutout
  pattern produced STLs that slicers reported as non-manifold (e.g. "80
  non-manifold edges" in Bambu Studio) with the pattern missing after repair.
  Three compounding causes:
  - The export repair ran `generalize({ snap: true, triangulate: true })`,
    which snaps vertices to a coarse epsilon (~0.0006 mm) *before* its
    T-junction pass. Snapping pushed CSG split vertices on diagonal hole
    edges (worst with the triangles pattern, slope 0.866…) off the edge line,
    so the T-junctions were never repaired and the leftover open edges got
    fan-capped into overlapping garbage. The exporter now welds vertices at
    1e-6 mm and repairs T-junctions itself at full precision, with the
    boundary-loop capping kept only as a last resort.
  - The four chamfer corner strips in `generateBox`/`generateFlatLid` (and
    five chamfered corner triangles on top/bottom faces) were wound backwards.
    Slicers silently fix flipped facets on plain parts, but a flipped plane
    inverts the CSG tree's in/out classification, deleting every pattern-hole
    lining whenever a chamfer was combined with a cutout pattern — the holes
    exported as sealed membranes.
  - When the chamfer size equalled the wall thickness, duplicated grid
    breakpoints emitted zero-area polygons with null planes, poisoning the
    CSG tree the same way. Breakpoints are now deduplicated.
  - The alternating (upside-down) triangle prisms are now built from exact
    mirrored coordinates instead of `rotate(π)`, avoiding 1e-16 skew in
    their cut planes.
  All parts × all patterns × chamfer/divider/hinge combinations now export
  watertight (0 open, 0 non-manifold, 0 flipped edges, holes verified by
  volume) in an automated mesh-integrity sweep.

### Added
- **Box wall and floor cutout patterns.** The Box tab now has the same cutout
  pattern picker as the Lid tab (circles, squares, diamonds, hexagons,
  triangles, slots), punched through the box's 4 outer side walls and its
  floor to save filament. Wall holes stay clear of the top rim, floor, and
  corners/chamfers; when a snap hinge is enabled the back wall is left solid
  since it carries the hinge knuckle mounting arms. Floor holes stay inside
  the inner cavity footprint, with solid strips preserved under any divider
  walls so they still bond to the floor.
- **Sleeve side/back wall cutout patterns.** The drawer sleeve's cutout
  pattern (previously top/bottom plates only) now also perforates the left,
  right, and back walls — the front is open, so there's nothing to cut
  there. Holes stay clear of the top/bottom plates, the front opening, the
  finger notch, and the text.

## 2026-07-12

### Changed
- Rewrote the README to match the current app: pnpm-based setup, the four-tab
  control panel, sleeve and hinged lid styles, lid patterns, chamfers, printer
  plate presets, project save/share, and the floating export control with
  material estimates.

### Fixed
- Deploy workflow failed on push to main: the workflow pinned Node 20, but
  pnpm 11 (installed via `version: latest`) requires Node ≥ 22.13, and GitHub
  is deprecating Node 20 on runners. The workflow now uses Node 24.
- Deploy workflow then failed on `pnpm install` with ERR_PNPM_IGNORED_BUILDS:
  pnpm 10+ blocks dependency install scripts unless approved. esbuild's build
  script is now allowlisted in `pnpm-workspace.yaml`, and the pnpm version is
  pinned via the `packageManager` field (CI previously floated on `latest`,
  the root cause of both breakages).

## 2026-07-10

### Fixed
- **Exported STLs had open edges in slicers** (reported for the drawer sleeve
  in Bambu Studio). Two-part fix: CSG-built parts (sleeve, text lids) are run
  through JSCAD's snap + T-junction repair + triangulation at export time, and
  the hinge knuckles are now built entirely without boolean operations (each
  clip, barrel, and arm is its own closed shell — JSCAD booleans leave
  unrepairable sliver edges on split faces). All part exports are verified
  watertight: box, lid, hinged lid, text lids, and sleeve report 0 open edges.
- The floating export control no longer blocks rotating/zooming the viewport —
  only the actual cards and button capture the pointer, not the empty space
  around them.
- **Hinged lids closed upside down.** The old barrel hinge only aligned when the
  lid closed in its printed orientation, leaving the lip pointing up. Hinged
  lids are now flat slabs (no lip — the hinge holds the lid, and a lip can't
  coexist with a flat-printable hinged lid) modeled in closed orientation, with
  text on the top face. Lip height and tolerance are hidden for hinged lids.
- **Lid didn't fit boxes with asymmetric divider positions** (reported: "prints
  the lid mirrored so it won't fit"). Divider notches in the lid lip were cut at
  the box divider coordinates, but a lid is used flipped — notches are now cut
  pre-mirrored (like the lid text already was), so they land on the dividers
  after the flip. Symmetric layouts (the default even spacing) were unaffected,
  which is why the bug was hard to reproduce.

### Changed
- **Pin-less snap hinges** replace the pin-based barrel hinge: the lid knuckle
  has tapered axle stubs that click into C-clip box knuckles (a through bore
  with a snap slot slightly narrower than the axle). Press the lid straight
  down to assemble, pull up to remove — nothing extra to print. The "pin hole
  diameter" control is now "axle diameter" (default Ø3 mm).
- The control panel tabs stay pinned to the top of the sidebar while scrolling.
- **Floating export control** replaces the Export tab: a button over the
  preview exports everything (with a total PLA estimate) and expands into
  per-part cards with dimensions and individual exports. The expanded/collapsed
  state persists across sessions.
- **Settings tab** (replaces the Projects tab) now also holds the printer plate
  settings, renamed from "Printer Bed Optimizer" to **Printer Plate Size** and
  moved out of the Generator tab: pick a printer preset or custom size and get
  a warning (in Settings and over the preview) when a part won't fit the plate
  even rotated. The plate itself is drawn to scale on the ground of the 3D
  viewport (blue outline, red when something doesn't fit). Every Settings
  section (plate, projects, share) is collapsible. Plate size persists across
  sessions.
- Box width, depth, and height sliders now adjust in 0.5 mm steps instead of
  1 mm.
- **Grouped lid/sleeve options**: preview-in-place, fit tolerance, and
  text/emoji are now shared controls for both styles — including text on the
  sleeve's top wall, which is new — with only the style-specific options
  (lip height, hinges, finger cutout) splitting between them.
- Exported STL filenames are prefixed with a filesystem-safe version of the
  project name (e.g. `My-Test-Box_box_120x90x55.stl`) when a project is named.

### Added
- **Preview in place**: a viewer-only toggle in the Lid tab that shows the
  assembly — the friction lid flipped and closed on the box, the hinged lid
  closed with the knuckles interleaved, or the box slid into the drawer
  sleeve. Exported STLs are never affected.
- **Parts strip** under the 3D viewer: one card per printable part (box, lid or
  sleeve, hinge pin) with dimensions, an estimated PLA weight computed from the
  actual mesh volume, and a one-click STL export.
- Dimensions overlay and camera-controls hint on the 3D viewer.
- **Drawer sleeve mode**: instead of a lid, generate an open-front sleeve the box
  slides in and out of (matchbox style), with a closed back as a drawer stop,
  its own fit tolerance, and an optional finger cutout at the opening for
  pulling out heavy boxes.
- **Named projects**: save any number of projects to the browser (name, save,
  load, delete) from the new Projects tab.
- **Share projects as JSON**: export the current project as a JSON file anyone
  can import to recreate it exactly.
- **Divider thickness**: internal divider walls can be thinner than the outer
  walls (e.g. 2 mm shell with 1 mm dividers). Clamped between 0.4 mm and the
  outer wall thickness; lid notches follow the divider thickness.
- Help text for the lid tolerance and sleeve tolerance sliders (lower = tighter
  fit).
- **Text rotation**: lid/sleeve text can be rotated 0°, 90°, 180°, or 270° on
  the surface. At 90°/270° the text runs along the depth and uses it as the
  available length.
- **Cutout patterns** to save filament: circles, squares, diamonds, hexagons,
  triangles, or slots cut through the lid (or through the sleeve's top and
  bottom walls), with configurable size and spacing. Rows are staggered and
  triangles tessellate point-up/point-down. Text always keeps a solid patch —
  holes that would touch the text (or the sleeve's finger notch) are skipped.
  Solid borders are kept at edges, the lip, the opening, and the back wall.
  The exporter also gained a boundary-loop capper that seals any hairline
  sliver gaps left by heavy CSG, keeping patterned exports watertight.

### Changed
- **App-shell layout**: the control sidebar is pinned to the right edge and
  scrolls independently, while the 3D preview fills the entire remaining
  viewport. The parts strip floats over the preview, and the app title and
  credits moved into the sidebar. On small screens the preview and sidebar
  stack vertically.
- The current working state now autosaves on every change; the manual save
  button was replaced by named project saves and a "Reset to Defaults" button.

## 2026-02-19

### Added
- **Barrel hinges**: optional printed hinges along the back edge (1–3 hinges,
  configurable barrel and pin diameters) with separately printed pins.
- **Chamfers** on the box's outer vertical edges, applied to both box and lid.

## 2026-02-13

### Added
- Initial release: parametric box generator with live 3D preview and STL export.
- Box dimensions, wall thickness, and internal X/Z dividers.
- Friction-fit lid with lip height, tolerance, and engraved or embossed text.
- Generators: volume calculator, compartment calculator, printer bed optimizer,
  and division designer.
- Save the current project to the browser.
- Published on GitHub Pages.
