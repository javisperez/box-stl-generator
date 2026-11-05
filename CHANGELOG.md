# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
with date-based entries since the project has no version releases.

## 2026-10-27

### Changed
- **Redesigned the app shell: dark theme, top bar, and three sidebar tabs.**
  The sidebar's Generator / Box / Lid / Settings tabs are now **Box / Lid /
  Print**. The Volume, Compartment and Division calculators moved into a
  "Start from…" dialog at the top of the Box tab (they only overwrite the box
  size once, so they no longer need a tab). Projects, share link and JSON
  import/export moved into a project dropdown and a `⋯` menu in a new top bar,
  along with the main Export button. Box and Lid controls sit in collapsible
  groups that show a one-line summary when closed, long explanations became
  info tooltips, and the lid checkbox + style buttons + hinge checkbox became a
  single `None / Lid / Sleeve / Hinged` control. The theme is dark-only with a
  coral accent; the width, depth and height sliders use per-axis colours. The
  floating per-part export cards were replaced by a small weight pill, and
  per-part export now lives on the Print tab, which also gained a PLA / PETG /
  ABS selector for the weight estimate. The credits line (Javis Perez &
  Claude, source on GitHub, Apache 2.0 license, and the Ko-fi button) is pinned at
  the bottom of the sidebar so it is always visible. No generator behaviour
  changed.
- **Added a project manager page.** Clicking the project name in the top bar
  (not the arrow beside it, which still opens the quick menu) swaps the
  workbench for a grid of project cards. Each card has a small isometric sketch
  at the box's real proportions, its size, compartment count and closure type,
  and when it was saved, with Open, Duplicate and Delete actions. The box
  currently in the editor shows as "In the editor", and a dashed card appears
  for unsaved work so it can be named and saved or updated from there. The page
  also has search (by name or size), Recent/Name sorting, New project, Import
  JSON and Export all. The 3D view stays loaded underneath, so the camera is
  where you left it when you return.
- **Added a top-view divider editor.** The Box tab's new Dividers group draws a
  plan of the box with every divider on it. Drag a divider to move it (or focus
  it and use the arrow keys, Shift for bigger steps, Delete to remove), add one
  along the width or depth with the buttons below, and use the spacing button to
  even them out or clear them all (it asks first when there are more than
  two). A Visual / Numbers switch lets you type each divider's position in mm
  from the left or front wall instead, with the resulting clear compartment
  sizes listed underneath. Each cell shows its clear size in mm, and width and depth
  dividers use the same amber and green as the size sliders. Dividers can't be
  dragged past their neighbours. This replaces the two "Dividers along…" count
  sliders and the per-divider position sliders; the divider thickness slider
  moved into the same group, and "Walls and dividers" is now just "Walls".
- **Added an isometric view with dimension rulers.** A Perspective / Isometric
  switch sits at the top-left of the 3D view (and is remembered). Isometric
  uses an orthographic camera on the true 45° / 35.3° diagonal, auto-zoomed to
  fit the box and any lid beside it; dragging pans instead of rotating, so the
  angle stays put. In that view the box gets width, depth and height rulers
  with extension lines and labels in the same amber, green and blue as the size
  sliders. A lid, sleeve or hinged lid lying beside the box gets its own set,
  measured from the actual part, with the height ruler on the far corner to
  stay clear of the box's. A lid or hinged lid only shows its height, since its
  width and depth match the box; a sleeve also shows its own width and depth,
  which are larger than the box's. Perspective
  keeps the free-orbit camera and the corner size readout. Both cameras stay
  loaded and the switch only changes which one is active, so going back to
  perspective returns to the same angle and zoom you left.
- **Finger slots in the outer walls are now optional.** Under Finger slots on
  the Box tab, a new "Notch outer walls" switch (on by default, so existing
  projects are unchanged) can be turned off to cut the slots in the dividers
  only and keep the outside of the box solid. The existing divider switch is now
  just "Notch divider walls"; if both are off, the panel says there is nothing
  to notch. Cutout patterns no longer keep clear of slot areas on walls that
  aren't notched. Three new cases (dividers only, dividers only with a pattern,
  both off) were added to the mesh-integrity sweep, and all 32 cases pass.
- **Dividers can now be lower than the box top.** With at least one divider on
  the Box tab, a "Divider height" slider (in mm from the floor) appears under
  Divider. It sits at full height by default, flush with the rim, and that
  default tracks the box height; any lower value fixes the dividers at that
  height. The same height applies to every divider. Where a lowered divider
  meets a wall, the wall continues up above it, and the box stays a single
  watertight mesh. A friction lid's lip skips the divider notches when the
  dividers end below the bottom of the lip, and finger-slot cuts skip dividers
  that end below the slot floor. A box with full-height dividers is exactly the
  mesh it was before, which I checked by comparing the old and new generators.
  Seven cases were added to the mesh-integrity sweep (39 now, all passing).
- **Replaced "Resize box to fill plate" with auto-arrange.** The Print tab now
  has an "Auto-arrange parts" switch (on by default) in place of the button that
  stretched the box to 80% of the plate. With it on, the preview lays the box and
  its lid or sleeve next to each other, centred on the plate. It tries side by
  side first, then front to back, and turns a part a quarter turn only when that
  is what makes the pair fit, preferring the fewest turns. The fit message now
  covers the parts together: if each fits alone but not both at once it says so
  in amber ("print them one at a time"), and the red warning stays for a part
  that is too big on its own. In isometric view the rulers follow a turned part
  (a ruler is coloured for what it measures, width or depth, not for the axis it
  runs along). Exported STL files are unchanged. Five new checks cover the
  arrangement (72 in all).
- **Added a "Rounded bottom" switch for finger slots.** With finger slots on, the
  new switch (off by default, so existing projects keep their square notches)
  turns each notch into a U: the bottom corners are rounded with a radius of up
  to half the slot width, so a slot whose width is twice its depth ends in a full
  semicircle, and a shallow slot just gets softened corners. It applies to the
  outer walls and the dividers alike. The notch is cut as one flat outline pushed
  through the wall rather than a box plus a cylinder, which keeps the mesh clean.
  A new check measures the material removed against the exact notch area, and six
  more mesh cases cover it (67 checks in all).
- **Added a "Cutouts in the dividers" switch.** When a cutout pattern is set
  and the box has dividers, this switch (off by default, so nothing changes for
  existing projects) punches the same pattern through the divider walls too. The
  holes stay clear of the outer walls, the floor, the divider's top edge (so
  lowered dividers work), every crossing divider, and any finger-slot notch cut
  into that divider, so a hole is never sliced open into a partial cut. Dividers
  too short or too narrow to hold a hole are left solid. Ten cases covering all
  six pattern shapes, crossing dividers, a chamfer, lowered dividers, finger
  slots and 0.6 mm dividers were added to the mesh-integrity sweep (56 checks,
  all passing).
- **Added a "Cutouts in the floor" switch.** When a cutout pattern is set on
  the box, this switch (on by default, so nothing changes for existing
  projects) can be turned off to leave the bottom flat and solid, for better bed
  adhesion and a clean underside. The walls still get their pattern.

- **Relicensed from MPL 2.0 to Apache 2.0.** Added the standard Apache 2.0
  `LICENSE` and a `NOTICE` file carrying the project's attribution, which
  anyone redistributing the software must preserve. `package.json` now
  declares the license and author. Versions published before this date stay
  available under MPL 2.0.

### Fixed
- **A leftover hinge setting kept the box's back wall solid.** Switching the
  closure from Hinged to None, or to a sleeve, turned the lid off but left the
  hinge flag on in the saved settings, and the box generator only looked at that
  flag. The back wall then stayed free of finger-slot notches and cutout-pattern
  holes (a rule meant to protect the hinge knuckle arms) with no hinge anywhere,
  and the "back wall stays solid" note kept showing. Only a real hinged lid
  keeps the back wall solid now. Four new checks cover it: a leftover flag with
  no lid, with a sleeve, for finger slots and for patterns, plus one confirming
  a real hinged lid still keeps its back wall solid. 60 checks in all.
- **"Start from" calculators gave compartments that were slightly off the
  sizes you entered.** The Divisions calculator converted each divider to a
  percentage of the outer depth, measured to the divider's far edge, but the
  generator measures across the interior to the divider's centreline, and
  positions were rounded to whole percents. Asking for 26 · 26 · 26 · 22 mm
  with 1 mm walls produced 27.3 · 24.8 · 25.8 · 22.2 mm. Positions are now
  computed from the front wall's inside face to the divider's centre and kept
  to two decimals, so the compartments come out exact. The Items calculator had
  the same flaw for three or more columns or rows, and it also assumed dividers
  as thick as the outer walls; it now uses the real divider thickness, which
  makes the box slightly smaller when dividers are thinner than the walls.
  Box and depth totals are no longer rounded to whole millimetres. New checks in
  `pnpm run check:stl` assert the exact clear sizes (and two new mesh cases cover
  the solid floor), 45 checks in all.

## 2026-09-28

### Changed
- **Switching dimension mode now adds/strips the fit tolerance instead of
  leaving it baked in.** Entering Interior mode loosens the current box by
  the tolerance amount (so the cavity field reads back exactly what you'd
  expect); leaving it strips that same gap back out, so an "Exterior" box
  never carries a leftover fit-tolerance gap it has no control for. The two
  are exact inverses — toggling back and forth without touching anything
  else is lossless.

### Fixed
- **Exterior mode's Width/Depth/Height sliders were capped too low.** Their
  max bound kept subtracting the wall thickness and interior tolerance even
  after switching out of interior mode, so the outer size couldn't be pushed
  past roughly `plate size − walls − tolerance`. Those terms now only apply
  to the slider bounds while interior mode is active; exterior mode's max is
  the plain plate size again.
- **Floating-point drift in the interior-mode outer size.** Repeated
  tolerance/wall-thickness edits in interior mode nudged width/depth/height
  by small deltas that accumulated binary rounding error (e.g.
  `126.89999999999988` instead of `126.9`). Those derived values are now
  rounded to 2 decimals, and the on-canvas dimension readout is formatted to
  1 decimal as a safety net.

### Added
- **Interior-dimension entry mode.** A new "Dimensions are" toggle on the Box
  tab switches Width/Depth/Height between the existing outer-size entry and a
  new interior mode, where the fields are the target cavity size (e.g. a
  measured deck of cards) and the outer size is computed for you — no more
  boxes coming out exactly content-sized with nothing left for the walls. A
  paired Tolerance slider (default 0.3 mm) adds extra clearance on top of the
  entered size to loosen or tighten the fit; changing it, or the wall
  thickness, in interior mode keeps the entered cavity size fixed and adjusts
  the outer size instead. `width`/`depth`/`height` in saved projects always
  remain the outer size — the mode and tolerance are stored alongside them
  and only affect how the Box tab fields are entered.

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
