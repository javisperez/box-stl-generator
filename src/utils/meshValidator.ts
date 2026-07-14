// Mesh-integrity checks for exported triangle soups. Pure data-in/data-out —
// no DOM, no JSCAD — so the same code runs in the browser (export-time guard)
// and in Node (scripts/check-stl.ts, the pre-push sweep).
//
// A printable STL must be a closed, consistently wound 2-manifold:
//  - every undirected edge shared by exactly 2 triangles (no open edges,
//    no fins/self-intersecting sheets),
//  - every directed edge used exactly once (paired edges traversed in
//    opposite directions — catches flipped facets and duplicated faces
//    that undirected parity alone misses),
//  - positive enclosed volume (a negative total means the shell is wound
//    inside-out even though its edges all pair up).

export interface Triangle {
  v1: [number, number, number]
  v2: [number, number, number]
  v3: [number, number, number]
}

export interface MeshReport {
  triangleCount: number
  openEdges: number // undirected edges used exactly once
  nonManifoldEdges: number // undirected edges used 3+ times
  windingConflicts: number // directed edges used more than once (flipped/duplicate facets)
  degenerateTriangles: number // zero-area facets (write a 0,0,0 normal into the STL)
  volumeMm3: number // signed enclosed volume; negative = inside-out shell
  ok: boolean
  issues: string[] // human-readable list of everything that failed
}

export function validateTriangles(triangles: Triangle[]): MeshReport {
  const vk = (v: [number, number, number]) => `${v[0]},${v[1]},${v[2]}`

  const undirected = new Map<string, number>()
  const directed = new Map<string, number>()
  let degenerateTriangles = 0
  let sixVolume = 0

  for (const { v1, v2, v3 } of triangles) {
    const keys = [vk(v1), vk(v2), vk(v3)]
    for (let i = 0; i < 3; i++) {
      const a = keys[i]
      const b = keys[(i + 1) % 3]
      const uk = a < b ? a + '|' + b : b + '|' + a
      undirected.set(uk, (undirected.get(uk) || 0) + 1)
      const dk = a + '>' + b
      directed.set(dk, (directed.get(dk) || 0) + 1)
    }

    const e1x = v2[0] - v1[0], e1y = v2[1] - v1[1], e1z = v2[2] - v1[2]
    const e2x = v3[0] - v1[0], e2y = v3[1] - v1[1], e2z = v3[2] - v1[2]
    const nx = e1y * e2z - e1z * e2y
    const ny = e1z * e2x - e1x * e2z
    const nz = e1x * e2y - e1y * e2x
    if (nx * nx + ny * ny + nz * nz === 0) degenerateTriangles++

    sixVolume +=
      v1[0] * (v2[1] * v3[2] - v2[2] * v3[1]) -
      v1[1] * (v2[0] * v3[2] - v2[2] * v3[0]) +
      v1[2] * (v2[0] * v3[1] - v2[1] * v3[0])
  }

  let openEdges = 0
  let nonManifoldEdges = 0
  for (const count of undirected.values()) {
    if (count === 1) openEdges++
    else if (count > 2) nonManifoldEdges++
  }

  let windingConflicts = 0
  for (const count of directed.values()) {
    if (count > 1) windingConflicts++
  }

  const volumeMm3 = sixVolume / 6

  const issues: string[] = []
  if (triangles.length === 0) issues.push('mesh is empty')
  if (openEdges > 0) issues.push(`${openEdges} open edge${openEdges === 1 ? '' : 's'}`)
  if (nonManifoldEdges > 0) issues.push(`${nonManifoldEdges} non-manifold edge${nonManifoldEdges === 1 ? '' : 's'}`)
  if (windingConflicts > 0) issues.push(`${windingConflicts} flipped/duplicate facet edge${windingConflicts === 1 ? '' : 's'}`)
  if (degenerateTriangles > 0) issues.push(`${degenerateTriangles} zero-area triangle${degenerateTriangles === 1 ? '' : 's'}`)
  if (triangles.length > 0 && volumeMm3 <= 0) issues.push(`non-positive enclosed volume (${volumeMm3.toFixed(3)} mm³)`)

  return {
    triangleCount: triangles.length,
    openEdges,
    nonManifoldEdges,
    windingConflicts,
    degenerateTriangles,
    volumeMm3,
    ok: issues.length === 0,
    issues,
  }
}
