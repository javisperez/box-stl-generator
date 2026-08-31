# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
with date-based entries since the project has no version releases.

## 2026-08-31 (3)

### Fixed
- **"Dividers Only" wasn't actually excluding the outer walls.** The Notch buttons (`Outer Walls` / `Outer + Dividers` / `Dividers Only`) set two fields at once — `fingerSlotOuterWalls` and `fingerSlotDividers` — via two back-to-back calls to `updateParam()`. `updateParam` builds its update by spreading the component's current `params` prop, which doesn't reflect the first call's change until React re-renders; so the second call silently overwrote the first one's field back to its old value. In practice this meant clicking "Dividers Only" set `fingerSlotDividers` correctly but reverted `fingerSlotOuterWalls` back to `true`, so the outer walls kept getting notched exactly as if "Outer + Dividers" were still selected. Fixed by combining both field updates into a single `onParamsChange()` call so they land together. The same bug was present in the lid cutout pattern's "Reset to full lid" button (four chained `updateParam()` calls, only the last of which actually stuck) — fixed the same way.
- Audited the rest of `ControlPanel.tsx` for any other handler calling `updateParam()` more than once in a single click; none remain — every multi-field update now goes through one `onParamsChange()` call.

## 2026-08-31 (2)

### Fixed
- **"Notch" selector (Outer Walls / Outer + Dividers / Dividers Only) now shows for both Finger Slot axes.** It was only appearing when the *currently selected* axis already had matching dividers configured — e.g. selecting **Z Walls** hid the selector entirely if only X dividers existed (and vice versa for **X Walls** with only Z dividers), making **"Dividers Only"** effectively unreachable for whichever axis didn't yet have dividers on it. The selector is now always shown whenever a Finger Slot axis is active, regardless of which dividers currently exist. When you do pick "Outer + Dividers" or "Dividers Only" for an axis that has no dividers yet, a small note explains there's nothing to notch there until one is added — rather than the control just disappearing.

## 2026-08-31

### Added
- **Cutout pattern on divider walls.** In **Box → Cutout Pattern**, a new **"Also cut the pattern into divider walls"** checkbox extends the repeating side-wall pattern onto the X/Z divider walls too — previously dividers always stayed solid regardless of the box pattern. Off by default so existing designs render unchanged; each divider is punched through its own thickness the same way the outer walls are, staying clear of the top rim, the floor, and every crossing perpendicular divider at each intersection.
- **Exclude the floor from the cutout pattern.** A second new checkbox, **"Keep the base solid (exclude the floor)"**, skips the floor when the box's cutout pattern is applied — previously the floor always got the same pattern as the side walls whenever one was selected. Handy for a box that should sit flush and flat (no light/dust leaking through the bottom) while still shedding filament on the sides.
- Added `boxPatternDividers` / `boxPatternSkipFloor` fields to `BoxParams`, a new `dividerWallHoles()` geometry function in `boxGenerator.ts` (mirrors `boxWallHoles()`'s per-wall punching, but for the thinner divider walls), gated the existing `boxFloorHoles()` call behind the new skip-floor flag, defaults/sanitization in `projectStorage.ts`, and spec-sheet lines reporting whether dividers/floor are patterned or solid.
- **"Notch divider walls only" option for Finger Slots.** The old single **"Notch divider walls too"** checkbox (which always notched the outer walls, optionally adding dividers) is now a three-way choice: **Outer Walls** (original default), **Outer + Dividers** (previous "too" behavior), and **Dividers Only** — leaves the outside of the box smooth and cuts finger-access notches only where compartments meet, for a cleaner exterior.
- Added a `fingerSlotOuterWalls` field to `BoxParams` (default `true`) alongside the existing `fingerSlotDividers`; `fingerSlotCutouts()` now gates the outer-wall notch prisms behind it. `projectStorage.ts` sanitizes both fields and falls back to notching the outer walls if a saved project somehow has both turned off, so there's always at least one place to get a grip.
- Added `check:stl` mesh-integrity cases covering divider-pattern cutouts (every shape, plus combined with chamfer/finger-slots/skip-floor), skip-floor alone and combined with divider cutouts, and dividers-only finger notches (including with a hinge, where the back wall must stay solid) — all 64 configurations in the sweep pass.

## 2026-08-12

### Added
- **Scalable, positionable lid cutout pattern.** In **Lid → Cutout Pattern**, the repeating pattern (Circles/Squares/Diamonds/Hexagons/Triangles/Slots) no longer has to cover the whole lid cap. Two new sliders, **Coverage Width (%)** and **Coverage Depth (%)** (10–100%), shrink the cutout area down to a scalable region — 50% × 100% for a half, 50% × 50% for a quarter, or any custom fraction. Two more, **Position X (%)** and **Position Y (%)** (-100 to 100), then slide that smaller region around within the lid: 0 is centered, and ±100 pushes it to the opposite edges. Both position sliders are disabled while their matching coverage is at 100%, since there's no slack to slide through. A **"Reset to full lid"** button appears once coverage or position has been changed. This only applies to the lid cap (`lidStyle: 'lid'`); sleeve wall patterns are unaffected.
- Added `lidPatternCoverageX` / `lidPatternCoverageY` / `lidPatternOffsetX` / `lidPatternOffsetY` fields to `BoxParams`, a shared `applyRegionCoverage()` helper in `boxGenerator.ts` that shrinks and re-centers a `Rect2` region, and matching defaults/clamping in `projectStorage.ts` so older saved/shared projects load safely (they default to 100% coverage, 0% offset — the original full-cap behavior). The spec sheet PDF now lists the coverage and position values whenever they differ from full coverage.
- **Custom-hole size limits now scale with the box.** In **Lid → Custom Holes**, the Width/Length sliders (for slots with "Set width & length separately" checked) and the Size slider (for every other shape) used to cap out at a fixed 40–80 mm regardless of the box's actual dimensions — so a deep box couldn't use holes as large as it had room for, while a small box could be told to accept holes bigger than the lid could safely hold. Both sliders' maximums are now derived from the box's real width/depth, wall thickness, and the lid's **Fit Tolerance**, matching the same safe-area math the lid already uses to keep cutouts clear of the lip walls (or the solid border on a hinged lid). Resize the box or change the Fit Tolerance and the available range updates immediately.
- Added an exported `lidCustomHoleMaxDims()` helper in `boxGenerator.ts` that returns the largest safe width/length for a lid-cap hole, used both to drive the sliders' `max` in `ControlPanel.tsx` and as a safety clamp inside `lidCustomHoleCutouts()` itself — so a hole set large on a bigger box can't cut into the lip walls if the box is later resized smaller.

## 2026-08-11

### Added
- **Corner screw holes for Custom Holes.** In both **Box → Custom Holes (Floor)** and **Lid → Custom Holes**, selecting the **Circles** shape now reveals an **Add 4 symmetric corner holes (for screws)** checkbox. When checked, the single positioned hole is replaced by four identical circular holes mirrored across all four corners — handy for mounting-screw patterns on an enclosure floor or lid. Two sliders, **Corner Inset — Width (mm)** and **Corner Inset — Depth (mm)** (2–40 mm each), control how far each hole sits from the nearest edge on each axis independently — so the four holes can form a rectangle matching real screw spacing, not just a square — and replace the Position % sliders while corner mode is on; unchecking it restores the normal single-hole position controls. Both insets are automatically clamped so holes never run off the part or overlap the lid's lip/hinge margins, and on the lid, corner holes still respect the engraved/embossed text exclusion zone just like a normal custom hole.
- **Shift the whole corner-hole group.** The 4-hole rectangle doesn't have to stay centered on the floor or lid: two more sliders, **Shift Group — Width (%)** and **Shift Group — Depth (%)**, slide the entire group left/right and forward/back as a rigid block (50% = centered, matching the original behavior). How far it can slide is limited by the slack between the chosen Corner Inset and the minimum safe edge margin — a tight inset (holes already hugging the edge) leaves little or no room to shift.
- Added `cornerHoles`/`cornerInsetX`/`cornerInsetY` fields to both `CustomHole` and `LidCustomHole`, a shared `clampCornerInset()` helper in `boxGenerator.ts`, and matching sanitization in `projectStorage.ts` so saved/shared/imported projects load safely (older projects default to `cornerHoles: false`; projects saved with the earlier single-value `cornerInset` field are read and applied to both axes automatically). The existing `posU`/`posV` fields are reused to drive the group-shift sliders when corner mode is on, rather than adding new fields.
- Added `check:stl` mesh-integrity cases for corner screw holes (box floor, friction lid, hinged lid, lid text-exclusion interaction, and off-center group shifts at both slide extremes) and for slot custom holes with independent width/length, closing a gap in the existing sweep.
- Added a **"Spec Sheet (PDF)"** export button next to your existing "Export all" control. Here's what changed:

  **New file:** `src/utils/specSheetExporter.ts` — builds a multi-page PDF (via a new `jspdf` dependency, added to `package.json`) with:

  - **Overview** — outer dimensions, wall thickness, chamfer, lid/sleeve style, total estimated PLA weight, print-bed fit check
  - **Box body** — outer/inner footprint, inner height, volume/weight, and a **table of every compartment's exact interior size in mm** (computed from your divider positions + thickness, not just raw percentages)
  - **Box custom holes** — face, shape, size (or slot W×L), and position for each one
  - **Finger slots**, if enabled
  - **Lid or sleeve** — cap/lip dimensions and tolerance, or sleeve outer size and sliding fit; hinge specs (count, barrel/pin diameter) if present; engraved/embossed text details; lid cutout pattern; lid custom holes table
  - **3D print files** — the exact STL filenames it'll produce, so the sheet and the files stay matched up
  - A short note on the PLA weight assumption and a reminder to verify tolerances before printing

## 2026-08-10

### Added
- **Custom holes for lids.** The Lid tab now supports individually placed custom holes, mirroring the Box tab's custom-hole workflow. Each hole can be configured by **shape, size, and position** (Width % / Depth %).
- **Lid custom-hole geometry.** Added a `LidCustomHole` type and `makeLidCustomHole()` factory, plus `lidCustomHoleCutouts()` to punch holes through the lid cap in the lid's own Z frame. Holes remain inside the same safe region used by lid cutout patterns: inside the lip for friction-fit lids and inset from the edge for hinged lids.
- **Text-safe lid holes.** Custom lid holes that would overlap the engraved/embossed text patch are skipped so the text area remains intact.
- **Combined lid cutouts.** `generateLid()` now combines pattern holes and custom holes before subtracting them from the lid geometry.
- **Project persistence for lid holes.** Added `lidCustomHoles: []` to project defaults and normalization/sanitization so saved, shared, and imported projects load safely. Older projects without the field automatically default to an empty custom-hole list.
- **Lid Custom Holes controls.** Added controls and handlers to add, update, and remove custom lid holes. The section appears below Cutout Pattern in the Lid tab and is hidden for drawer-sleeve lids because sleeves do not have a cap.

- **Independent slot dimensions for Custom Holes.** In both **Box → Custom Holes** and **Lid → Custom Holes**, selecting **Slots** now reveals a **Set width & length separately** option. When unchecked, the existing single **Size (mm)** control remains unchanged; when checked, it is replaced by independent **Width (2–80 mm)** and **Length (2–40 mm)** controls for creating long/thin or short/wide slots. Other hole shapes are unaffected.

## 2026-07-20

### Fixed
- **Interior height now accounts for the friction lid's lip.** With a cap-style
  (non-hinged) lid enabled, the lip hangs `lidHeight` mm down into the box, so
  the "Usable interior" readout subtracts it and "Generate with Compartments"
  adds it to the box height. Previously boxes auto-sized to an item height were
  too short by exactly the lip depth — the lid pressed on the contents (reported
  by a user sizing boxes for sleeved cards). Hinged lids (flat, no lip) and
  sleeve-style covers are unaffected. Help text in both places explains the
  lip adjustment when it applies.

## 2026-07-17

### Fixed
- **Finger slots no longer collide with crossing dividers.** With divisions in
  both X and Z, the notches used to sit at one global position per axis, so
  the aligned channel carved chunks out of perpendicular dividers and their
  junctions. Each wall is now split into open spans at every crossing divider
  and each span gets its own notch, kept 0.5 mm clear of divider faces,
  corners and junctions. The Slot Position % applies within each span
  (50% = centred per compartment), and slot width clamps to what fits in the
  narrowest span.

### Added
- **Divider notches are optional.** A new "Notch divider walls too" checkbox
  in the Finger Slots section (shown when slots touch an axis that has
  dividers, on by default) lets you keep divider walls solid and notch only
  the outer walls. Older saved projects keep the previous behaviour.
- Two `check:stl` sweep configurations covering the X+Z divider grid with
  per-span slots, and the outer-walls-only toggle — all 29 pass.

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
