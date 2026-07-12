import { primitives, booleans, transforms, extrusions, geometries, measurements } from '@jscad/modeling'
import * as THREE from 'three'

const { cuboid, polygon, cylinder, circle, rectangle } = primitives
const { subtract, union } = booleans
const { translate, mirrorX, rotate } = transforms
const { extrudeLinear, extrudeRotate } = extrusions
const { geom3 } = geometries
const { measureBoundingBox } = measurements

export type LidPattern = 'none' | 'circles' | 'squares' | 'diamonds' | 'hexagons' | 'triangles' | 'slots'

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
  chamferSize: number        // 45° chamfer on outer vertical edges (0 = none)
  includeHinge: boolean
  hingeCount: number         // number of hinges along the back edge (1–3)
  hingeDiameter: number      // outer barrel diameter in mm
  hingePinDiameter: number   // pin hole diameter in mm
  lidStyle: 'lid' | 'sleeve' // 'lid' = cap with lip; 'sleeve' = open-front cover the box slides into
  sleeveTolerance: number    // gap between box and sleeve interior for sliding fit
  sleeveCutout: boolean      // finger notches at the sleeve opening to grab the box
}

// Divider walls must stay printable and can never exceed the outer wall thickness
export function clampDivisionThickness(divisionThickness: number, wallThickness: number): number {
  const dt = Number.isFinite(divisionThickness) ? divisionThickness : wallThickness
  return Math.min(Math.max(dt, 0.4), wallThickness)
}

// Direct geometry construction — no CSG, guaranteed manifold
export function generateBox(params: BoxParams) {
  const { width, depth, height, wallThickness, divisionsX, divisionsZ, divisionThickness, chamferSize } = params
  const w2 = width / 2, d2 = depth / 2, h2 = height / 2
  const wt = wallThickness
  const dt = clampDivisionThickness(divisionThickness, wt)
  const c = Math.min(chamferSize, wt, width / 4, depth / 4) // clamped chamfer
  const iw = width - 2 * wt, id = depth - 2 * wt
  const iw2 = iw / 2, id2 = id / 2
  const fl = -h2 + wt // floor Z

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

  // Full breakpoints (outer + inner)
  const xAll = [-w2, ...xIn, w2]
  const yAll = [-d2, ...yIn, d2]

  // Chamfer breakpoints (add intermediate points for chamfer edges)
  const xAllC = c > 0 ? [-w2, -w2 + c, ...xIn, w2 - c, w2] : xAll
  const yAllC = c > 0 ? [-d2, -d2 + c, ...yIn, d2 - c, d2] : yAll

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
          polys.push({ vertices: [[x0,y0,-h2],[x1,y0,-h2],[x1,y1,-h2]] })
        } else if (isLastX && isLastY) {
          // Top-right corner
          polys.push({ vertices: [[x0,y0,-h2],[x1,y0,-h2],[x0,y1,-h2]] })
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

    // 4 chamfer face strips (vertical, full height)
    // Front-left: from (-w2, -d2+c) to (-w2+c, -d2)
    polys.push({ vertices: [[-w2+c,-d2,-h2],[-w2,-d2+c,-h2],[-w2,-d2+c,h2],[-w2+c,-d2,h2]] })
    // Front-right: from (w2-c, -d2) to (w2, -d2+c)
    polys.push({ vertices: [[w2,-d2+c,-h2],[w2-c,-d2,-h2],[w2-c,-d2,h2],[w2,-d2+c,h2]] })
    // Back-right: from (w2, d2-c) to (w2-c, d2)
    polys.push({ vertices: [[w2-c,d2,-h2],[w2,d2-c,-h2],[w2,d2-c,h2],[w2-c,d2,h2]] })
    // Back-left: from (-w2+c, d2) to (-w2, d2-c)
    polys.push({ vertices: [[-w2,d2-c,-h2],[-w2+c,d2,-h2],[-w2+c,d2,h2],[-w2,d2-c,h2]] })
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
  grid(xIn, [fl, h2],
    (x0, x1, z0, z1) => [[x1,-id2,z0],[x0,-id2,z0],[x0,-id2,z1],[x1,-id2,z1]],
    (x0, x1) => isXDiv(x0, x1))
  // Back inner (N = -Y)
  grid(xIn, [fl, h2],
    (x0, x1, z0, z1) => [[x0,id2,z0],[x1,id2,z0],[x1,id2,z1],[x0,id2,z1]],
    (x0, x1) => isXDiv(x0, x1))
  // Left inner (N = +X)
  grid(yIn, [fl, h2],
    (y0, y1, z0, z1) => [[-iw2,y0,z0],[-iw2,y1,z0],[-iw2,y1,z1],[-iw2,y0,z1]],
    (y0, y1) => isYDiv(y0, y1))
  // Right inner (N = -X)
  grid(yIn, [fl, h2],
    (y0, y1, z0, z1) => [[iw2,y1,z0],[iw2,y0,z0],[iw2,y0,z1],[iw2,y1,z1]],
    (y0, y1) => isYDiv(y0, y1))

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

        const isFirstX = i === 0, isLastX = i === xT.length - 2
        const isFirstY = j === 0, isLastY = j === yT.length - 2
        if (isFirstX && isFirstY) {
          polys.push({ vertices: [[x1,y0,h2],[x1,y1,h2],[x0,y1,h2]] })
        } else if (isLastX && isFirstY) {
          polys.push({ vertices: [[x0,y0,h2],[x0,y1,h2],[x1,y1,h2]] })
        } else if (isFirstX && isLastY) {
          polys.push({ vertices: [[x0,y0,h2],[x1,y0,h2],[x1,y1,h2]] })
        } else if (isLastX && isLastY) {
          polys.push({ vertices: [[x0,y0,h2],[x1,y0,h2],[x0,y1,h2]] })
        } else {
          polys.push({ vertices: [[x0,y0,h2],[x1,y0,h2],[x1,y1,h2],[x0,y1,h2]] })
        }
      }
    }
  } else {
    grid(xAll, yAll,
      (x0, x1, y0, y1) => [[x0,y0,h2],[x1,y0,h2],[x1,y1,h2],[x0,y1,h2]],
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
    grid(yIn, [fl, h2],
      (y0, y1, z0, z1) => [[xl,y1,z0],[xl,y0,z0],[xl,y0,z1],[xl,y1,z1]],
      (y0, y1) => isYDiv(y0, y1))
    // Right face (N = +X)
    grid(yIn, [fl, h2],
      (y0, y1, z0, z1) => [[xr,y0,z0],[xr,y1,z0],[xr,y1,z1],[xr,y0,z1]],
      (y0, y1) => isYDiv(y0, y1))
  }

  // === Y-DIVIDER WALL FACES ===
  for (const yd of yDivs) {
    const yf = yd - dt / 2, yb = yd + dt / 2
    // Front face (N = -Y)
    grid(xIn, [fl, h2],
      (x0, x1, z0, z1) => [[x0,yf,z0],[x1,yf,z0],[x1,yf,z1],[x0,yf,z1]],
      (x0, x1) => isXDiv(x0, x1))
    // Back face (N = +Y)
    grid(xIn, [fl, h2],
      (x0, x1, z0, z1) => [[x1,yb,z0],[x0,yb,z0],[x0,yb,z1],[x1,yb,z1]],
      (x0, x1) => isXDiv(x0, x1))
  }

  return { polygons: polys }
}

// ── Cutout patterns ───────────────────────────────────────────────────────────
// Grid of holes punched through the lid cap (or the sleeve's top and bottom
// walls) to save filament. Text always keeps a solid patch: holes that would
// intersect the text footprint are skipped, so engraved/embossed text sits on
// solid material.

interface Rect2 { x0: number; x1: number; y0: number; y1: number }

// 2D shape for one hole, centered at the origin. `size` is the across dimension.
function patternShape2D(pattern: LidPattern, size: number): any | null {
  const r = size / 2
  switch (pattern) {
    case 'circles': return circle({ radius: r, segments: 20 })
    case 'squares': return rectangle({ size: [size, size] })
    case 'diamonds': return polygon({ points: [[r, 0], [0, r], [-r, 0], [0, -r]] })
    case 'hexagons': return circle({ radius: r, segments: 6 })
    case 'triangles': return polygon({ points: [[0, r], [-r * 0.866, -r / 2], [r * 0.866, -r / 2]] })
    case 'slots': return rectangle({ size: [size * 2, size * 0.45] })
    default: return null
  }
}

// Half extents of a hole's footprint (grid fitting + exclusion tests)
function patternHalfExtents(pattern: LidPattern, size: number): [number, number] {
  return pattern === 'slots' ? [size, size * 0.225] : [size / 2, size / 2]
}

/**
 * Build the union of all pattern hole prisms for the given region, spanning
 * zFrom..zTo. Returns null when the pattern is off or nothing fits.
 * Rows are staggered by half a pitch (except squares and slots); triangles
 * alternate point-up/point-down so they tessellate.
 */
function patternPrisms(params: BoxParams, region: Rect2, zFrom: number, zTo: number, exclusions: Rect2[]): any | null {
  const pattern = params.lidPattern
  if (pattern === 'none') return null
  const size = Math.max(2, params.lidPatternSize)
  const spacing = Math.max(1.5, params.lidPatternSpacing)

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

  const shape = patternShape2D(pattern, size)
  if (!shape) return null
  const h = zTo - zFrom
  const prism = extrudeLinear({ height: h }, shape)
  const prismAlt = pattern === 'triangles'
    ? extrudeLinear({ height: h }, rotate([0, 0, Math.PI], shape))
    : prism

  const stagger = pattern !== 'squares' && pattern !== 'slots'
  const holes: any[] = []
  for (let row = 0; row < ny; row++) {
    const y = startY + row * py
    const odd = row % 2 === 1
    const offset = stagger && odd ? px / 2 : 0
    const count = stagger && odd ? nx - 1 : nx
    for (let col = 0; col < count; col++) {
      const x = startX + col * px + offset
      if (exclusions.some((r) => x + hx > r.x0 && x - hx < r.x1 && y + hy > r.y0 && y - hy < r.y1)) continue
      const p = pattern === 'triangles' && (col + row) % 2 === 1 ? prismAlt : prism
      holes.push(translate([x, y, zFrom], p))
    }
  }
  if (holes.length === 0) return null

  // Tree-reduce union (holes are disjoint, but jscad still wants one geometry)
  let current = holes
  while (current.length > 1) {
    const next: any[] = []
    for (let i = 0; i < current.length; i += 2) {
      next.push(i + 1 < current.length ? union(current[i], current[i + 1]) : current[i])
    }
    current = next
  }
  return current[0]
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
  if (includeHinge) {
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
    // Friction lid text is mirrored in X (it reads through the flip)
    exclusions.push(boundsRect(textGeometry, 1.5, !includeHinge))
  }
  return patternPrisms(params, region, -wt - 0.5, 0.5, exclusions)
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
// Hinged lids have NO lip (lh = 0 → plain slab): a lip can't coexist with a
// hinge, because a lid whose barrel aligns with the box knuckles when closed
// would need lip and barrel on opposite faces — unprintable flat. The hinged
// lid is instead modeled directly in its closed orientation (z=0 face up),
// which is also exactly what the knuckle placement assumes.
function generateFlatLid(params: BoxParams) {
  const { width, depth, height, wallThickness: wt, lidHeight: lhRaw, lidTolerance: tol, divisionsX, divisionsZ, divisionThickness, chamferSize, includeHinge } = params
  const lh = includeHinge ? 0 : Math.min(lhRaw, height - wt)  // lip can't exceed inner box height
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
  const xNotches = [...divisionsX].sort((a, b) => a - b)
    .map(p => innerW / 2 - (p / 100) * innerW)
  const yNotches = [...divisionsZ].sort((a, b) => a - b)
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
          polys.push({ vertices: [[xB[0],yB[ny - 1],-wt],[xB[1],yB[ny - 1],-wt],[xB[1],yB[ny],-wt]] })
        } else {
          polys.push({ vertices: [[xB[nx - 1],yB[ny - 1],-wt],[xB[nx],yB[ny - 1],-wt],[xB[nx - 1],yB[ny],-wt]] })
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
          polys.push({ vertices: [[xB[nx - 1],yB[ny - 1],z],[xB[nx - 1],yB[ny],z],[xB[nx],yB[ny - 1],z]] })
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

    // 4 chamfer face strips (corner diagonal walls)
    // Corner tops are always wing height (0) since corners are outside the lip
    const ct = 0 // corner top Z
    // Front-left
    polys.push({ vertices: [[-w2+c,-d2,-wt],[-w2,-d2+c,-wt],[-w2,-d2+c,ct],[-w2+c,-d2,ct]] })
    // Front-right
    polys.push({ vertices: [[w2,-d2+c,-wt],[w2-c,-d2,-wt],[w2-c,-d2,ct],[w2,-d2+c,ct]] })
    // Back-right
    polys.push({ vertices: [[w2-c,d2,-wt],[w2,d2-c,-wt],[w2,d2-c,ct],[w2-c,d2,ct]] })
    // Back-left
    polys.push({ vertices: [[-w2,d2-c,-wt],[-w2+c,d2,-wt],[-w2+c,d2,ct],[-w2,d2-c,ct]] })
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
  const { width, depth, height, wallThickness, lidHeight: lidHeightRaw, lidTolerance, divisionsX, divisionsZ, divisionThickness, lidTextStyle, chamferSize, includeHinge } = params
  const lidHeight = Math.min(lidHeightRaw, height - wallThickness)  // lip can't exceed inner box height
  const divThickness = clampDivisionThickness(divisionThickness, wallThickness)

  // Hinged lids are flat slabs modeled in closed orientation (see generateFlatLid).
  // Text goes on the TOP face, unmirrored — it's read in place, not through the cap.
  if (includeHinge) {
    let slab: any = cuboid({ size: [width, depth, wallThickness] })

    const c = Math.min(chamferSize, wallThickness, width / 4, depth / 4)
    if (c > 0) {
      const w2 = width / 2, d2 = depth / 2
      const cornerTris: [number, number][][] = [
        [[-w2, -d2], [-w2 + c, -d2], [-w2, -d2 + c]],  // front-left
        [[ w2, -d2], [ w2, -d2 + c], [ w2 - c, -d2]],  // front-right
        [[ w2,  d2], [ w2 - c,  d2], [ w2,  d2 - c]],  // back-right
        [[-w2,  d2], [-w2,  d2 - c], [-w2 + c,  d2]],  // back-left
      ]
      for (const points of cornerTris) {
        const prism = extrudeLinear({ height: wallThickness + 2 }, polygon({ points }))
        slab = subtract(slab, translate([0, 0, -(wallThickness + 2) / 2], prism))
      }
    }

    const capTop = wallThickness / 2
    if (lidTextStyle === 'engraved') {
      slab = subtract(slab, translate([0, 0, capTop - params.lidTextDepth], textGeometry))
    } else {
      slab = union(slab, translate([0, 0, capTop], textGeometry))
    }

    // Standard lid frame: bottom at -wallThickness, top at 0
    return translate([0, 0, -capTop], slab)
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

  for (const pct of divisionsX) {
    // Mirrored: the lid is used flipped about Y (x → -x), like the text
    const xPos = innerWidth / 2 - (pct / 100) * innerWidth
    const slot = cuboid({ size: [divThickness + lidTolerance * 2, lipOuterDepth + 0.2, lidHeight + 0.2] })
    lid = subtract(lid, translate([xPos, 0, lipCenterZ], slot))
  }

  for (const pct of divisionsZ) {
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

// Outer dimensions of the sleeve — shared by the generator, viewer and UI summary
export function sleeveOuterDims(params: BoxParams): { w: number; d: number; h: number } {
  const { width, depth, height, wallThickness: wt, sleeveTolerance: tol } = params
  return {
    w: width + 2 * tol + 2 * wt,
    d: depth + tol + wt,
    h: height + 2 * tol + 2 * wt,
  }
}

export function generateSleeve(params: BoxParams, textGeometry?: any): any {
  const { width, depth, wallThickness: wt, sleeveTolerance: tol, sleeveCutout, lidTextStyle, lidTextDepth } = params
  const { w: outerW, d: outerD, h: outerH } = sleeveOuterDims(params)
  const innerW = outerW - 2 * wt
  const innerH = outerH - 2 * wt
  const cavityD = depth + tol // from front opening to inside of back wall

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
  if (textGeometry) {
    const top = outerH / 2
    if (lidTextStyle === 'engraved') {
      sleeve = subtract(sleeve, translate([0, 0, top - lidTextDepth], textGeometry))
    } else {
      sleeve = union(sleeve, translate([0, 0, top], textGeometry))
    }
  }

  // Cutout pattern: full-height prisms perforate the top AND bottom walls in
  // matching positions (the middle is cavity air). Solid margins are kept at
  // the opening, the back wall, the sides, the finger notch, and the text.
  if (params.lidPattern !== 'none') {
    const exclusions: Rect2[] = []
    if (sleeveCutout) {
      const notchR = Math.min(width * 0.3, 10)
      exclusions.push({ x0: -notchR - 1.5, x1: notchR + 1.5, y0: -outerD / 2 - 1, y1: -outerD / 2 + notchR + 1.5 })
    }
    if (textGeometry) {
      exclusions.push(boundsRect(textGeometry, 1.5, false))
    }
    const region: Rect2 = {
      x0: -(innerW / 2 - 1.5),
      x1: innerW / 2 - 1.5,
      y0: -outerD / 2 + 4,
      y1: outerD / 2 - wt - 1.5,
    }
    const holes = patternPrisms(params, region, -outerH / 2 - 0.5, outerH / 2 + 0.5, exclusions)
    if (holes) sleeve = subtract(sleeve, holes)
  }

  return sleeve
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
// IMPORTANT — no boolean ops in here. JSCAD's union/subtract leave sliver
// polygons and unpaired edges on the split faces that survive even T-junction
// repair, and slicers report them as open edges. Every piece (clip, barrel,
// arm) is built as its own closed manifold — extrusion or revolve — and the
// pieces are concatenated as separate overlapping shells, which slicers merge.
//
// The hinged lid is a flat slab modeled in closed orientation (see
// generateFlatLid), so the lid knuckle below is also placed in the closed
// pose: arm spans the slab thickness Z ∈ [-wt, 0], barrel behind the back edge.
//
// LOCAL ORIGIN of every knuckle = hinge axis centre.
// Translation targets:
//   box knuckle  → (xC ± (K+GAP), d2+R, h2+wt+R)   barrel centre Z = h2+wt+R/2
//   lid knuckle  → (xC, d2+R, R)                    barrel centre Z = R/2
// When the lid is closed (slab bottom on the rim): lid-local Z=R →
// box Z = h2+wt+R  ✓  (axes coincide)

const HINGE_GAP  = 0.2      // side clearance between adjacent knuckles (mm)
const HINGE_SEGS = 32       // cylinder facets
const AXLE_CLEARANCE = 0.25 // radial clearance between axle stub and bore (mm)
const AXLE_ENGAGE = 1.4     // stub length: bridges HINGE_GAP, then seats in the bore
const AXLE_TAPER = 0.4      // stub tip is this much smaller in radius (lead-in)
const SNAP_PINCH = 0.6      // channel mouth narrower than the axle Ø by this much (mm)

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

/**
 * Knuckle mounting arm: cuboid below/behind the barrel, overlapping it.
 * Y ∈ [-R, 0], Z ∈ [-(R+armH), -R] in knuckle-local coords (origin = axis).
 */
function knuckleArm(K: number, R: number, armH: number): any {
  return translate([0, -R / 2, -(R + armH / 2)], cuboid({ size: [K, R, armH] }))
}

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
  const dz = -R / 2 // barrel centre below local origin, same convention as before

  const clip = translate([0, 0, dz], cClipBarrel(K, R, axleR))
  const arm = knuckleArm(K, R, wt + 10)

  const solids: any[] = []
  for (const xC of hingeXPositions(hingeCount, width)) {
    for (const x of [xC - K - HINGE_GAP, xC + K + HINGE_GAP]) {
      solids.push(translate([x, d2 + R, h2 + wt + R], clip))
      solids.push(translate([x, d2 + R, h2 + wt + R], arm))
    }
  }
  return mergeSolids(solids)
}

/**
 * All lid-side hinge knuckles: one middle knuckle per hinge position — barrel
 * plus both tapered snap-axle stubs as a single solid of revolution, and an
 * arm spanning the flat lid's thickness (Z ∈ [-wt, 0]). Separate closed
 * shells, no booleans. When closed: lid-local Z=R → box Z=h2+wt+R ✓.
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
  const arm = knuckleArm(K, R, wt)

  const solids: any[] = []
  for (const xC of hingeXPositions(hingeCount, width)) {
    solids.push(translate([xC, d2 + R, R], barrelWithStubs))
    solids.push(translate([xC, d2 + R, R], arm))
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
