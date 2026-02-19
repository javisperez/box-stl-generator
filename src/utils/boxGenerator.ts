import { primitives, booleans, transforms, extrusions } from '@jscad/modeling'
import * as THREE from 'three'

const { cuboid, polygon } = primitives
const { subtract, union } = booleans
const { translate, mirrorX } = transforms
const { extrudeLinear } = extrusions

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
  lidText: string
  lidTextDepth: number
  lidTextSize: number
  lidTextStyle: 'engraved' | 'embossed'
  chamferSize: number        // 45° chamfer on outer vertical edges (0 = none)
}

// Direct geometry construction — no CSG, guaranteed manifold
export function generateBox(params: BoxParams) {
  const { width, depth, height, wallThickness, divisionsX, divisionsZ, chamferSize } = params
  const w2 = width / 2, d2 = depth / 2, h2 = height / 2
  const wt = wallThickness
  const c = Math.min(chamferSize, wt, width / 4, depth / 4) // clamped chamfer
  const iw = width - 2 * wt, id = depth - 2 * wt
  const iw2 = iw / 2, id2 = id / 2
  const fl = -h2 + wt // floor Z

  // Divider positions (absolute coords)
  const xDivs = [...divisionsX].sort((a, b) => a - b).map(p => -iw2 + (p / 100) * iw)
  const yDivs = [...divisionsZ].sort((a, b) => a - b).map(p => -id2 + (p / 100) * id)

  // Breakpoints: inner area split at divider edges
  const xIn: number[] = [-iw2]
  for (const x of xDivs) { xIn.push(x - wt / 2, x + wt / 2) }
  xIn.push(iw2)
  const yIn: number[] = [-id2]
  for (const y of yDivs) { yIn.push(y - wt / 2, y + wt / 2) }
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
    xDivs.some(x => Math.abs((a + b) / 2 - x) < wt / 2 - 0.001)
  const isYDiv = (a: number, b: number) =>
    yDivs.some(y => Math.abs((a + b) / 2 - y) < wt / 2 - 0.001)

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
    const xl = xd - wt / 2, xr = xd + wt / 2
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
    const yf = yd - wt / 2, yb = yd + wt / 2
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

export function generateLid(params: BoxParams, textGeometry?: any) {
  // Text requires CSG operations (subtract/union)
  if (textGeometry) {
    return generateLidCSG(params, textGeometry)
  }
  return generateFlatLid(params)
}

// Direct geometry construction for flat lids — no CSG, guaranteed manifold.
// Uses a heightmap grid: cap cells have top=0, lip wall cells have top=lidHeight.
// Vertical step faces are generated automatically where heights differ.
function generateFlatLid(params: BoxParams) {
  const { width, depth, wallThickness: wt, lidHeight: lh, lidTolerance: tol, divisionsX, divisionsZ, chamferSize } = params

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
  const sw = wt + tol * 2          // slot width

  const xNotches = [...divisionsX].sort((a, b) => a - b)
    .map(p => -innerW / 2 + (p / 100) * innerW)
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
  const { width, depth, wallThickness, lidHeight, lidTolerance, divisionsX, divisionsZ, lidTextStyle, chamferSize } = params

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
    const xPos = -innerWidth / 2 + (pct / 100) * innerWidth
    const slot = cuboid({ size: [wallThickness + lidTolerance * 2, lipOuterDepth + 0.2, lidHeight + 0.2] })
    lid = subtract(lid, translate([xPos, 0, lipCenterZ], slot))
  }

  for (const pct of divisionsZ) {
    const yPos = -innerDepth / 2 + (pct / 100) * innerDepth
    const slot = cuboid({ size: [lipOuterWidth + 0.2, wallThickness + lidTolerance * 2, lidHeight + 0.2] })
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
