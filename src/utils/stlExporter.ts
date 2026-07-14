import { Triangle, validateTriangles } from './meshValidator'

// CSG results (patterned boxes, sleeve, text lids) contain T-junctions along
// BSP split lines — slicers report those as open/non-manifold edges. Repair
// them on the exported triangle soup: weld vertices that differ only by
// floating-point noise, then insert the missing vertices along T-junction
// edges. Direct-built geometry (plain {polygons} without a transforms matrix,
// like the pattern-less box) is already manifold — leave it be.
//
// This deliberately does NOT use @jscad's modifiers.generalize({snap: true}):
// its snap runs BEFORE its T-junction pass and quantizes vertices to a coarse
// epsilon (~0.0006 mm for a box this size), which pushes split vertices on
// diagonal edges (e.g. the triangles pattern, slope 0.866…) off the edge line
// so the T-junction pass can no longer match them. The leftover open edges
// then got fan-capped into the overlapping garbage triangles slicers showed
// as "80 non-manifold edges". Welding at 1e-6 instead keeps collinearity
// intact for the T-junction pass, which runs at full precision.
export function jscadToRepairedTriangles(jscadGeom: any): Triangle[] {
  const triangles = jscadToTriangles(jscadGeom)
  if (!jscadGeom || !jscadGeom.transforms) return triangles
  return fixTjunctions(weldTriangles(triangles))
}

// The exact triangle soup an STL export writes: repaired per geometry, then
// concatenated, then boundary-capped. Exposed so the mesh-integrity sweep
// (scripts/check-stl.ts) validates precisely what users download.
export function prepareTrianglesForExport(geoms: any[]): Triangle[] {
  return capBoundaryLoops(geoms.filter(Boolean).flatMap(g => jscadToRepairedTriangles(g)))
}

// Export STL directly from JSCAD geometry
export function exportJscadToSTL(jscadGeom: any, filename: string = 'box.stl') {
  exportMultipleJscadToSTL([jscadGeom], filename)
}

// Export multiple JSCAD geometries into a single STL (triangles are concatenated)
export function exportMultipleJscadToSTL(geoms: any[], filename: string = 'box.stl') {
  const triangles = prepareTrianglesForExport(geoms)
  // Same integrity checks the pre-push sweep runs — if repair ever leaves a
  // broken mesh, warn before handing the user an STL their slicer will reject
  const report = validateTriangles(triangles)
  if (!report.ok) {
    const proceed = confirm(
      `Mesh integrity check failed for ${filename}:\n· ${report.issues.join('\n· ')}\n\n` +
      'The STL may not slice cleanly. Export anyway?'
    )
    if (!proceed) return
  }
  downloadSTL(trianglesToSTL(triangles), filename)
}

type Vec3 = [number, number, number]

// Quantize vertices so points that BSP splitting computed via different plane
// sequences (identical up to ~1e-12 noise) become bit-identical and edge keys
// pair up. 1e-6 mm is far below any printable feature, far above the noise.
const WELD_Q = 1e-6
function weldTriangles(triangles: Triangle[]): Triangle[] {
  const q = (n: number) => Math.round(n / WELD_Q) * WELD_Q
  const w = (v: Vec3): Vec3 => [q(v[0]), q(v[1]), q(v[2])]
  const out: Triangle[] = []
  for (const t of triangles) {
    const v1 = w(t.v1), v2 = w(t.v2), v3 = w(t.v3)
    // Drop triangles collapsed by welding (their two edge copies cancel out,
    // so removal keeps every remaining edge's pairing parity intact)
    const k1 = v1.join(), k2 = v2.join(), k3 = v3.join()
    if (k1 === k2 || k2 === k3 || k3 === k1) continue
    out.push({ v1, v2, v3 })
  }
  return out
}

// Repair T-junctions: wherever an edge is unpaired because the neighbouring
// face is split into sub-segments (a vertex sits mid-edge), split this
// triangle's edge at those vertices too. Runs at full precision, so it also
// handles diagonal edges whose intermediate vertices have irrational
// coordinates. Iterates because one split can expose the next.
const TJ_TOL = 1e-4 // max distance of a mid-edge vertex from the edge line (mm)
function fixTjunctions(triangles: Triangle[]): Triangle[] {
  const vk = (v: Vec3) => v.join()
  const ek = (a: string, b: string) => (a < b ? a + '|' + b : b + '|' + a)

  let tris = triangles
  for (let pass = 0; pass < 8; pass++) {
    const edgeCount = new Map<string, number>()
    for (const t of tris) {
      const ks = [vk(t.v1), vk(t.v2), vk(t.v3)]
      for (let i = 0; i < 3; i++) {
        const k = ek(ks[i], ks[(i + 1) % 3])
        edgeCount.set(k, (edgeCount.get(k) || 0) + 1)
      }
    }

    // Candidate split points: endpoints of unpaired edges (the fragmented
    // side's sub-segment ends are unpaired too, so the mid vertex is here)
    const candidates: Vec3[] = []
    const seen = new Set<string>()
    for (const t of tris) {
      const vs = [t.v1, t.v2, t.v3]
      for (let i = 0; i < 3; i++) {
        const a = vs[i], b = vs[(i + 1) % 3]
        if (edgeCount.get(ek(vk(a), vk(b))) !== 1) continue
        for (const v of [a, b]) {
          const k = vk(v)
          if (!seen.has(k)) { seen.add(k); candidates.push(v) }
        }
      }
    }
    if (candidates.length === 0) break

    let changed = false
    const next: Triangle[] = []
    for (const t of tris) {
      const vs = [t.v1, t.v2, t.v3]
      let replaced = false
      for (let i = 0; i < 3 && !replaced; i++) {
        const a = vs[i], b = vs[(i + 1) % 3], opp = vs[(i + 2) % 3]
        if (edgeCount.get(ek(vk(a), vk(b))) !== 1) continue

        // Vertices lying strictly inside segment a→b, sorted along it
        const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
        const len2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2]
        const oppKey = vk(opp), aKey = vk(a), bKey = vk(b)
        const splits: { t: number; v: Vec3 }[] = []
        for (const c of candidates) {
          const cKey = vk(c)
          if (cKey === aKey || cKey === bKey || cKey === oppKey) continue
          const ac: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
          const s = (ac[0] * ab[0] + ac[1] * ab[1] + ac[2] * ab[2]) / len2
          if (s <= 0 || s >= 1) continue
          const dx = ac[0] - s * ab[0], dy = ac[1] - s * ab[1], dz = ac[2] - s * ab[2]
          if (dx * dx + dy * dy + dz * dz > TJ_TOL * TJ_TOL) continue
          splits.push({ t: s, v: c })
        }
        if (splits.length === 0) continue

        splits.sort((p, q) => p.t - q.t)
        const chain = [a, ...splits.map((s) => s.v), b]
        for (let j = 0; j < chain.length - 1; j++) {
          next.push({ v1: chain[j], v2: chain[j + 1], v3: opp })
        }
        replaced = true
        changed = true
      }
      if (!replaced) next.push(t)
    }
    tris = next
    if (!changed) break
  }
  return tris
}

// Last line of defence for watertightness: some CSG results keep hairline
// sliver gaps (closed loops of unpaired edges, ~1 mm) that survive even
// T-junction repair — JSCAD's retessellate redraws merged coplanar face
// boundaries with simplified chords. Those gaps form small closed boundary
// loops; cap each one with a triangle fan so every edge is paired.
function capBoundaryLoops(triangles: Triangle[]): Triangle[] {
  const vk = (v: Vec3) => `${v[0]},${v[1]},${v[2]}`
  const ek = (a: string, b: string) => (a < b ? a + '|' + b : b + '|' + a)

  interface BoundaryEdge { a: Vec3; b: Vec3; count: number }
  const edges = new Map<string, BoundaryEdge>()
  const addEdge = (a: Vec3, b: Vec3) => {
    const k = ek(vk(a), vk(b))
    const e = edges.get(k)
    if (e) e.count++
    else edges.set(k, { a, b, count: 1 })
  }
  for (const t of triangles) {
    addEdge(t.v1, t.v2)
    addEdge(t.v2, t.v3)
    addEdge(t.v3, t.v1)
  }

  const boundary = [...edges.values()].filter((e) => e.count === 1)
  if (boundary.length === 0) return triangles

  const adjacency = new Map<string, BoundaryEdge[]>()
  for (const e of boundary) {
    for (const k of [vk(e.a), vk(e.b)]) {
      if (!adjacency.has(k)) adjacency.set(k, [])
      adjacency.get(k)!.push(e)
    }
  }

  const result = [...triangles]
  const used = new Set<BoundaryEdge>()
  for (const start of boundary) {
    if (used.has(start)) continue
    used.add(start)
    // Walk the boundary from this edge until the loop closes
    const loop: Vec3[] = [start.a, start.b]
    const startKey = vk(start.a)
    let curKey = vk(start.b)
    let guard = 0
    while (curKey !== startKey && guard++ < 10000) {
      const next = (adjacency.get(curKey) || []).find((e) => !used.has(e))
      if (!next) break
      used.add(next)
      const nextV = vk(next.a) === curKey ? next.b : next.a
      curKey = vk(nextV)
      if (curKey !== startKey) loop.push(nextV)
    }
    if (curKey !== startKey || loop.length < 3) continue // open chain — nothing safe to do
    // Fan-triangulate the loop (they're tiny, near-degenerate slivers)
    for (let i = 1; i < loop.length - 1; i++) {
      result.push({ v1: loop[0], v2: loop[i], v3: loop[i + 1] })
    }
  }
  return result
}

// Solid volume in cm³ via the divergence theorem (signed tetrahedra against the
// origin). Assumes closed, consistently wound meshes — which all our parts are.
export function jscadVolumeCm3(geoms: any[]): number {
  let sixV = 0
  for (const geom of geoms) {
    if (!geom) continue
    for (const { v1, v2, v3 } of jscadToTriangles(geom)) {
      sixV +=
        v1[0] * (v2[1] * v3[2] - v2[2] * v3[1]) -
        v1[1] * (v2[0] * v3[2] - v2[2] * v3[0]) +
        v1[2] * (v2[0] * v3[1] - v2[1] * v3[0])
    }
  }
  return Math.abs(sixV) / 6 / 1000 // mm³ → cm³
}

// Apply JSCAD transform matrix to a vertex
function applyTransform(v: number[], m: number[]): [number, number, number] {
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
  ]
}

function jscadToTriangles(jscadGeom: any): Triangle[] {
  if (!jscadGeom.polygons || jscadGeom.polygons.length === 0) {
    return []
  }

  // Check for JSCAD transform matrix (column-major 4x4)
  const m = jscadGeom.transforms as number[] | undefined
  const hasTransform = m && m.length === 16 &&
    !(m[0] === 1 && m[5] === 1 && m[10] === 1 && m[12] === 0 && m[13] === 0 && m[14] === 0)

  const triangles: Triangle[] = []

  for (const polygon of jscadGeom.polygons) {
    const verts = polygon.vertices
    if (verts.length < 3) continue

    // Fan-triangulate each polygon
    for (let i = 1; i < verts.length - 1; i++) {
      if (hasTransform && m) {
        triangles.push({
          v1: applyTransform(verts[0], m),
          v2: applyTransform(verts[i], m),
          v3: applyTransform(verts[i + 1], m),
        })
      } else {
        triangles.push({
          v1: [verts[0][0], verts[0][1], verts[0][2]],
          v2: [verts[i][0], verts[i][1], verts[i][2]],
          v3: [verts[i + 1][0], verts[i + 1][1], verts[i + 1][2]],
        })
      }
    }
  }

  return triangles
}

function trianglesToSTL(triangles: Triangle[]): string {
  let stl = 'solid box\n'

  for (const { v1, v2, v3 } of triangles) {
    const e1x = v2[0] - v1[0], e1y = v2[1] - v1[1], e1z = v2[2] - v1[2]
    const e2x = v3[0] - v1[0], e2y = v3[1] - v1[1], e2z = v3[2] - v1[2]
    let nx = e1y * e2z - e1z * e2y
    let ny = e1z * e2x - e1x * e2z
    let nz = e1x * e2y - e1y * e2x
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
    if (len > 0) { nx /= len; ny /= len; nz /= len }

    stl += `  facet normal ${nx} ${ny} ${nz}\n` +
      `    outer loop\n` +
      `      vertex ${v1[0]} ${v1[1]} ${v1[2]}\n` +
      `      vertex ${v2[0]} ${v2[1]} ${v2[2]}\n` +
      `      vertex ${v3[0]} ${v3[1]} ${v3[2]}\n` +
      `    endloop\n` +
      `  endfacet\n`
  }

  stl += 'endsolid box\n'
  return stl
}

function downloadSTL(stl: string, filename: string) {
  const blob = new Blob([stl], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
