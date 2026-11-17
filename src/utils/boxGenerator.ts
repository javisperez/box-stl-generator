import { primitives, booleans, transforms, extrusions, geometries, measurements } from '@jscad/modeling'
import * as THREE from 'three'

const { cuboid, polygon, cylinder, circle, rectangle } = primitives
const { subtract, union } = booleans
const { translate, mirrorX, rotate } = transforms
const { extrudeLinear, extrudeRotate } = extrusions
const { geom3 } = geometries
const { measureBoundingBox } = measurements

export type LidPattern = 'none' | 'circles' | 'squares' | 'diamonds' | 'hexagons' | 'triangles' | 'slots'

export type FingerSlotAxes = 'none' | 'x' | 'z' | 'both'

export const LID_PATTERNS: { value: LidPattern; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'circles', label: 'Circles' },
  { value: 'squares', label: 'Squares' },
  { value: 'diamonds', label: 'Diamonds' },
  { value: 'hexagons', label: 'Hexagons' },
  { value: 'triangles', label: 'Triangles' },
  { value: 'slots', label: 'Slots' },
]

export interface BoxParams {
  width: number
  depth: number
  height: number
  dimensionMode: 'exterior' | 'interior' // UI-only: how the Box tab's W/D/H fields are entered — width/depth/height always store the outer size
  interiorTolerance: number // UI-only: extra clearance added to the interior cavity when dimensionMode is 'interior'
  wallThickness: number
  includeLid: boolean
  lidHeight: number      // height of the lip that hangs into the box
  lidTolerance: number   // gap between lid lip and box inner wall for printer fit
  divisionsX: number[]   // divider positions as percentages (1-99) along inner width
  divisionsZ: number[]   // divider positions as percentages (1-99) along inner depth
  divisionThickness: number // divider wall thickness in mm (clamped to [0.4, wallThickness])
  lidText: string
  lidTextDepth: number
  lidTextSize: number
  lidTextStyle: 'engraved' | 'embossed'
  lidTextRotation: number // degrees CCW on the lid/sleeve top: 0 | 90 | 180 | 270
  lidPattern: LidPattern       // cutout pattern through the lid cap / sleeve walls
  lidPatternSize: number       // feature size across, in mm
  lidPatternSpacing: number    // gap between features, in mm
  boxPattern: LidPattern       // cutout pattern through the box's 4 outer side walls
  boxPatternSize: number       // feature size across, in mm
  boxPatternSpacing: number    // gap between features, in mm
  boxPatternFloor: boolean     // also cut the pattern through the floor (off = keep the base flat and solid)
  boxPatternDividers: boolean  // also cut the pattern through the divider walls
  fingerSlotAxes: FingerSlotAxes // finger-access notches cut down from the top edge
  fingerSlotWidth: number      // notch width along the wall, in mm
  fingerSlotDepth: number      // how far down from the top edge, in mm
  fingerSlotPosition: number   // notch centre as % along each open span (50 = centred)
  fingerSlotDividers: boolean  // also notch divider walls, not just the outer walls
  fingerSlotWalls: boolean     // notch the outer walls (off = notch the dividers only)
  fingerSlotRound: boolean     // round the bottom of each notch (U-shaped) instead of cutting it square
  dividerHeight: number        // divider height above the floor in mm; 0 = full height (flush with the rim)
  chamferSize: number        // 45° chamfer on outer vertical edges (0 = none)
  includeHinge: boolean
  hingeCount: number         // number of hinges along the back edge (1–3)
  hingeDiameter: number      // outer barrel diameter in mm
  hingePinDiameter: number   // pin hole diameter in mm
  lidStyle: 'lid' | 'sleeve' // 'lid' = cap with lip; 'sleeve' = open-front cover the box slides into
  sleeveTolerance: number    // gap between box and sleeve interior for sliding fit
  sleeveCutout: boolean      // finger notches at the sleeve opening to grab the box
  sleeveAxis: SleeveAxis     // axis the box slides along inside the sleeve (the sleeve is open at one end of it)
  gridfinity: boolean        // box is a Gridfinity bin: size snaps to the grid and a foot is added
  gridX: number              // bin footprint in grid cells (42 mm pitch)
  gridY: number
  gridUnits: number          // bin height in 7 mm units (includes the foot)
  baseplateX: number         // baseplate size in cells (separate printable part)
  baseplateY: number
  hingeInsertDepth: number   // hinged lid: depth of the rim under the lid that seats inside the box (0 = flat)
}

// width = X, depth = Y, height = Z. Which end is open doesn't matter: the
// mirrored sleeve is the same part turned around.
export type SleeveAxis = 'width' | 'depth' | 'height'
export const SLEEVE_AXES: SleeveAxis[] = ['width', 'depth', 'height']

// The deepest insert rim that still lets a hinged lid open. The lid swings about
// an axis behind the back wall, so rim points below that axis move toward the
// FRONT wall while the lid starts to lift. The rim only has the fit tolerance to
// spare, so a deep rim on a tight fit would bind. Found by sweeping the rim's
// front face through the opening arc (the same model as hingeRimBackLimit).
export function hingeInsertMax(params: BoxParams): number {
  const { depth, wallThickness: wt, lidTolerance: tol, hingeDiameter } = params
  const R = hingeDiameter / 2
  const yAxis = depth / 2 + R + HINGE_WALL_GAP
  const zs = R + HINGE_DROP - wt                 // slab underside, relative to the axis
  const yFrontWall = -depth / 2 + wt - yAxis     // front wall inner face, relative to the axis
  const yRim = yFrontWall + tol                  // rim's outer face
  const cap = Math.max(0, bodyHeight(params) - wt)
  for (let ins = Math.min(cap, 30); ins > 0; ins -= 0.25) {
    let clear = true
    for (let z = zs - ins; z <= zs + 1e-6 && clear; z += 0.25) {
      for (let deg = 0.25; deg <= 100; deg += 0.25) {
        const th = (deg * Math.PI) / 180
        const yp = yRim * Math.cos(th) + z * Math.sin(th)
        const zp = -yRim * Math.sin(th) + z * Math.cos(th)
        if (yp < yFrontWall + 0.1 && zp < zs) { clear = false; break }
      }
    }
    if (clear) return Math.round(ins * 4) / 4
  }
  return 0
}

// Depth of the rim that drops into the box under a hinged lid (0 = plain slab)
export function hingeInsertDepth(params: BoxParams): number {
  if (!hasHinge(params)) return 0
  const d = Number(params.hingeInsertDepth)
  if (!Number.isFinite(d) || d <= 0) return 0
  return Math.min(d, bodyHeight(params) - params.wallThickness, hingeInsertMax(params))
}

// ── Gridfinity ────────────────────────────────────────────────────────────────
// 42 mm pitch, bins are 0.5 mm smaller than the pitch, 7 mm per height unit.
// A bin's total height includes its 4.75 mm foot; no stacking lip is modelled.
export const GF_PITCH = 42
export const GF_CLEARANCE = 0.5
export const GF_UNIT = 7
const GF_FOOT_H = 4.75        // foot profile height
const GF_COLUMN = 0.3         // straight section between the foot and the body (keeps edges off shared planes)
export const GF_BASE_H = 4.65 // baseplate height

// Height of the box body proper, above the foot
export function bodyHeight(params: BoxParams): number {
  return params.gridfinity ? params.height - GF_FOOT_H - GF_COLUMN : params.height
}

// The size the bin is locked to while Gridfinity is on
export function gridfinityDims(params: BoxParams): { width: number; depth: number; height: number } {
  return {
    width: params.gridX * GF_PITCH - GF_CLEARANCE,
    depth: params.gridY * GF_PITCH - GF_CLEARANCE,
    height: params.gridUnits * GF_UNIT,
  }
}

// Overwrite width/depth/height with the grid size (exterior mode) when Gridfinity is on
export function applyGridfinity(params: BoxParams): BoxParams {
  if (!params.gridfinity) return params
  return { ...params, ...gridfinityDims(params), dimensionMode: 'exterior' }
}

// Divider walls must stay printable and can never exceed the outer wall thickness
export function clampDivisionThickness(divisionThickness: number, wallThickness: number): number {
  const dt = Number.isFinite(divisionThickness) ? divisionThickness : wallThickness
  return Math.min(Math.max(dt, 0.4), wallThickness)
}

// The hinge flag lingers in saved settings after the closure changes to none
// or a sleeve, so "is there a hinge" must also check the lid itself. Only a
// real hinged lid keeps the box's back wall solid for the knuckle arms.
export function hasHinge(params: BoxParams): boolean {
  return params.includeLid && params.lidStyle === 'lid' && params.includeHinge
}

// Effective divider height above the floor. Anything 0, invalid, or not below
// the rim means full height — the default, which is flush with the box top.
export function dividerHeightMm(params: BoxParams): number {
  const full = bodyHeight(params) - params.wallThickness
  const dh = Number(params.dividerHeight)
  if (!Number.isFinite(dh) || dh <= 0 || dh >= full - 0.01) return full
  return Math.max(dh, 1)
}

export function dividersLowered(params: BoxParams): boolean {
  return dividerHeightMm(params) < bodyHeight(params) - params.wallThickness
}

// A friction lid's lip hangs down from the rim. Dividers shorter than the lip
// bottom never touch it, so the lip needs no notches for them.
function dividersReachLip(params: BoxParams): boolean {
  if (!dividersLowered(params)) return true
  const lip = hasHinge(params) ? hingeInsertDepth(params) : Math.min(params.lidHeight, bodyHeight(params) - params.wallThickness)
  return params.wallThickness + dividerHeightMm(params) > bodyHeight(params) - lip + 0.01
}

// Shift a box geometry (plain polygons or CSG geom3) along Z
function shiftZ(g: any, dz: number): any {
  if (g && g.transforms) return translate([0, 0, dz], g)
  return { polygons: g.polygons.map((poly: any) => ({ vertices: poly.vertices.map(([x, y, z]: number[]) => [x, y, z + dz]) })) }
}

export function generateBox(params: BoxParams) {
  if (!params.gridfinity) return generateBoxBody(params)
  // Total height includes the foot: the body is the same box, just shorter and
  // lifted so the whole bin stays centred on the origin.
  const bh = bodyHeight(params)
  const body = generateBoxBody({ ...params, height: bh, gridfinity: false })
  return shiftZ(body, (params.height - bh) / 2)
}

// Direct geometry construction — no CSG, guaranteed manifold
function generateBoxBody(params: BoxParams) {
  const { width, depth, height, wallThickness, divisionsX, divisionsZ, divisionThickness, chamferSize } = params
  const w2 = width / 2, d2 = depth / 2, h2 = height / 2
  const wt = wallThickness
  const dt = clampDivisionThickness(divisionThickness, wt)
  const c = Math.min(chamferSize, wt, width / 4, depth / 4) // clamped chamfer
  const iw = width - 2 * wt, id = depth - 2 * wt
  const iw2 = iw / 2, id2 = id / 2
  const fl = -h2 + wt // floor Z
  // Divider top Z. Exactly h2 (not recomputed) when dividers are full height,
  // so the default mesh is bit-for-bit what it was before this option existed.
  const lowered = dividersLowered(params)
  const dz = lowered ? fl + dividerHeightMm(params) : h2

  // Divider positions (absolute coords)
  const xDivs = [...divisionsX].sort((a, b) => a - b).map(p => -iw2 + (p / 100) * iw)
  const yDivs = [...divisionsZ].sort((a, b) => a - b).map(p => -id2 + (p / 100) * id)

  // Breakpoints: inner area split at divider edges
  const xIn: number[] = [-iw2]
  for (const x of xDivs) { xIn.push(x - dt / 2, x + dt / 2) }
  xIn.push(iw2)
  const yIn: number[] = [-id2]
  for (const y of yDivs) { yIn.push(y - dt / 2, y + dt / 2) }
  yIn.push(id2)

  // Collapse breakpoints that coincide (e.g. chamfer == wall thickness makes
  // -w2+c equal -iw2). A duplicated breakpoint would emit zero-width cells —
  // zero-area polygons whose plane is null, which poison the CSG tree when a
  // cutout pattern is subtracted (every hole lining gets dropped).
  const dedupe = (bps: number[]) => bps.filter((v, i) => i === 0 || v - bps[i - 1] > 1e-9)

  // Full breakpoints (outer + inner)
  const xAll = dedupe([-w2, ...xIn, w2])
  const yAll = dedupe([-d2, ...yIn, d2])

  // Chamfer breakpoints (add intermediate points for chamfer edges)
  const xAllC = c > 0 ? dedupe([-w2, -w2 + c, ...xIn, w2 - c, w2]) : xAll
  const yAllC = c > 0 ? dedupe([-d2, -d2 + c, ...yIn, d2 - c, d2]) : yAll

  type V = [number, number, number]
  const polys: { vertices: V[] }[] = []

  // Check if a cell midpoint falls inside a divider
  const isXDiv = (a: number, b: number) =>
    xDivs.some(x => Math.abs((a + b) / 2 - x) < dt / 2 - 0.001)
  const isYDiv = (a: number, b: number) =>
    yDivs.some(y => Math.abs((a + b) / 2 - y) < dt / 2 - 0.001)

  // Helper: emit grid of quads on a plane
  // makeVerts returns 4 vertices in CCW order (outward normal via right-hand rule)
  function grid(
    uB: number[], vB: number[],
    make: (u0: number, u1: number, v0: number, v1: number) => V[],
    skip?: (u0: number, u1: number, v0: number, v1: number) => boolean
  ) {
    for (let i = 0; i < uB.length - 1; i++)
      for (let j = 0; j < vB.length - 1; j++) {
        if (skip?.(uB[i], uB[i + 1], vB[j], vB[j + 1])) continue
        polys.push({ vertices: make(uB[i], uB[i + 1], vB[j], vB[j + 1]) })
      }
  }

  // Helper: check if a coordinate is at the outer boundary
  const atMinX = (x: number) => Math.abs(x - (-w2)) < 0.001
  const atMaxX = (x: number) => Math.abs(x - w2) < 0.001
  const atMinY = (y: number) => Math.abs(y - (-d2)) < 0.001
  const atMaxY = (y: number) => Math.abs(y - d2) < 0.001

  if (c > 0) {
    // === CHAMFERED OUTER FACES ===

    // Bottom (N = -Z) — corner cells become pentagons
    for (let i = 0; i < xAllC.length - 1; i++) {
      for (let j = 0; j < yAllC.length - 1; j++) {
        const x0 = xAllC[i], x1 = xAllC[i + 1], y0 = yAllC[j], y1 = yAllC[j + 1]
        // Identify corner cells (first/last in both x and y)
        const isFirstX = i === 0, isLastX = i === xAllC.length - 2
        const isFirstY = j === 0, isLastY = j === yAllC.length - 2
        if (isFirstX && isFirstY) {
          // Bottom-left corner: cut (-w2,-d2) → pentagon
          polys.push({ vertices: [[x1,y0,-h2],[x0,y1,-h2],[x1,y1,-h2]] })
        } else if (isLastX && isFirstY) {
          // Bottom-right corner
          polys.push({ vertices: [[x0,y0,-h2],[x0,y1,-h2],[x1,y1,-h2]] })
        } else if (isFirstX && isLastY) {
          // Top-left corner
          polys.push({ vertices: [[x0,y0,-h2],[x1,y1,-h2],[x1,y0,-h2]] })
        } else if (isLastX && isLastY) {
          // Top-right corner
          polys.push({ vertices: [[x0,y0,-h2],[x0,y1,-h2],[x1,y0,-h2]] })
        } else {
          // Regular quad
          polys.push({ vertices: [[x0,y0,-h2],[x0,y1,-h2],[x1,y1,-h2],[x1,y0,-h2]] })
        }
      }
    }

    // Front wall (N = -Y) — trimmed: x from -w2+c to w2-c
    grid(xAllC, [-h2, h2], (x0, x1, z0, z1) => [[x0,-d2,z0],[x1,-d2,z0],[x1,-d2,z1],[x0,-d2,z1]],
      (x0, x1) => atMinX(x0) || atMaxX(x1))
    // Back wall (N = +Y)
    grid(xAllC, [-h2, h2], (x0, x1, z0, z1) => [[x1,d2,z0],[x0,d2,z0],[x0,d2,z1],[x1,d2,z1]],
      (x0, x1) => atMinX(x0) || atMaxX(x1))
    // Right wall (N = +X) — trimmed: y from -d2+c to d2-c
    grid(yAllC, [-h2, h2], (y0, y1, z0, z1) => [[w2,y0,z0],[w2,y1,z0],[w2,y1,z1],[w2,y0,z1]],
      (y0, y1) => atMinY(y0) || atMaxY(y1))
    // Left wall (N = -X)
    grid(yAllC, [-h2, h2], (y0, y1, z0, z1) => [[-w2,y1,z0],[-w2,y0,z0],[-w2,y0,z1],[-w2,y1,z1]],
      (y0, y1) => atMinY(y0) || atMaxY(y1))

    // 4 chamfer face strips (vertical, full height), CCW from outside so the
    // normal points outward — a flipped strip inverts the CSG tree's in/out
    // classification for everything behind its (infinite) plane, which
    // silently deletes every pattern-hole lining when a chamfer is active
    // Front-left: outward normal (-1,-1,0)/√2
    polys.push({ vertices: [[-w2,-d2+c,-h2],[-w2+c,-d2,-h2],[-w2+c,-d2,h2],[-w2,-d2+c,h2]] })
    // Front-right: outward normal (1,-1,0)/√2
    polys.push({ vertices: [[w2-c,-d2,-h2],[w2,-d2+c,-h2],[w2,-d2+c,h2],[w2-c,-d2,h2]] })
    // Back-right: outward normal (1,1,0)/√2
    polys.push({ vertices: [[w2,d2-c,-h2],[w2-c,d2,-h2],[w2-c,d2,h2],[w2,d2-c,h2]] })
    // Back-left: outward normal (-1,1,0)/√2
    polys.push({ vertices: [[-w2+c,d2,-h2],[-w2,d2-c,-h2],[-w2,d2-c,h2],[-w2+c,d2,h2]] })
  } else {
    // === ORIGINAL OUTER FACES (no chamfer) ===
    // Bottom (N = -Z)
    grid(xAll, yAll, (x0, x1, y0, y1) => [[x0,y0,-h2],[x0,y1,-h2],[x1,y1,-h2],[x1,y0,-h2]])
    // Front (N = -Y)
    grid(xAll, [-h2, h2], (x0, x1, z0, z1) => [[x0,-d2,z0],[x1,-d2,z0],[x1,-d2,z1],[x0,-d2,z1]])
    // Back (N = +Y)
    grid(xAll, [-h2, h2], (x0, x1, z0, z1) => [[x1,d2,z0],[x0,d2,z0],[x0,d2,z1],[x1,d2,z1]])
    // Right (N = +X)
    grid(yAll, [-h2, h2], (y0, y1, z0, z1) => [[w2,y0,z0],[w2,y1,z0],[w2,y1,z1],[w2,y0,z1]])
    // Left (N = -X)
    grid(yAll, [-h2, h2], (y0, y1, z0, z1) => [[-w2,y1,z0],[-w2,y0,z0],[-w2,y0,z1],[-w2,y1,z1]])
  }

  // === INNER FLOOR (N = +Z) ===
  grid(xIn, yIn,
    (x0, x1, y0, y1) => [[x0,y0,fl],[x1,y0,fl],[x1,y1,fl],[x0,y1,fl]],
    (x0, x1, y0, y1) => isXDiv(x0, x1) || isYDiv(y0, y1))

  // === INNER WALLS (split at divider edges) ===
  // Front inner (N = +Y)
  grid(xIn, [fl, dz],
    (x0, x1, z0, z1) => [[x1,-id2,z0],[x0,-id2,z0],[x0,-id2,z1],[x1,-id2,z1]],
    (x0, x1) => isXDiv(x0, x1))
  // Where a lowered divider meets this wall, the wall continues above the divider top
  if (lowered) grid(xIn, [dz, h2],
    (x0, x1, z0, z1) => [[x1,-id2,z0],[x0,-id2,z0],[x0,-id2,z1],[x1,-id2,z1]])
  // Back inner (N = -Y)
  grid(xIn, [fl, dz],
    (x0, x1, z0, z1) => [[x0,id2,z0],[x1,id2,z0],[x1,id2,z1],[x0,id2,z1]],
    (x0, x1) => isXDiv(x0, x1))
  // Where a lowered divider meets this wall, the wall continues above the divider top
  if (lowered) grid(xIn, [dz, h2],
    (x0, x1, z0, z1) => [[x0,id2,z0],[x1,id2,z0],[x1,id2,z1],[x0,id2,z1]])
  // Left inner (N = +X)
  grid(yIn, [fl, dz],
    (y0, y1, z0, z1) => [[-iw2,y0,z0],[-iw2,y1,z0],[-iw2,y1,z1],[-iw2,y0,z1]],
    (y0, y1) => isYDiv(y0, y1))
  // Where a lowered divider meets this wall, the wall continues above the divider top
  if (lowered) grid(yIn, [dz, h2],
    (y0, y1, z0, z1) => [[-iw2,y0,z0],[-iw2,y1,z0],[-iw2,y1,z1],[-iw2,y0,z1]])
  // Right inner (N = -X)
  grid(yIn, [fl, dz],
    (y0, y1, z0, z1) => [[iw2,y1,z0],[iw2,y0,z0],[iw2,y0,z1],[iw2,y1,z1]],
    (y0, y1) => isYDiv(y0, y1))
  // Where a lowered divider meets this wall, the wall continues above the divider top
  if (lowered) grid(yIn, [dz, h2],
    (y0, y1, z0, z1) => [[iw2,y1,z0],[iw2,y0,z0],[iw2,y0,z1],[iw2,y1,z1]])

  // === TOP SURFACE (N = +Z) — rim + divider tops ===
  if (c > 0) {
    const xT = xAllC, yT = yAllC
    for (let i = 0; i < xT.length - 1; i++) {
      for (let j = 0; j < yT.length - 1; j++) {
        const x0 = xT[i], x1 = xT[i + 1], y0 = yT[j], y1 = yT[j + 1]
        // Skip cavity openings (inside inner area, not on a divider)
        const inX = x0 >= -iw2 - 0.001 && x1 <= iw2 + 0.001
        const inY = y0 >= -id2 - 0.001 && y1 <= id2 + 0.001
        if (inX && inY && !isXDiv(x0, x1) && !isYDiv(y0, y1)) continue
        // Divider tops (inside the inner area) can sit below the rim
        const zt = inX && inY ? dz : h2

        const isFirstX = i === 0, isLastX = i === xT.length - 2
        const isFirstY = j === 0, isLastY = j === yT.length - 2
        if (isFirstX && isFirstY) {
          polys.push({ vertices: [[x1,y0,h2],[x1,y1,h2],[x0,y1,h2]] })
        } else if (isLastX && isFirstY) {
          polys.push({ vertices: [[x0,y0,h2],[x1,y1,h2],[x0,y1,h2]] })
        } else if (isFirstX && isLastY) {
          polys.push({ vertices: [[x0,y0,h2],[x1,y0,h2],[x1,y1,h2]] })
        } else if (isLastX && isLastY) {
          polys.push({ vertices: [[x0,y0,h2],[x1,y0,h2],[x0,y1,h2]] })
        } else {
          polys.push({ vertices: [[x0,y0,zt],[x1,y0,zt],[x1,y1,zt],[x0,y1,zt]] })
        }
      }
    }
  } else {
    grid(xAll, yAll,
      (x0, x1, y0, y1) => {
        const inX = x0 >= -iw2 - 0.001 && x1 <= iw2 + 0.001
        const inY = y0 >= -id2 - 0.001 && y1 <= id2 + 0.001
        const zt = inX && inY ? dz : h2 // divider tops can sit below the rim
        return [[x0,y0,zt],[x1,y0,zt],[x1,y1,zt],[x0,y1,zt]]
      },
      (x0, x1, y0, y1) => {
        // Keep rim (outside inner area) and divider tops; skip cavity openings
        const inX = x0 >= -iw2 - 0.001 && x1 <= iw2 + 0.001
        const inY = y0 >= -id2 - 0.001 && y1 <= id2 + 0.001
        if (!inX || !inY) return false // rim — keep
        return !isXDiv(x0, x1) && !isYDiv(y0, y1) // cavity — skip
      })
  }

  // === X-DIVIDER WALL FACES ===
  for (const xd of xDivs) {
    const xl = xd - dt / 2, xr = xd + dt / 2
    // Left face (N = -X)
    grid(yIn, [fl, dz],
      (y0, y1, z0, z1) => [[xl,y1,z0],[xl,y0,z0],[xl,y0,z1],[xl,y1,z1]],
      (y0, y1) => isYDiv(y0, y1))
    // Right face (N = +X)
    grid(yIn, [fl, dz],
      (y0, y1, z0, z1) => [[xr,y0,z0],[xr,y1,z0],[xr,y1,z1],[xr,y0,z1]],
      (y0, y1) => isYDiv(y0, y1))
  }

  // === Y-DIVIDER WALL FACES ===
  for (const yd of yDivs) {
    const yf = yd - dt / 2, yb = yd + dt / 2
    // Front face (N = -Y)
    grid(xIn, [fl, dz],
      (x0, x1, z0, z1) => [[x0,yf,z0],[x1,yf,z0],[x1,yf,z1],[x0,yf,z1]],
      (x0, x1) => isXDiv(x0, x1))
    // Back face (N = +Y)
    grid(xIn, [fl, dz],
      (x0, x1, z0, z1) => [[x1,yb,z0],[x0,yb,z0],[x0,yb,z1],[x1,yb,z1]],
      (x0, x1) => isXDiv(x0, x1))
  }

  let box: any = { polygons: polys }
  const holeSolids: any[] = []
  if (params.boxPattern !== 'none') {
    const wallHoles = boxWallHoles(params)
    const floorHoles = params.boxPatternFloor ? boxFloorHoles(params) : null
    const dividerHoles = params.boxPatternDividers ? boxDividerHoles(params) : null
    if (dividerHoles) holeSolids.push(dividerHoles)
    if (wallHoles) holeSolids.push(wallHoles)
    if (floorHoles) holeSolids.push(floorHoles)
  }
  const fingerSlots = fingerSlotCutouts(params)
  if (fingerSlots) holeSolids.push(fingerSlots)
  const holes = unionAll(holeSolids)
  if (holes) box = subtract(asGeom3(box), holes)
  return box
}

// ── Finger slots ──────────────────────────────────────────────────────────────
// Rectangular notches cut down from the top edge so fingers can pinch flat
// contents (cards, coins, tokens) out of a compartment. The 'x' axis notches
// every wall perpendicular to X — the left/right outer walls and (optionally)
// each X divider; 'z' does the same for the front/back walls and Z dividers.
// Perpendicular dividers split each wall into open spans, and every span gets
// its own notch, so a notch never lands on a divider junction or corner —
// with dividers in both X and Z the notches would otherwise carve chunks out
// of the crossing walls.

// Layout for one notch: centre along the wall, width, and bottom Z. Shared by
// the cutter and the wall-pattern exclusion rects so pattern holes never get
// sliced open at a notch border.
interface FingerSlotLayout { c: number; w: number; zBot: number }

function fingerSlotLayouts(params: BoxParams, axis: 'x' | 'z'): FingerSlotLayout[] {
  const { width, depth, height, wallThickness: wt, fingerSlotAxes } = params
  if (fingerSlotAxes !== axis && fingerSlotAxes !== 'both') return []

  const h2 = height / 2
  // Notches run along the inner cavity span so they never bite into the
  // perpendicular walls, corners, or chamfers. The small margin also keeps
  // cut planes clear of the chamfer faces and divider faces.
  const margin = 0.5
  const innerSpan = (axis === 'x' ? depth : width) - 2 * wt
  const dt = clampDivisionThickness(params.divisionThickness, wt)

  // Split the span at each perpendicular divider: one open span per segment.
  // X-axis notches run along the depth, so Z dividers cross them (and vice
  // versa). bounds always pairs up: [start, d1−, d1+, d2−, d2+, …, end].
  const perpDivs = axis === 'x' ? params.divisionsZ : params.divisionsX
  const bounds: number[] = [-innerSpan / 2]
  for (const pct of [...perpDivs].sort((a, b) => a - b)) {
    const p = -innerSpan / 2 + (pct / 100) * innerSpan
    bounds.push(p - dt / 2, p + dt / 2)
  }
  bounds.push(innerSpan / 2)

  // Depth stops 0.5 mm above the floor so the slot's bottom cut plane never
  // coincides with the inner-floor plane (coplanar CSG faces corrupt shells)
  const d = Math.min(Math.max(params.fingerSlotDepth, 2), height - wt - 0.5)
  const zBot = h2 - d
  const pct = Math.min(Math.max(params.fingerSlotPosition, 0), 100)

  const slots: FingerSlotLayout[] = []
  for (let i = 0; i < bounds.length - 1; i += 2) {
    const a = bounds[i] + margin, b = bounds[i + 1] - margin
    const usable = b - a
    if (usable <= 2) continue // span too narrow for a useful notch
    const w = Math.min(Math.max(params.fingerSlotWidth, 2), usable)
    const c = a + w / 2 + (pct / 100) * (usable - w)
    slots.push({ c, w, zBot })
  }
  return slots
}

// Outline of a notch in the wall plane (x = along the wall, y = world Z): open
// at the top, bottom corners rounded with radius rc. When rc is half the width
// the bottom is a full semicircle. One flat polygon, extruded straight through
// the wall — no shape-on-shape booleans for the cutter to get wrong.
function roundedSlotOutline(w: number, zBot: number, zTop: number, rc: number): [number, number][] {
  const steps = 10
  const hw = w / 2
  const pts: [number, number][] = []
  // Bottom edge and right arc: centre (hw - rc, zBot + rc), angle -90° → 0°
  for (let k = 0; k <= steps; k++) {
    const a = -Math.PI / 2 + (k / steps) * (Math.PI / 2)
    pts.push([hw - rc + rc * Math.cos(a), zBot + rc + rc * Math.sin(a)])
  }
  pts.push([hw, zTop], [-hw, zTop])
  // Left arc: centre (-hw + rc, zBot + rc), angle 180° → 270°
  for (let k = 0; k <= steps; k++) {
    const a = Math.PI + (k / steps) * (Math.PI / 2)
    pts.push([-hw + rc + rc * Math.cos(a), zBot + rc + rc * Math.sin(a)])
  }
  // A full semicircle makes the two arcs meet at the bottom: drop repeated points
  return pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-9)
}

function fingerSlotCutouts(params: BoxParams): any | null {
  const { width, depth, height, wallThickness: wt, divisionsX, divisionsZ, divisionThickness, fingerSlotDividers, fingerSlotWalls } = params
  const hinged = hasHinge(params)
  const w2 = width / 2, d2 = depth / 2, h2 = height / 2
  const dt = clampDivisionThickness(divisionThickness, wt)
  const iw = width - 2 * wt, id = depth - 2 * wt

  const zTop = h2 + 0.5 // overshoot above the rim — no coplanar top faces
  // Divider tops: a notch only matters where the divider rises above the slot floor
  const dividerTop = -h2 + wt + dividerHeightMm(params)
  const solids: any[] = []
  // One prism per wall, just thicker than the wall it notches (±0.5 overshoot
  // into air on both sides) so cut planes never coincide with wall faces
  const prism = (cx: number, cy: number, sx: number, sy: number, zBot: number) =>
    translate([cx, cy, (zTop + zBot) / 2], cuboid({ size: [sx, sy, zTop - zBot] }))

  // One notch through a wall or divider centred at (cx, cy). axis 'x' notches a
  // wall perpendicular to X (the notch runs along Y); 'z' one perpendicular to Y.
  // `thickness` is the cutter's depth through the wall.
  const slot = (axis: 'x' | 'z', cx: number, cy: number, thickness: number, w: number, zBot: number) => {
    // Corner radius: up to half the width, but never deeper than the notch itself
    const rc = Math.min(w / 2, h2 - zBot)
    if (!params.fingerSlotRound || rc < 0.3) {
      return axis === 'x' ? prism(cx, cy, thickness, w, zBot) : prism(cx, cy, w, thickness, zBot)
    }
    const shape = extrudeLinear({ height: thickness }, polygon({ points: roundedSlotOutline(w, zBot, zTop, rc) }))
    // Same orientations the cutout patterns use: X notches map (x,y,z) → (z,x,y),
    // so the shape's width runs along Y and the extrusion along X; Z notches
    // rotate 90° about X, so the extrusion runs along -Y
    return axis === 'x'
      ? translate([cx - thickness / 2, cy, 0], rotate([0, Math.PI / 2, 0], rotate([0, 0, Math.PI / 2], shape)))
      : translate([cx, cy + thickness / 2, 0], rotate([Math.PI / 2, 0, 0], shape))
  }

  for (const { c, w, zBot } of fingerSlotLayouts(params, 'x')) {
    if (fingerSlotWalls) {
      solids.push(slot('x', -w2 + wt / 2, c, wt + 1, w, zBot)) // left outer wall
      solids.push(slot('x', w2 - wt / 2, c, wt + 1, w, zBot))  // right outer wall
    }
    if (fingerSlotDividers && dividerTop - zBot > 0.05) {
      for (const pct of divisionsX) {
        const x = -iw / 2 + (pct / 100) * iw
        solids.push(slot('x', x, c, dt + 1, w, zBot))
      }
    }
  }

  for (const { c, w, zBot } of fingerSlotLayouts(params, 'z')) {
    if (fingerSlotWalls) {
      solids.push(slot('z', c, -d2 + wt / 2, wt + 1, w, zBot)) // front outer wall
      // The back wall carries the hinge knuckle arms — keep it solid then
      if (!hinged) solids.push(slot('z', c, d2 - wt / 2, wt + 1, w, zBot))
    }
    if (fingerSlotDividers && dividerTop - zBot > 0.05) {
      for (const pct of divisionsZ) {
        const y = -id / 2 + (pct / 100) * id
        solids.push(slot('z', c, y, dt + 1, w, zBot))
      }
    }
  }

  return unionAll(solids)
}

// ── Cutout patterns ───────────────────────────────────────────────────────────
// Grid of holes punched through the lid cap (or the sleeve's top and bottom
// walls) to save filament. Text always keeps a solid patch: holes that would
// intersect the text footprint are skipped, so engraved/embossed text sits on
// solid material.

interface Rect2 { x0: number; x1: number; y0: number; y1: number }

// 2D shape for one hole, centered at the origin. `size` is the across dimension.
// `flipped` (triangles only) builds the 180°-rotated shape from exact mirrored
// coordinates. It must NOT be produced with rotate([0, 0, Math.PI], …):
// Math.sin(Math.PI) is 1.2e-16, so a rotated prism is microscopically skewed,
// its CSG cut planes stop lining up with the straight-built geometry, and the
// T-junction repair on export can no longer pair the resulting vertices —
// which is exactly the "80 non-manifold edges" corruption slicers reported.
function patternShape2D(pattern: LidPattern, size: number, flipped = false): any | null {
  const r = size / 2
  switch (pattern) {
    case 'circles': return circle({ radius: r, segments: 20 })
    case 'squares': return rectangle({ size: [size, size] })
    case 'diamonds': return polygon({ points: [[r, 0], [0, r], [-r, 0], [0, -r]] })
    case 'hexagons': return circle({ radius: r, segments: 6 })
    case 'triangles': return flipped
      ? polygon({ points: [[0, -r], [r * 0.866, r / 2], [-r * 0.866, r / 2]] })
      : polygon({ points: [[0, r], [-r * 0.866, -r / 2], [r * 0.866, -r / 2]] })
    case 'slots': return rectangle({ size: [size * 2, size * 0.45] })
    default: return null
  }
}

// Half extents of a hole's footprint (grid fitting + exclusion tests)
function patternHalfExtents(pattern: LidPattern, size: number): [number, number] {
  return pattern === 'slots' ? [size, size * 0.225] : [size / 2, size / 2]
}

/**
 * Grid of (x, y) hole centers within a 2D region, honoring exclusion rects.
 * Shared by every cutout context (lid cap, sleeve walls, box walls) — each
 * maps these (u, v) coordinates into world space differently. Returns null
 * when the pattern is off or nothing fits. Rows are staggered by half a pitch
 * (except squares and slots); `alt` marks triangles that should point the
 * opposite way so they tessellate.
 */
function patternGrid(
  pattern: LidPattern, size: number, spacing: number, region: Rect2, exclusions: Rect2[]
): { x: number; y: number; alt: boolean }[] | null {
  const [hx, hy] = patternHalfExtents(pattern, size)
  let px = hx * 2 + spacing
  let py = hy * 2 + spacing

  const W = region.x1 - region.x0
  const D = region.y1 - region.y0
  if (W < hx * 2 || D < hy * 2) return null

  // Keep the live preview responsive: if the grid would be huge, widen the
  // pitch until the hole count is reasonable.
  const MAX_HOLES = 350
  let nx = Math.floor((W - hx * 2) / px) + 1
  let ny = Math.floor((D - hy * 2) / py) + 1
  if (nx * ny > MAX_HOLES) {
    const scale = Math.sqrt((nx * ny) / MAX_HOLES)
    px *= scale
    py *= scale
    nx = Math.floor((W - hx * 2) / px) + 1
    ny = Math.floor((D - hy * 2) / py) + 1
  }

  // Center the grid in the region
  const gridW = (nx - 1) * px + hx * 2
  const gridD = (ny - 1) * py + hy * 2
  const startX = region.x0 + (W - gridW) / 2 + hx
  const startY = region.y0 + (D - gridD) / 2 + hy

  const stagger = pattern !== 'squares' && pattern !== 'slots'
  const positions: { x: number; y: number; alt: boolean }[] = []
  for (let row = 0; row < ny; row++) {
    const y = startY + row * py
    const odd = row % 2 === 1
    const offset = stagger && odd ? px / 2 : 0
    const count = stagger && odd ? nx - 1 : nx
    for (let col = 0; col < count; col++) {
      const x = startX + col * px + offset
      if (exclusions.some((r) => x + hx > r.x0 && x - hx < r.x1 && y + hy > r.y0 && y - hy < r.y1)) continue
      positions.push({ x, y, alt: pattern === 'triangles' && (col + row) % 2 === 1 })
    }
  }
  return positions.length ? positions : null
}

// Tree-reduce union (pieces are disjoint, but jscad still wants one geometry)
function unionAll(geoms: any[]): any | null {
  if (geoms.length === 0) return null
  let current = geoms
  while (current.length > 1) {
    const next: any[] = []
    for (let i = 0; i < current.length; i += 2) {
      next.push(i + 1 < current.length ? union(current[i], current[i + 1]) : current[i])
    }
    current = next
  }
  return current[0]
}

/**
 * Build the union of all pattern hole prisms for the given region, spanning
 * zFrom..zTo (holes extrude straight through Z). Shared by the lid cap, the
 * sleeve's top/bottom walls, and the box floor.
 */
function zExtrudedPatternHoles(
  pattern: LidPattern, size: number, spacing: number, region: Rect2, zFrom: number, zTo: number, exclusions: Rect2[]
): any | null {
  if (pattern === 'none') return null
  const positions = patternGrid(pattern, size, spacing, region, exclusions)
  if (!positions) return null

  const shape = patternShape2D(pattern, size)
  if (!shape) return null
  const h = zTo - zFrom
  const prism = extrudeLinear({ height: h }, shape)
  const prismAlt = pattern === 'triangles'
    ? extrudeLinear({ height: h }, patternShape2D(pattern, size, true))
    : prism

  return unionAll(positions.map((p) => translate([p.x, p.y, zFrom], p.alt ? prismAlt : prism)))
}

function patternPrisms(params: BoxParams, region: Rect2, zFrom: number, zTo: number, exclusions: Rect2[]): any | null {
  return zExtrudedPatternHoles(
    params.lidPattern, Math.max(2, params.lidPatternSize), Math.max(1.5, params.lidPatternSpacing),
    region, zFrom, zTo, exclusions
  )
}

/**
 * Cutout pattern through the box's 4 outer side walls (front/back/left/right)
 * to save filament. Dividers have their own pass (boxDividerHoles) and the
 * floor another (boxFloorHoles). Each wall's holes are laid out in the wall's own (u, v) plane —
 * u = position along the wall, v = height — then a canonical Z-extruded
 * prism is rotated so it punches through the wall's actual thickness axis
 * (Y for front/back, X for left/right) before being translated into place.
 * Margins keep holes clear of the top rim, the floor, and the
 * corners/chamfers.
 *
 * When a hinge is present, the back wall is skipped: its top strip carries
 * the hinge knuckle mounting arms and needs to stay solid.
 */
function boxWallHoles(params: BoxParams): any | null {
  const { width, depth, height, wallThickness: wt, chamferSize, boxPattern } = params
  if (boxPattern === 'none') return null
  const hinged = hasHinge(params)

  const w2 = width / 2, d2 = depth / 2, h2 = height / 2
  const c = Math.min(chamferSize, wt, width / 4, depth / 4)
  const marginH = Math.max(c, 1) + 2   // clear of corners/chamfers
  const marginV = wt + 2               // clear of the top rim and floor

  const zTop = h2 - marginV
  const zBot = -h2 + marginV
  if (zTop <= zBot) return null

  const size = Math.max(2, params.boxPatternSize)
  const spacing = Math.max(1.5, params.boxPatternSpacing)
  const shape = patternShape2D(boxPattern, size)
  if (!shape) return null

  const h = wt + 1 // through-thickness, overshooting both faces slightly
  const prism = extrudeLinear({ height: h }, shape)
  const prismAlt = boxPattern === 'triangles'
    ? extrudeLinear({ height: h }, patternShape2D(boxPattern, size, true))
    : prism

  const solids: any[] = []

  // Keep pattern holes clear of the finger slots — a hole straddling a notch
  // border would be sliced open into a stress-raising partial cut
  const slotRects = (slots: FingerSlotLayout[]): Rect2[] =>
    slots.map(s => ({ x0: s.c - s.w / 2 - 1.5, x1: s.c + s.w / 2 + 1.5, y0: s.zBot - 1.5, y1: h2 + 1 }))
  // (only the outer walls hold pattern holes, so nothing to avoid when they aren't notched)
  const fbExclusions = params.fingerSlotWalls ? slotRects(fingerSlotLayouts(params, 'z')) : []
  const lrExclusions = params.fingerSlotWalls ? slotRects(fingerSlotLayouts(params, 'x')) : []

  // Front & back walls: u = X, v = Z, extrusion punches through Y
  const fbRegion: Rect2 = { x0: -w2 + marginH, x1: w2 - marginH, y0: zBot, y1: zTop }
  const fbPositions = patternGrid(boxPattern, size, spacing, fbRegion, fbExclusions)
  if (fbPositions) {
    // rotate 90° about X: (x,y,z) -> (x, -z, y) — z (extrusion) becomes Y, y (shape) stays as Z
    const fPrism = rotate([Math.PI / 2, 0, 0], prism)
    const fPrismAlt = rotate([Math.PI / 2, 0, 0], prismAlt)
    for (const p of fbPositions) {
      solids.push(translate([p.x, -d2 - 0.5 + h, p.y], p.alt ? fPrismAlt : fPrism))
    }
    if (!hinged) {
      // rotate -90° about X: (x,y,z) -> (x, z, -y)
      const bPrism = rotate([-Math.PI / 2, 0, 0], prism)
      const bPrismAlt = rotate([-Math.PI / 2, 0, 0], prismAlt)
      for (const p of fbPositions) {
        solids.push(translate([p.x, d2 + 0.5 - h, p.y], p.alt ? bPrismAlt : bPrism))
      }
    }
  }

  // Left & right walls: u = Y, v = Z, extrusion punches through X
  const lrRegion: Rect2 = { x0: -d2 + marginH, x1: d2 - marginH, y0: zBot, y1: zTop }
  const lrPositions = patternGrid(boxPattern, size, spacing, lrRegion, lrExclusions)
  if (lrPositions) {
    // compound rotate: (x,y,z) -> (z,x,y) — z (extrusion) becomes X, x/y (shape) become Y/Z
    const sPrism = rotate([0, Math.PI / 2, 0], rotate([0, 0, Math.PI / 2], prism))
    const sPrismAlt = rotate([0, Math.PI / 2, 0], rotate([0, 0, Math.PI / 2], prismAlt))
    const iw2 = w2 - wt
    for (const p of lrPositions) {
      solids.push(translate([-w2 - 0.5, p.x, p.y], p.alt ? sPrismAlt : sPrism)) // left
      solids.push(translate([iw2 - 0.5, p.x, p.y], p.alt ? sPrismAlt : sPrism)) // right
    }
  }

  return unionAll(solids)
}

/**
 * Cutout pattern through the divider walls. Each X divider is laid out in its
 * own (u = depth, v = height) plane and each Z divider in (u = width, v = height),
 * then the prism is rotated to punch through the divider's thickness — the
 * same technique as the outer walls. The grid stays clear of the outer walls,
 * the floor, the divider's own top edge (so lowered dividers work), every
 * crossing divider, and any finger-slot notch on that divider, so no hole is
 * ever sliced open into a partial cut.
 */
function boxDividerHoles(params: BoxParams): any | null {
  const { width, depth, height, wallThickness: wt, divisionsX, divisionsZ, boxPattern } = params
  if (boxPattern === 'none' || divisionsX.length + divisionsZ.length === 0) return null

  const h2 = height / 2
  const dt = clampDivisionThickness(params.divisionThickness, wt)
  const iw = width - 2 * wt, id = depth - 2 * wt
  const iw2 = iw / 2, id2 = id / 2
  const margin = 2      // clear of the outer walls, the floor, and the divider's top edge
  const crossGap = 1.5  // extra clearance beside a crossing divider

  const zBot = -h2 + wt + margin
  const zTop = -h2 + wt + dividerHeightMm(params) - margin
  if (zTop <= zBot) return null

  const size = Math.max(2, params.boxPatternSize)
  const spacing = Math.max(1.5, params.boxPatternSpacing)
  const shape = patternShape2D(boxPattern, size)
  if (!shape) return null

  const h = dt + 1 // through-thickness, overshooting both faces slightly
  const prism = extrudeLinear({ height: h }, shape)
  const prismAlt = boxPattern === 'triangles'
    ? extrudeLinear({ height: h }, patternShape2D(boxPattern, size, true))
    : prism

  const xs = [...divisionsX].sort((a, b) => a - b).map(p => -iw2 + (p / 100) * iw)
  const ys = [...divisionsZ].sort((a, b) => a - b).map(p => -id2 + (p / 100) * id)

  // A divider's finger-slot notches (if it gets any) are no-go zones too
  const notchRects = (slots: FingerSlotLayout[]): Rect2[] => params.fingerSlotDividers
    ? slots.map(s => ({ x0: s.c - s.w / 2 - 1.5, x1: s.c + s.w / 2 + 1.5, y0: s.zBot - 1.5, y1: h2 + 1 }))
    : []
  const crossing = (centres: number[]): Rect2[] =>
    centres.map(c => ({ x0: c - dt / 2 - crossGap, x1: c + dt / 2 + crossGap, y0: zBot - 1, y1: zTop + 1 }))

  const solids: any[] = []

  // X dividers: u = Y, v = Z, extrusion punches through X
  if (xs.length > 0) {
    const region: Rect2 = { x0: -id2 + margin, x1: id2 - margin, y0: zBot, y1: zTop }
    const positions = patternGrid(boxPattern, size, spacing, region, [...crossing(ys), ...notchRects(fingerSlotLayouts(params, 'x'))])
    if (positions) {
      // compound rotate: (x,y,z) -> (z,x,y) — z (extrusion) becomes X, x/y (shape) become Y/Z
      const sPrism = rotate([0, Math.PI / 2, 0], rotate([0, 0, Math.PI / 2], prism))
      const sPrismAlt = rotate([0, Math.PI / 2, 0], rotate([0, 0, Math.PI / 2], prismAlt))
      for (const x of xs) {
        for (const p of positions) solids.push(translate([x - dt / 2 - 0.5, p.x, p.y], p.alt ? sPrismAlt : sPrism))
      }
    }
  }

  // Z dividers: u = X, v = Z, extrusion punches through Y
  if (ys.length > 0) {
    const region: Rect2 = { x0: -iw2 + margin, x1: iw2 - margin, y0: zBot, y1: zTop }
    const positions = patternGrid(boxPattern, size, spacing, region, [...crossing(xs), ...notchRects(fingerSlotLayouts(params, 'z'))])
    if (positions) {
      // rotate 90° about X: (x,y,z) -> (x, -z, y) — z (extrusion) becomes -Y, y (shape) stays as Z
      const fPrism = rotate([Math.PI / 2, 0, 0], prism)
      const fPrismAlt = rotate([Math.PI / 2, 0, 0], prismAlt)
      for (const y of ys) {
        for (const p of positions) solids.push(translate([p.x, y - dt / 2 - 0.5 + h, p.y], p.alt ? fPrismAlt : fPrism))
      }
    }
  }

  return unionAll(solids)
}

/**
 * Cutout pattern through the box floor, straight through Z like the lid cap.
 * Confined to the inner cavity footprint (inset from the outer walls, which
 * sit on the floor's perimeter) with strips excluded under each divider —
 * both need solid floor beneath them to bond to.
 */
function boxFloorHoles(params: BoxParams): any | null {
  const { width, depth, height, wallThickness: wt, divisionsX, divisionsZ, divisionThickness, boxPattern } = params
  if (boxPattern === 'none') return null

  const h2 = height / 2
  const iw2 = width / 2 - wt
  const id2 = depth / 2 - wt
  const dt = clampDivisionThickness(divisionThickness, wt)
  const margin = 1.5 // clear of the inner wall faces

  const region: Rect2 = { x0: -iw2 + margin, x1: iw2 - margin, y0: -id2 + margin, y1: id2 - margin }

  const exclusions: Rect2[] = []
  for (const pct of divisionsX) {
    const x = -iw2 + (pct / 100) * (2 * iw2)
    exclusions.push({ x0: x - dt / 2 - margin, x1: x + dt / 2 + margin, y0: -id2 - 1, y1: id2 + 1 })
  }
  for (const pct of divisionsZ) {
    const y = -id2 + (pct / 100) * (2 * id2)
    exclusions.push({ x0: -iw2 - 1, x1: iw2 + 1, y0: y - dt / 2 - margin, y1: y + dt / 2 + margin })
  }

  return zExtrudedPatternHoles(
    boxPattern, Math.max(2, params.boxPatternSize), Math.max(1.5, params.boxPatternSpacing),
    region, -h2 - 0.5, -h2 + wt + 0.5, exclusions
  )
}

// A padded Rect2 around geometry's XY bounding box (for text exclusion zones)
function boundsRect(geom: any, pad: number, mirrorInX: boolean): Rect2 {
  const bb = measureBoundingBox(geom)
  let x0 = bb[0][0] - pad
  let x1 = bb[1][0] + pad
  if (mirrorInX) {
    const t = x0
    x0 = -x1
    x1 = -t
  }
  return { x0, x1, y0: bb[0][1] - pad, y1: bb[1][1] + pad }
}

// Direct-built geometry is a plain {polygons} object; booleans need a geom3
function asGeom3(g: any): any {
  return g && g.transforms ? g : geom3.create(g.polygons)
}

// Pattern holes for the lid cap, in the standard lid frame (cap Z ∈ [-wt, 0])
function lidPatternHoles(params: BoxParams, textGeometry?: any): any | null {
  const { width, depth, wallThickness: wt, lidTolerance: tol, includeHinge } = params
  const w2 = width / 2
  const d2 = depth / 2

  let region: Rect2
  if (includeHinge && hingeInsertDepth(params) <= 0) {
    // Flat slab: keep a solid border all around
    const inset = wt + 2
    region = { x0: -w2 + inset, x1: w2 - inset, y0: -d2 + inset, y1: d2 - inset }
  } else {
    // Friction lid: stay inside the lip's inner footprint so holes never cut
    // into the lip walls above the cap
    const ix = w2 - wt - tol - wt - 1.5
    const iy = d2 - wt - tol - wt - 1.5
    region = { x0: -ix, x1: ix, y0: -iy, y1: iy }
  }

  const exclusions: Rect2[] = []
  if (textGeometry) {
    // Lid text is mirrored in X (it reads through the flip)
    exclusions.push(boundsRect(textGeometry, 1.5, true))
  }
  return patternPrisms(params, region, -wt - 0.5, 0.5, exclusions)
}

// The insert rim hangs inside the box right against the back wall, while the lid
// swings about an axis BEHIND that wall. Rim points above the axis height move
// toward the wall as the lid opens, so the back of the rim would wedge into it.
// This finds how far forward (abs Y) the side rims must stop — and the back rim
// is dropped entirely — so the whole rim clears the wall for any wall thickness.
export function hingeRimBackLimit(params: BoxParams): number {
  const { depth, wallThickness: wt, lidTolerance: tol, hingeDiameter } = params
  const ins = hingeInsertDepth(params)
  const R = hingeDiameter / 2
  const d2 = depth / 2
  const yAxis = d2 + R + HINGE_WALL_GAP
  const zs = R + HINGE_DROP - wt            // slab underside, relative to the axis
  const yWall = -(R + HINGE_WALL_GAP + wt)  // back wall inner face, relative to the axis
  const nominal = (d2 - wt - tol) - yAxis   // rim's back face, relative to the axis
  const floorLimit = -d2 + 2 * wt + tol + 1 // never eat into the front rim
  for (let ye = nominal; yAxis + ye > floorLimit; ye -= 0.25) {
    let clear = true
    for (let z = zs - ins; z <= zs + 1e-6 && clear; z += 0.25) {
      for (let deg = 0.5; deg <= 100; deg += 0.5) {
        const th = (deg * Math.PI) / 180
        const yp = ye * Math.cos(th) + z * Math.sin(th)
        const zp = -ye * Math.sin(th) + z * Math.cos(th)
        if (yp > yWall - 0.2 && zp < zs) { clear = false; break }
      }
    }
    if (clear) return yAxis + ye
  }
  return floorLimit
}

export function generateLid(params: BoxParams, textGeometry?: any) {
  // Text requires CSG operations (subtract/union)
  let lid = textGeometry ? generateLidCSG(params, textGeometry) : generateFlatLid(params)
  if (params.lidPattern !== 'none') {
    const holes = lidPatternHoles(params, textGeometry)
    if (holes) lid = subtract(asGeom3(lid), holes)
  }
  return lid
}

// Direct geometry construction for flat lids — no CSG, guaranteed manifold.
// Uses a heightmap grid: cap cells have top=0, lip wall cells have top=lidHeight.
// Vertical step faces are generated automatically where heights differ.
//
// Hinged lids use the same print frame as friction lids: outer face on the bed
// (z = -wt), rim pointing up (the optional insert depth), flipped about Y when
// closed. The hinge sits at or below the outer face plane, so the whole lid —
// slab, rim and knuckles — prints face-down with no supports.
function generateFlatLid(params: BoxParams) {
  const { width, depth, wallThickness: wt, lidHeight: lhRaw, lidTolerance: tol, divisionsX, divisionsZ, divisionThickness, chamferSize, includeHinge } = params
  // Hinged lids: lip depth comes from the insert setting (0 = plain slab). The
  // heightmap is built lip-up like a friction lid, then mirrored in Z at the end
  // so the rim hangs BELOW the slab (z < -wt) into the box when closed.
  const lh = includeHinge ? hingeInsertDepth({ ...params, includeLid: true, lidStyle: 'lid' }) : Math.min(lhRaw, bodyHeight(params) - wt)  // lip can't exceed inner box height
  // Hinged rim: nothing beyond this Y (the back rim is dropped, side rims stop short)
  const rimYMax = includeHinge && lh > 0 ? hingeRimBackLimit({ ...params, includeLid: true, lidStyle: 'lid' }) : Infinity
  const dt = clampDivisionThickness(divisionThickness, wt)

  const w2 = width / 2, d2 = depth / 2
  const c = Math.min(chamferSize, wt, width / 4, depth / 4) // clamped chamfer

  // Lip dimensions
  const low2 = w2 - wt - tol       // lip outer half-width
  const lod2 = d2 - wt - tol       // lip outer half-depth
  const liw2 = low2 - wt           // lip inner half-width
  const lid2 = lod2 - wt           // lip inner half-depth

  // Divider notch info
  const innerW = width - 2 * wt
  const innerD = depth - 2 * wt
  const sw = dt + tol * 2          // slot width

  // The lid is used FLIPPED about the Y axis (x → -x; the flip the text
  // pre-mirroring assumes), so X notches must be cut mirrored to land on the
  // dividers after the flip. Y positions are unchanged by that flip.
  // Symmetric layouts hid this; asymmetric X percentages exposed it.
  const notchDividers = dividersReachLip(params)
  const xNotches = !notchDividers ? [] : [...divisionsX].sort((a, b) => a - b)
    .map(p => innerW / 2 - (p / 100) * innerW)
  const yNotches = !notchDividers ? [] : [...divisionsZ].sort((a, b) => a - b)
    .map(p => -innerD / 2 + (p / 100) * innerD)

  // Build breakpoints (sorted, deduplicated via Set)
  const xSet = new Set([-w2, -low2, low2, w2])
  if (c > 0) { xSet.add(-w2 + c); xSet.add(w2 - c) }
  if (liw2 > 0.01) { xSet.add(-liw2); xSet.add(liw2) }
  for (const xn of xNotches) { xSet.add(xn - sw / 2); xSet.add(xn + sw / 2) }
  const xB = [...xSet].sort((a, b) => a - b)

  const ySet = new Set([-d2, -lod2, lod2, d2])
  if (c > 0) { ySet.add(-d2 + c); ySet.add(d2 - c) }
  if (lid2 > 0.01) { ySet.add(-lid2); ySet.add(lid2) }
  for (const yn of yNotches) { ySet.add(yn - sw / 2); ySet.add(yn + sw / 2) }
  if (rimYMax < lod2 - 0.001 && rimYMax > -lod2) ySet.add(rimYMax)
  const yB = [...ySet].sort((a, b) => a - b)

  type V = [number, number, number]
  const polys: { vertices: V[] }[] = []

  // Determine cell top Z based on whether it's wing, lip wall, cavity, or notch
  function cellTop(i: number, j: number): number {
    const mx = (xB[i] + xB[i + 1]) / 2
    const my = (yB[j] + yB[j + 1]) / 2

    // Outside lip outer → wing
    if (Math.abs(mx) > low2 + 0.001 || Math.abs(my) > lod2 + 0.001) return 0
    // Inside lip inner → cavity
    if (liw2 > 0.01 && lid2 > 0.01 &&
        Math.abs(mx) < liw2 - 0.001 && Math.abs(my) < lid2 - 0.001) return 0

    // Hinged rim stops short of the back wall
    if (my > rimYMax) return 0

    // Lip wall region — check notches
    for (const xn of xNotches) {
      if (mx > xn - sw / 2 + 0.001 && mx < xn + sw / 2 - 0.001) return 0
    }
    for (const yn of yNotches) {
      if (my > yn - sw / 2 + 0.001 && my < yn + sw / 2 - 0.001) return 0
    }

    return lh // lip wall
  }

  const nx = xB.length - 1, ny = yB.length - 1

  // Precompute cell tops
  const tops: number[][] = []
  for (let i = 0; i < nx; i++) {
    tops[i] = []
    for (let j = 0; j < ny; j++) {
      tops[i][j] = cellTop(i, j)
    }
  }

  // Helper: is this the corner chamfer cell?
  const isChamferCorner = (i: number, j: number) =>
    c > 0 && ((i === 0 || i === nx - 1) && (j === 0 || j === ny - 1))

  // === BOTTOM FACE (Z = -wt, N = -Z) ===
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      if (isChamferCorner(i, j)) {
        // Triangle — cut the outer corner
        if (i === 0 && j === 0) {
          polys.push({ vertices: [[xB[1],yB[0],-wt],[xB[0],yB[1],-wt],[xB[1],yB[1],-wt]] })
        } else if (i === nx - 1 && j === 0) {
          polys.push({ vertices: [[xB[nx - 1],yB[0],-wt],[xB[nx - 1],yB[1],-wt],[xB[nx],yB[1],-wt]] })
        } else if (i === 0 && j === ny - 1) {
          polys.push({ vertices: [[xB[0],yB[ny - 1],-wt],[xB[1],yB[ny],-wt],[xB[1],yB[ny - 1],-wt]] })
        } else {
          polys.push({ vertices: [[xB[nx - 1],yB[ny - 1],-wt],[xB[nx - 1],yB[ny],-wt],[xB[nx],yB[ny - 1],-wt]] })
        }
      } else {
        polys.push({ vertices: [
          [xB[i], yB[j], -wt], [xB[i], yB[j + 1], -wt],
          [xB[i + 1], yB[j + 1], -wt], [xB[i + 1], yB[j], -wt]
        ]})
      }
    }
  }

  // === TOP FACES (Z = cell top, N = +Z) ===
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const z = tops[i][j]
      if (isChamferCorner(i, j)) {
        if (i === 0 && j === 0) {
          polys.push({ vertices: [[xB[1],yB[0],z],[xB[1],yB[1],z],[xB[0],yB[1],z]] })
        } else if (i === nx - 1 && j === 0) {
          polys.push({ vertices: [[xB[nx - 1],yB[0],z],[xB[nx],yB[1],z],[xB[nx - 1],yB[1],z]] })
        } else if (i === 0 && j === ny - 1) {
          polys.push({ vertices: [[xB[0],yB[ny - 1],z],[xB[1],yB[ny - 1],z],[xB[1],yB[ny],z]] })
        } else {
          polys.push({ vertices: [[xB[nx - 1],yB[ny - 1],z],[xB[nx],yB[ny - 1],z],[xB[nx - 1],yB[ny],z]] })
        }
      } else {
        polys.push({ vertices: [
          [xB[i], yB[j], z], [xB[i + 1], yB[j], z],
          [xB[i + 1], yB[j + 1], z], [xB[i], yB[j + 1], z]
        ]})
      }
    }
  }

  // === OUTER BOUNDARY WALLS ===
  if (c > 0) {
    // Left (X = -w2, N = -X) — skip first and last (corner) cells
    for (let j = 1; j < ny - 1; j++) {
      polys.push({ vertices: [
        [-w2, yB[j + 1], -wt], [-w2, yB[j], -wt],
        [-w2, yB[j], tops[0][j]], [-w2, yB[j + 1], tops[0][j]]
      ]})
    }
    // Right (X = w2, N = +X)
    for (let j = 1; j < ny - 1; j++) {
      polys.push({ vertices: [
        [w2, yB[j], -wt], [w2, yB[j + 1], -wt],
        [w2, yB[j + 1], tops[nx - 1][j]], [w2, yB[j], tops[nx - 1][j]]
      ]})
    }
    // Front (Y = -d2, N = -Y) — skip first and last
    for (let i = 1; i < nx - 1; i++) {
      polys.push({ vertices: [
        [xB[i], -d2, -wt], [xB[i + 1], -d2, -wt],
        [xB[i + 1], -d2, tops[i][0]], [xB[i], -d2, tops[i][0]]
      ]})
    }
    // Back (Y = d2, N = +Y)
    for (let i = 1; i < nx - 1; i++) {
      polys.push({ vertices: [
        [xB[i + 1], d2, -wt], [xB[i], d2, -wt],
        [xB[i], d2, tops[i][ny - 1]], [xB[i + 1], d2, tops[i][ny - 1]]
      ]})
    }

    // 4 chamfer face strips (corner diagonal walls), CCW from outside so the
    // normal points outward — a flipped strip breaks CSG classification (see
    // the matching comment in generateBox)
    // Corner tops are always wing height (0) since corners are outside the lip
    const ct = 0 // corner top Z
    // Front-left: outward normal (-1,-1,0)/√2
    polys.push({ vertices: [[-w2,-d2+c,-wt],[-w2+c,-d2,-wt],[-w2+c,-d2,ct],[-w2,-d2+c,ct]] })
    // Front-right: outward normal (1,-1,0)/√2
    polys.push({ vertices: [[w2-c,-d2,-wt],[w2,-d2+c,-wt],[w2,-d2+c,ct],[w2-c,-d2,ct]] })
    // Back-right: outward normal (1,1,0)/√2
    polys.push({ vertices: [[w2,d2-c,-wt],[w2-c,d2,-wt],[w2-c,d2,ct],[w2,d2-c,ct]] })
    // Back-left: outward normal (-1,1,0)/√2
    polys.push({ vertices: [[-w2+c,d2,-wt],[-w2,d2-c,-wt],[-w2,d2-c,ct],[-w2+c,d2,ct]] })
  } else {
    // Left (X = -w2, N = -X)
    for (let j = 0; j < ny; j++) {
      polys.push({ vertices: [
        [-w2, yB[j + 1], -wt], [-w2, yB[j], -wt],
        [-w2, yB[j], tops[0][j]], [-w2, yB[j + 1], tops[0][j]]
      ]})
    }
    // Right (X = w2, N = +X)
    for (let j = 0; j < ny; j++) {
      polys.push({ vertices: [
        [w2, yB[j], -wt], [w2, yB[j + 1], -wt],
        [w2, yB[j + 1], tops[nx - 1][j]], [w2, yB[j], tops[nx - 1][j]]
      ]})
    }
    // Front (Y = -d2, N = -Y)
    for (let i = 0; i < nx; i++) {
      polys.push({ vertices: [
        [xB[i], -d2, -wt], [xB[i + 1], -d2, -wt],
        [xB[i + 1], -d2, tops[i][0]], [xB[i], -d2, tops[i][0]]
      ]})
    }
    // Back (Y = d2, N = +Y)
    for (let i = 0; i < nx; i++) {
      polys.push({ vertices: [
        [xB[i + 1], d2, -wt], [xB[i], d2, -wt],
        [xB[i], d2, tops[i][ny - 1]], [xB[i + 1], d2, tops[i][ny - 1]]
      ]})
    }
  }

  // === INTERNAL VERTICAL FACES (height steps) ===
  // X boundaries (between columns i and i+1)
  for (let i = 0; i < nx - 1; i++) {
    for (let j = 0; j < ny; j++) {
      if (isChamferCorner(i, j) || isChamferCorner(i + 1, j)) continue
      const tL = tops[i][j], tR = tops[i + 1][j]
      if (Math.abs(tL - tR) < 0.001) continue
      const x = xB[i + 1]
      const lo = Math.min(tL, tR), hi = Math.max(tL, tR)
      if (tL > tR) {
        // Left cell taller → face N = +X
        polys.push({ vertices: [
          [x, yB[j], lo], [x, yB[j + 1], lo],
          [x, yB[j + 1], hi], [x, yB[j], hi]
        ]})
      } else {
        // Right cell taller → face N = -X
        polys.push({ vertices: [
          [x, yB[j + 1], lo], [x, yB[j], lo],
          [x, yB[j], hi], [x, yB[j + 1], hi]
        ]})
      }
    }
  }
  // Y boundaries (between rows j and j+1)
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny - 1; j++) {
      if (isChamferCorner(i, j) || isChamferCorner(i, j + 1)) continue
      const tF = tops[i][j], tB = tops[i][j + 1]
      if (Math.abs(tF - tB) < 0.001) continue
      const y = yB[j + 1]
      const lo = Math.min(tF, tB), hi = Math.max(tF, tB)
      if (tF > tB) {
        // Front cell taller → face N = +Y
        polys.push({ vertices: [
          [xB[i + 1], y, lo], [xB[i], y, lo],
          [xB[i], y, hi], [xB[i + 1], y, hi]
        ]})
      } else {
        // Back cell taller → face N = -Y
        polys.push({ vertices: [
          [xB[i], y, lo], [xB[i + 1], y, lo],
          [xB[i + 1], y, hi], [xB[i], y, hi]
        ]})
      }
    }
  }

  return { polygons: polys }
}

// CSG-based lid — only used when text is present (text requires subtract/union)
function generateLidCSG(params: BoxParams, textGeometry: any) {
  const { width, depth, wallThickness, lidHeight: lidHeightRaw, lidTolerance, divisionsX, divisionsZ, divisionThickness, lidTextStyle, chamferSize, includeHinge } = params
  const lidHeight = Math.min(lidHeightRaw, bodyHeight(params) - wallThickness)  // lip can't exceed inner box height
  const divThickness = clampDivisionThickness(divisionThickness, wallThickness)

  // Hinged lids share the friction lid's print frame (see generateFlatLid): the
  // boolean-free slab/rim is built first, then the text goes on its bed face,
  // pre-mirrored because the lid is flipped about Y when it closes.
  if (includeHinge) {
    let body: any = asGeom3(generateFlatLid(params))
    const mirroredText = mirrorX(textGeometry)
    if (lidTextStyle === 'engraved') {
      body = subtract(body, translate([0, 0, -wallThickness], mirroredText))
    } else {
      body = union(body, translate([0, 0, -wallThickness - params.lidTextDepth], mirroredText))
    }
    return body
  }

  const lipOuterWidth = width - wallThickness * 2 - lidTolerance * 2
  const lipOuterDepth = depth - wallThickness * 2 - lidTolerance * 2
  const lipInnerWidth = lipOuterWidth - wallThickness * 2
  const lipInnerDepth = lipOuterDepth - wallThickness * 2
  const fullHeight = wallThickness + lidHeight
  const c = Math.min(chamferSize, wallThickness, width / 4, depth / 4)

  // 1. Full solid block encompassing cap + lip volume
  let lid: any = cuboid({ size: [width, depth, fullHeight] })

  const lipCenterZ = fullHeight / 2 - lidHeight / 2

  // 2. Cut away the step — remove material outside the lip footprint in the upper region
  const stepOuter = cuboid({ size: [width + 1, depth + 1, lidHeight + 0.2] })
  const stepInner = cuboid({ size: [lipOuterWidth, lipOuterDepth, lidHeight + 0.4] })
  lid = subtract(lid, translate([0, 0, lipCenterZ], subtract(stepOuter, stepInner)))

  // 3. Hollow out the lip interior
  const lipHollow = cuboid({ size: [lipInnerWidth, lipInnerDepth, lidHeight + 0.2] })
  lid = subtract(lid, translate([0, 0, lipCenterZ], lipHollow))

  // 4. Cut divider notches from the lip
  const innerWidth = width - wallThickness * 2
  const innerDepth = depth - wallThickness * 2

  for (const pct of dividersReachLip(params) ? divisionsX : []) {
    // Mirrored: the lid is used flipped about Y (x → -x), like the text
    const xPos = innerWidth / 2 - (pct / 100) * innerWidth
    const slot = cuboid({ size: [divThickness + lidTolerance * 2, lipOuterDepth + 0.2, lidHeight + 0.2] })
    lid = subtract(lid, translate([xPos, 0, lipCenterZ], slot))
  }

  for (const pct of dividersReachLip(params) ? divisionsZ : []) {
    const yPos = -innerDepth / 2 + (pct / 100) * innerDepth
    const slot = cuboid({ size: [lipOuterWidth + 0.2, divThickness + lidTolerance * 2, lidHeight + 0.2] })
    lid = subtract(lid, translate([0, yPos, lipCenterZ], slot))
  }

  // 5. Cut chamfers from outer vertical edges
  if (c > 0) {
    const w2 = width / 2, d2 = depth / 2
    // All triangles must be CCW for valid JSCAD polygon extrusion
    const cornerTris: [number, number][][] = [
      [[-w2, -d2], [-w2 + c, -d2], [-w2, -d2 + c]],  // front-left
      [[ w2, -d2], [ w2, -d2 + c], [ w2 - c, -d2]],  // front-right
      [[ w2,  d2], [ w2 - c,  d2], [ w2,  d2 - c]],  // back-right
      [[-w2,  d2], [-w2,  d2 - c], [-w2 + c,  d2]],  // back-left
    ]
    for (const points of cornerTris) {
      const tri = polygon({ points })
      const prism = extrudeLinear({ height: fullHeight + 2 }, tri)
      lid = subtract(lid, translate([0, 0, -(fullHeight + 2) / 2], prism))
    }
  }

  // 6. Apply text to the cap's bottom surface
  const mirrored = mirrorX(textGeometry)
  const capBottom = -fullHeight / 2

  if (lidTextStyle === 'engraved') {
    lid = subtract(lid, translate([0, 0, capBottom], mirrored))
  } else {
    lid = union(lid, translate([0, 0, capBottom - params.lidTextDepth], mirrored))
  }

  // 7. Translate to match expected coordinate system:
  // Cap bottom at -wallThickness, cap top at 0, lip extends upward to lidHeight
  return translate([0, 0, (lidHeight - wallThickness) / 2], lid)
}

// ── Drawer sleeve ─────────────────────────────────────────────────────────────
// An open-front cover the box slides into (matchbox style): 4 walls + closed
// back for a stop, open at the front (-Y). Centered at the origin like the box.
//
//   inner cavity: (width + 2·tol) × (depth + tol) × (height + 2·tol)
//   outer shell:  inner + wallThickness on every closed side
//
// Optional finger cutout: semicircular notches through the top and bottom walls
// at the opening, so the box can be pinched and pulled out even when heavy.

// Height of the bin the top-sliding cover cannot reach: the baseplate it sits in
export function sleeveSeatHeight(params: BoxParams): number {
  return params.gridfinity && params.sleeveAxis === 'height' ? GF_BASE_H : 0
}

// The sleeve is always built in a canonical frame (open at -Y, closed back at
// +Y, label face +Z) and then rotated so its opening faces the chosen side.
// canon* helpers give the box's size along the canonical axes and the sleeve's
// canonical outer size; the public sleeveOuterDims is the same in world axes.
function sleeveCanon(params: BoxParams): { w: number; d: number; h: number } {
  const { width, depth, height, wallThickness: wt, sleeveTolerance: tol } = params
  const o = params.sleeveAxis
  // Gridfinity bin sliding under a cover from the top: the foot sits in the baseplate,
  // so the cover can only reach the plate's top face and skips that much height.
  const [bw, bd, bh] = o === 'height' ? [width, height - sleeveSeatHeight(params), depth]
    : o === 'width' ? [depth, width, height]
    : [width, depth, height]
  return { w: bw + 2 * tol + 2 * wt, d: bd + tol + wt, h: bh + 2 * tol + 2 * wt }
}

// Canonical → world rotation for each opening. [x, y, z] → world [x, y, z]
export function sleeveToWorld(axis: SleeveAxis, [x, y, z]: number[]): [number, number, number] {
  switch (axis) {
    case 'width': return [y, -x, z]    // canonical -Y → world -X
    case 'height': return [x, -z, y]   // canonical -Y (open) → world -Z, closed back → world +Z (top)
    default: return [x, y, z]
  }
}

// Outer dimensions of the sleeve in world axes — shared by the generator, viewer and UI summary
export function sleeveOuterDims(params: BoxParams): { w: number; d: number; h: number } {
  const c = sleeveCanon(params)
  const o = params.sleeveAxis
  if (o === 'height') return { w: c.w, d: c.h, h: c.d }
  if (o === 'width') return { w: c.d, d: c.w, h: c.h }
  return c
}

// Size of the top face, where the label text is read
export function sleeveLabelDims(params: BoxParams): { w: number; d: number } {
  const s = sleeveOuterDims(params)
  return { w: s.w, d: s.d }
}

// Where the sleeve's centre sits relative to the box centre with the box slid
// fully in (box against the closed end, tolerance gap at rest)
export function sleeveInPlaceOffset(params: BoxParams): [number, number, number] {
  return sleeveToWorld(params.sleeveAxis, [0, (params.wallThickness + params.sleeveTolerance + sleeveSeatHeight(params)) / 2, 0])
}

/**
 * Cutout pattern through the sleeve's left, right, and back walls (the front
 * is open, so there's nothing to punch there). Same technique as the box's
 * side walls: holes are laid out in each wall's own (u, v) plane, then a
 * canonical Z-extruded prism is rotated onto the wall's actual thickness axis
 * (X for left/right, Y for back) before being translated into place. Margins
 * keep holes clear of the top/bottom plates (already perforated separately),
 * the front opening, and the back/side corners.
 */
function sleeveWallHoles(params: BoxParams, backExclusions: Rect2[] = []): any | null {
  const { wallThickness: wt, lidPattern, lidPatternSize, lidPatternSpacing } = params
  if (lidPattern === 'none') return null

  const { w: outerW, d: outerD, h: outerH } = sleeveCanon(params)
  const w2 = outerW / 2, d2 = outerD / 2, h2 = outerH / 2
  const innerW = outerW - 2 * wt

  const marginV = wt + 2 // clear of the top/bottom plates
  const zTop = h2 - marginV
  const zBot = -h2 + marginV
  if (zTop <= zBot) return null

  const size = Math.max(2, lidPatternSize)
  const spacing = Math.max(1.5, lidPatternSpacing)
  const shape = patternShape2D(lidPattern, size)
  if (!shape) return null

  const h = wt + 1 // through-thickness, overshooting both faces slightly
  const prism = extrudeLinear({ height: h }, shape)
  const prismAlt = lidPattern === 'triangles'
    ? extrudeLinear({ height: h }, patternShape2D(lidPattern, size, true))
    : prism

  const solids: any[] = []

  // Left & right walls: u = Y (depth), v = Z, extrusion punches through X
  const lrRegion: Rect2 = { x0: -d2 + 4, x1: d2 - 4, y0: zBot, y1: zTop }
  const lrPositions = patternGrid(lidPattern, size, spacing, lrRegion, [])
  if (lrPositions) {
    // compound rotate: (x,y,z) -> (z,x,y) — z (extrusion) becomes X, x/y (shape) become Y/Z
    const sPrism = rotate([0, Math.PI / 2, 0], rotate([0, 0, Math.PI / 2], prism))
    const sPrismAlt = rotate([0, Math.PI / 2, 0], rotate([0, 0, Math.PI / 2], prismAlt))
    const iw2 = w2 - wt
    for (const p of lrPositions) {
      solids.push(translate([-w2 - 0.5, p.x, p.y], p.alt ? sPrismAlt : sPrism)) // left
      solids.push(translate([iw2 - 0.5, p.x, p.y], p.alt ? sPrismAlt : sPrism)) // right
    }
  }

  // Back wall: u = X, v = Z, extrusion punches through Y
  const backRegion: Rect2 = { x0: -(innerW / 2 - 1.5), x1: innerW / 2 - 1.5, y0: zBot, y1: zTop }
  const backPositions = patternGrid(lidPattern, size, spacing, backRegion, backExclusions)
  if (backPositions) {
    // rotate -90° about X: (x,y,z) -> (x, z, -y)
    const bPrism = rotate([-Math.PI / 2, 0, 0], prism)
    const bPrismAlt = rotate([-Math.PI / 2, 0, 0], prismAlt)
    for (const p of backPositions) {
      solids.push(translate([p.x, d2 + 0.5 - h, p.y], p.alt ? bPrismAlt : bPrism))
    }
  }

  return unionAll(solids)
}

export function generateSleeve(params: BoxParams, rawText?: any): any {
  const { wallThickness: wt, sleeveTolerance: tol, sleeveCutout, lidTextStyle, lidTextDepth } = params
  const axis: SleeveAxis = SLEEVE_AXES.includes(params.sleeveAxis) ? params.sleeveAxis : 'depth'
  params = { ...params, sleeveAxis: axis }
  const { w: outerW, d: outerD, h: outerH } = sleeveCanon(params)
  const innerW = outerW - 2 * wt
  const innerH = outerH - 2 * wt
  const width = innerW - 2 * tol // box size along the canonical X axis
  const cavityD = outerD - wt     // from front opening to inside of back wall

  // The label is authored reading correctly in the world; counter-rotate it so
  // the final rotation of the whole sleeve puts it back upright.
  // Height axis: the closed end is the world top, i.e. the canonical back wall,
  // so the text is laid onto that wall instead of the canonical top plate.
  let textGeometry = rawText
  let textOnBack = false
  let backTextRect: Rect2[] = []
  if (rawText) {
    if (axis === 'height') {
      textOnBack = true
      const r = boundsRect(rawText, 1.5, false)
      backTextRect = [{ x0: r.x0, x1: r.x1, y0: -r.y1, y1: -r.y0 }] // world Y → canonical -Z
      textGeometry = rotate([-Math.PI / 2, 0, 0], rawText)         // text z → canonical +Y
    } else if (axis === 'width') {
      textGeometry = rotate([0, 0, Math.PI / 2], rawText)
    }
  }

  let sleeve: any = cuboid({ size: [outerW, outerD, outerH] })

  // Cavity, extended 1 mm past the front face so the front is fully open
  const cavity = cuboid({ size: [innerW, cavityD + 1, innerH] })
  sleeve = subtract(sleeve, translate([0, -(wt + 1) / 2, 0], cavity))

  if (sleeveCutout) {
    // Vertical cylinder centered on the front face: leaves matching semicircular
    // notches in the top and bottom walls (pinch grip, works in any orientation).
    const notchR = Math.min(width * 0.3, 10)
    const notch = cylinder({ radius: notchR, height: outerH + 2, segments: 48 })
    sleeve = subtract(sleeve, translate([0, -outerD / 2, 0], notch))
  }

  // Text on the top face, read in place — no mirroring needed
  if (textGeometry && textOnBack) {
    const back = outerD / 2
    if (lidTextStyle === 'engraved') {
      sleeve = subtract(sleeve, translate([0, back - lidTextDepth, 0], textGeometry))
    } else {
      sleeve = union(sleeve, translate([0, back, 0], textGeometry))
    }
  } else if (textGeometry) {
    const top = outerH / 2
    if (lidTextStyle === 'engraved') {
      sleeve = subtract(sleeve, translate([0, 0, top - lidTextDepth], textGeometry))
    } else {
      sleeve = union(sleeve, translate([0, 0, top], textGeometry))
    }
  }

  // Cutout pattern: full-height prisms perforate the top AND bottom walls in
  // matching positions (the middle is cavity air), plus the left, right, and
  // back walls (see sleeveWallHoles). Solid margins are kept at the opening,
  // the back wall, the sides, the finger notch, and the text.
  if (params.lidPattern !== 'none') {
    const exclusions: Rect2[] = []
    if (sleeveCutout) {
      const notchR = Math.min(width * 0.3, 10)
      exclusions.push({ x0: -notchR - 1.5, x1: notchR + 1.5, y0: -outerD / 2 - 1, y1: -outerD / 2 + notchR + 1.5 })
    }
    if (textGeometry && !textOnBack) {
      exclusions.push(boundsRect(textGeometry, 1.5, false))
    }
    const region: Rect2 = {
      x0: -(innerW / 2 - 1.5),
      x1: innerW / 2 - 1.5,
      y0: -outerD / 2 + 4,
      y1: outerD / 2 - wt - 1.5,
    }
    const plateHoles = patternPrisms(params, region, -outerH / 2 - 0.5, outerH / 2 + 0.5, exclusions)
    const wallHoles = sleeveWallHoles(params, backTextRect)
    const holes = plateHoles && wallHoles ? union(plateHoles, wallHoles) : plateHoles || wallHoles
    if (holes) sleeve = subtract(sleeve, holes)
  }

  return orientSleeve(sleeve, axis)
}

// Rotate the canonical sleeve so it opens along the requested axis
function orientSleeve(sleeve: any, axis: SleeveAxis): any {
  switch (axis) {
    case 'width': return rotate([0, 0, -Math.PI / 2], sleeve)
    case 'height': return rotate([Math.PI / 2, 0, 0], sleeve)
    default: return sleeve
  }
}

// ── Gridfinity feet and baseplate ─────────────────────────────────────────────
type GfLevel = { w: number; z: number; r: number }

// Rounded-square ring (CCW from +Z), `segs` points per corner arc
function roundedSquareRing(w: number, r: number, segs = 6): [number, number][] {
  const half = w / 2
  const c = half - r
  const pts: [number, number][] = []
  const corners: [number, number, number][] = [[c, -c, -90], [c, c, 0], [-c, c, 90], [-c, -c, 180]]
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= segs; i++) {
      const a = ((a0 + (i / segs) * 90) * Math.PI) / 180
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
    }
  }
  return pts
}

// Closed manifold solid lofted through rounded-square rings (plain polygons,
// outward-facing). Side quads are split into triangles since consecutive rings
// of different radii are not planar.
function loftRounded(levels: GfLevel[], cx: number, cy: number, z0: number): { vertices: number[][] }[] {
  const rings = levels.map(l => roundedSquareRing(l.w, l.r).map(([x, y]) => [x + cx, y + cy, z0 + l.z]))
  const n = rings[0].length
  const polys: { vertices: number[][] }[] = []
  polys.push({ vertices: [...rings[0]].reverse() })                    // bottom, faces down
  polys.push({ vertices: [...rings[rings.length - 1]] })               // top, faces up
  for (let k = 0; k < rings.length - 1; k++) {
    const a = rings[k], b = rings[k + 1]
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      polys.push({ vertices: [a[i], a[j], b[j]] })
      polys.push({ vertices: [a[i], b[j], b[i]] })
    }
  }
  return polys
}

// Foot profile (bottom up): 0.8 chamfer, 1.8 vertical, 2.15 chamfer, then a short
// straight section that sinks into the floor. Corner radius shrinks with the inset.
function gfFootLevels(sink: number): GfLevel[] {
  const rad = (w: number) => Math.max(3.75 - (41.5 - w) / 2, 0.8)
  return ([[35.6, 0], [37.2, 0.8], [37.2, 2.6], [41.5, GF_FOOT_H], [41.5, GF_FOOT_H + GF_COLUMN + sink]] as [number, number][])
    .map(([w, z]) => ({ w, z, r: rad(w) }))
}

/** Gridfinity feet for the bin: one per grid cell, as separate overlapping closed shells. */
export function generateBinFeet(params: BoxParams): any {
  const sink = Math.min(0.4, params.wallThickness / 2)
  const levels = gfFootLevels(sink)
  const z0 = -params.height / 2
  const polygons: any[] = []
  for (let i = 0; i < params.gridX; i++) {
    for (let j = 0; j < params.gridY; j++) {
      const cx = (i - (params.gridX - 1) / 2) * GF_PITCH
      const cy = (j - (params.gridY - 1) / 2) * GF_PITCH
      polygons.push(...loftRounded(levels, cx, cy, z0))
    }
  }
  return { polygons }
}

/**
 * Plain Gridfinity baseplate (no magnets or screws): a framework of sockets that
 * the bin feet click into, open at the bottom. Block minus one lofted cavity per
 * cell; the rim between cells is 0.2 mm wide at the top.
 */
export function generateBaseplate(cellsX: number, cellsY: number): any {
  const nx = Math.max(1, Math.round(cellsX)), ny = Math.max(1, Math.round(cellsY))
  const block = translate([0, 0, GF_BASE_H / 2], cuboid({ size: [nx * GF_PITCH, ny * GF_PITCH, GF_BASE_H] }))
  const rad = (w: number) => Math.max(3.9 - (41.8 - w) / 2, 1)
  const levels: GfLevel[] = ([[36.3, -0.5], [36.3, 0], [37.7, 0.7], [37.7, 2.5], [41.8, 4.55], [41.8, GF_BASE_H + 0.5]] as [number, number][])
    .map(([w, z]) => ({ w, z, r: rad(w) }))
  const cavities: any[] = []
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const cx = (i - (nx - 1) / 2) * GF_PITCH
      const cy = (j - (ny - 1) / 2) * GF_PITCH
      cavities.push(geom3.create(loftRounded(levels, cx, cy, 0) as any))
    }
  }
  return subtract(block, ...cavities)
}

// ── Hinge generation (pin-less snap hinge) ────────────────────────────────────
// Barrel hinge with integrated snap axles — nothing extra to print, no pin.
//
// Three interleaved knuckles per hinge position:
//   • 2 box-side knuckles (flanking) — C-clips: a through bore with a slot to
//     the top that is slightly narrower than the axle, so the axle clicks in
//   • 1 lid-side knuckle (middle) — solid barrel with a tapered axle stub on
//     each side, all one solid of revolution
//
// Assembly: press the lid's stubs straight down into the box clips until they
// click into the bores. Pull the lid straight up (open flat) to remove.
//
// The barrel sits BEHIND the back wall with its top level with the lid's top
// face (axis one barrel-radius below it), so nothing on the lid rises above the
// outer face: the lid prints face-down, rim up, with no supports. The lid
// knuckle is built in the lid's print frame (outer face at z = -wt, flipped
// about Y when closed, so its X positions are mirrored).
//
// IMPORTANT — no boolean ops in here. JSCAD's union/subtract leave sliver
// polygons and unpaired edges on the split faces that survive even T-junction
// repair, and slicers report them as open edges. Every piece (clip, barrel,
// plate, arm) is built as its own closed manifold — extrusion or revolve — and
// the pieces are concatenated as separate overlapping shells, which slicers merge.
//
// LOCAL ORIGIN of every knuckle = barrel centre + R/2 (up), as before.
// Closed-pose axis height (box coords) = h2 + wt - R - HINGE_DROP, Y = d2 + R + HINGE_WALL_GAP.

const HINGE_GAP  = 0.2      // side clearance between adjacent knuckles (mm)
const HINGE_SEGS = 32       // cylinder facets
const AXLE_CLEARANCE = 0.25 // radial clearance between axle stub and bore (mm)
const AXLE_ENGAGE = 1.4     // stub length: bridges HINGE_GAP, then seats in the bore
const AXLE_TAPER = 0.4      // stub tip is this much smaller in radius (lead-in)
const SNAP_PINCH = 0.6      // channel mouth narrower than the axle Ø by this much (mm)
const HINGE_WALL_GAP = 0.3  // clearance between the barrels and the box's back wall (mm)
const HINGE_DROP = 0.2      // barrel top sits this far below the lid's outer face plane, so the
                            // barrel never touches the bed plane edge-on

/**
 * X positions for hinges (centred in the box width).
 *   1 hinge  → centre
 *   2 hinges → ±30 % of width
 *   3 hinges → ±25 % and centre
 */
function hingeXPositions(count: number, width: number): number[] {
  if (count === 1) return [0]
  if (count === 2) return [-width * 0.3, width * 0.3]
  return [-width / 4, 0, width / 4]
}

/**
 * Concatenate closed solids into one plain polygon-soup geometry (transforms
 * baked). Each input stays a closed manifold shell, so the result has no open
 * edges; overlapping shells are merged by the slicer. The plain {polygons}
 * shape flows through the viewer and exporter unchanged.
 */
function mergeSolids(geoms: any[]): any {
  return { polygons: geoms.flatMap((g) => geom3.toPolygons(g)) }
}

const HINGE_ARM_INSET = 0.3 // arms/plates sink this far into the wall/slab so contacts are volume overlaps, not touches

/**
 * Box-side knuckle barrel: a C-clip — through bore with a slot to the top,
 * pinched slightly narrower than the axle so it snaps in. Built as a single
 * extrusion of the C profile (no booleans → manifold by construction).
 * Local origin = hinge axis; barrel axis along X, slot opening up (+Z).
 */
function cClipBarrel(K: number, R: number, axleR: number): any {
  const boreR = axleR + AXLE_CLEARANCE
  const w = Math.max(2 * axleR - SNAP_PINCH, 0.6) / 2 // slot half-width
  const aOut = Math.asin(w / R)
  const aIn = Math.asin(w / boreR)

  const pts: [number, number][] = []
  // outer circle from the right slot edge, sweeping the full C
  for (let i = 0; i <= HINGE_SEGS; i++) {
    const t = aOut + (i / HINGE_SEGS) * (2 * Math.PI - 2 * aOut)
    pts.push([R * Math.sin(t), R * Math.cos(t)])
  }
  // bore arc back from the left slot edge to the right
  for (let i = 0; i <= HINGE_SEGS; i++) {
    const t = (2 * Math.PI - aIn) - (i / HINGE_SEGS) * (2 * Math.PI - 2 * aIn)
    pts.push([boreR * Math.sin(t), boreR * Math.cos(t)])
  }
  // polygon() needs CCW winding
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    area += x1 * y2 - x2 * y1
  }
  if (area < 0) pts.reverse()

  // extrude along Z, then orient (x2,y2,z2) → (z2,x2,y2): axis along X,
  // profile x → world Y, profile y → world Z
  return translate([-K / 2, 0, 0],
    rotate([Math.PI / 2, 0, 0],
      rotate([0, Math.PI / 2, 0],
        extrudeLinear({ height: K }, polygon({ points: pts })))))
}

/**
 * All box-side hinge knuckles: two flanking C-clips per hinge position, each
 * with a mounting arm reaching 10 mm down the outer back wall. Emitted as
 * separate closed shells (see mergeSolids).
 */
export function generateBoxHingeKnuckles(params: BoxParams): any {
  const { width, depth, height, wallThickness: wt, hingeCount, hingeDiameter, hingePinDiameter } = params
  const d2 = depth / 2, h2 = height / 2
  const R = hingeDiameter / 2
  const axleR = hingePinDiameter / 2
  const K = hingeDiameter
  const dz = -R / 2 // barrel centre below local origin
  // Barrel centre sits R + HINGE_DROP below the lid's outer face (h2 + wt)
  const zOrigin = h2 + wt - R - HINGE_DROP + R / 2
  // Arm runs down the outer back wall but never past the floor
  const barrelBottomBelowRim = 2 * R + HINGE_DROP - wt
  const armH = Math.max(1, Math.min(wt + 10, height - barrelBottomBelowRim))

  const clip = translate([0, 0, dz], cClipBarrel(K, R, axleR))
  // With a thick lid the axis sits well above the rim. The part of the arm
  // below the rim is sunk into the wall as usual; the part above it is a plain
  // column kept off the lid's back edge, or the lid slab would hit it.
  const topArm = zOrigin - R // arm top, level with the underside of the barrel's centre line
  const rimZ = h2
  const solids: any[] = []
  const buildArm = (): any[] => {
    const parts: any[] = []
    const lowerTop = Math.min(topArm, rimZ)
    const lowerH = Math.max(lowerTop - (topArm - armH), 3)
    parts.push(translate([0, -(R + HINGE_WALL_GAP) / 2 - HINGE_ARM_INSET, lowerTop - lowerH / 2 - zOrigin],
      cuboid({ size: [K, R + HINGE_WALL_GAP, lowerH] })))
    if (topArm > rimZ + 0.01) {
      // column from just below the rim up into the barrel, front face 0.3 mm off the wall plane
      const colTop = topArm, colBot = rimZ - 0.3
      const yFront = HINGE_WALL_GAP - (R + HINGE_WALL_GAP) // wall plane + gap, relative to the axis
      const yBack = -HINGE_ARM_INSET
      parts.push(translate([0, (yFront + yBack) / 2, (colTop + colBot) / 2 - zOrigin],
        cuboid({ size: [K, yBack - yFront, colTop - colBot] })))
    }
    return parts
  }
  const armParts = buildArm()

  for (const xC of hingeXPositions(hingeCount, width)) {
    for (const x of [xC - K - HINGE_GAP, xC + K + HINGE_GAP]) {
      solids.push(translate([x, d2 + R + HINGE_WALL_GAP, zOrigin], clip))
      for (const part of armParts) solids.push(translate([x, d2 + R + HINGE_WALL_GAP, zOrigin], part))
    }
  }
  return mergeSolids(solids)
}

/**
 * All lid-side hinge knuckles, in the lid's print frame (outer face at
 * z = -wt, flipped about Y when closed): one middle knuckle per hinge position —
 * barrel plus both tapered snap-axle stubs as a single solid of revolution,
 * sitting on a plate that continues the lid slab out behind the back edge so
 * the barrel prints on solid material. Separate closed shells, no booleans.
 */
export function generateLidHingeKnuckles(params: BoxParams): any {
  const { width, depth, wallThickness: wt, hingeCount, hingeDiameter, hingePinDiameter } = params
  const d2 = depth / 2
  const R = hingeDiameter / 2
  const axleR = hingePinDiameter / 2
  const K = hingeDiameter
  const dz = -R / 2

  // Revolve profile: [radius, axial] pairs, CCW — stub, barrel, stub
  const tipR = Math.max(axleR - AXLE_TAPER, 0.3)
  const h = K / 2
  const e = AXLE_ENGAGE
  const profile = polygon({
    points: [
      [0, -(h + e)], [tipR, -(h + e)], [axleR, -h], [R, -h],
      [R, h], [axleR, h], [tipR, h + e], [0, h + e],
    ],
  })
  const barrelWithStubs = translate([0, 0, dz],
    rotate([0, Math.PI / 2, 0], extrudeRotate({ segments: HINGE_SEGS }, profile)))

  // Barrel bottom is HINGE_DROP above the bed face (z = -wt); its centre is R above that
  const zOrigin = -wt + HINGE_DROP + R + R / 2
  const yAxis = d2 + R + HINGE_WALL_GAP
  // Plate: continues the slab from just inside the lid's back edge to the far side
  // of the barrel. Capped at the height of the barrel's centre line: a thick lid
  // would otherwise leave a deep block swinging down behind the back wall.
  const y0 = d2 - HINGE_ARM_INSET
  const y1 = yAxis + R
  // (Top kept 0.37 mm below the barrel's centre line so the plate's edges never sit exactly
  // on a barrel vertex line — edge-on contact between shells is non-manifold.)
  const plateT = Math.min(wt, R + HINGE_DROP - 0.37)
  const plate = translate([0, (y0 + y1) / 2, -wt + plateT / 2], cuboid({ size: [K, y1 - y0, plateT] }))

  const solids: any[] = []
  for (const xC of hingeXPositions(hingeCount, width)) {
    const x = -xC // the lid is flipped about Y when closed
    solids.push(translate([x, yAxis, zOrigin], barrelWithStubs))
    solids.push(translate([x, 0, 0], plate))
  }
  return mergeSolids(solids)
}

// ── Three.js conversion ───────────────────────────────────────────────────────
// Convert JSCAD geometry to Three.js BufferGeometry (for display)
export function jscadToThreeGeometry(jscadGeom: any): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()

  if (!jscadGeom.polygons || jscadGeom.polygons.length === 0) {
    return geometry
  }

  // Apply JSCAD transform matrix if present (CSG results store translate/rotate in .transforms)
  const m = jscadGeom.transforms as number[] | undefined
  const hasTransform = m && m.length === 16 &&
    !(m[0] === 1 && m[5] === 1 && m[10] === 1 && m[12] === 0 && m[13] === 0 && m[14] === 0)

  const vertices: number[] = []
  const indices: number[] = []
  let vertexIndex = 0

  jscadGeom.polygons.forEach((polygon: any) => {
    const polyVertices = polygon.vertices
    if (polyVertices.length < 3) return

    // Add all vertices for this polygon, applying transform if needed
    for (let i = 0; i < polyVertices.length; i++) {
      const v = polyVertices[i]
      if (hasTransform && m) {
        // Apply 4x4 column-major transform matrix
        vertices.push(
          m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
          m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
          m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]
        )
      } else {
        vertices.push(v[0], v[1], v[2])
      }
    }

    // Fan triangulation: handles triangles, quads, and n-gons
    for (let i = 1; i < polyVertices.length - 1; i++) {
      indices.push(vertexIndex, vertexIndex + i, vertexIndex + i + 1)
    }

    vertexIndex += polyVertices.length
  })

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  return geometry
}
