import { modifiers } from '@jscad/modeling'

// CSG results (sleeve, text lids, hinge knuckles) contain T-junctions along the
// edges of merged coplanar faces — slicers report those as open edges. Repair
// them before export: snap near-identical vertices, insert the missing vertices
// at T-junctions, and triangulate. Direct-built geometry (plain {polygons}
// without a transforms matrix, like the box) is already manifold — leave it be,
// since the repair helpers require a real JSCAD geom3.
function repairForExport(jscadGeom: any): any {
  if (!jscadGeom || !jscadGeom.transforms) return jscadGeom
  try {
    // Cast: the package's .d.ts mistypes generalize as a namespace, but the
    // runtime export is the function itself
    return (modifiers as any).generalize({ snap: true, triangulate: true }, jscadGeom)
  } catch {
    return jscadGeom
  }
}

// Export STL directly from JSCAD geometry
export function exportJscadToSTL(jscadGeom: any, filename: string = 'box.stl') {
  const triangles = capBoundaryLoops(jscadToTriangles(repairForExport(jscadGeom)))
  const stl = trianglesToSTL(triangles)
  downloadSTL(stl, filename)
}

// Export multiple JSCAD geometries into a single STL (triangles are concatenated)
export function exportMultipleJscadToSTL(geoms: any[], filename: string = 'box.stl') {
  const triangles = capBoundaryLoops(geoms.flatMap(g => jscadToTriangles(repairForExport(g))))
  const stl = trianglesToSTL(triangles)
  downloadSTL(stl, filename)
}

type Vec3 = [number, number, number]

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

interface Triangle {
  v1: [number, number, number]
  v2: [number, number, number]
  v3: [number, number, number]
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
