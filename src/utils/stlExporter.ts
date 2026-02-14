// Export STL directly from JSCAD geometry
export function exportJscadToSTL(jscadGeom: any, filename: string = 'box.stl') {
  const triangles = jscadToTriangles(jscadGeom)
  const stl = trianglesToSTL(triangles)
  downloadSTL(stl, filename)
}

interface Triangle {
  v1: [number, number, number]
  v2: [number, number, number]
  v3: [number, number, number]
}

function jscadToTriangles(jscadGeom: any): Triangle[] {
  if (!jscadGeom.polygons || jscadGeom.polygons.length === 0) {
    return []
  }

  const triangles: Triangle[] = []

  for (const polygon of jscadGeom.polygons) {
    const verts = polygon.vertices
    if (verts.length < 3) continue

    // Fan-triangulate each polygon
    for (let i = 1; i < verts.length - 1; i++) {
      triangles.push({
        v1: [verts[0][0], verts[0][1], verts[0][2]],
        v2: [verts[i][0], verts[i][1], verts[i][2]],
        v3: [verts[i + 1][0], verts[i + 1][1], verts[i + 1][2]],
      })
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
