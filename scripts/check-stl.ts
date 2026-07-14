// Mesh-integrity sweep: generates every representative part configuration
// (patterns × chamfers × dividers × lid styles × hinges × text) through the
// exact STL export pipeline and validates the resulting triangle soup for
// open edges, non-manifold edges, flipped/duplicate facets, zero-area
// triangles and inside-out shells.
//
// Run with `pnpm run check:stl`. The pre-push hook (.githooks/pre-push) and CI
// run this so code that generates broken STLs never leaves the machine.
//
// Text lids are exercised with a synthetic glyph (union of row strips, the
// same shape textToJscadGeometry produces) because the real text path needs a
// browser canvas.

import { primitives, booleans, transforms } from '@jscad/modeling'
import {
  BoxParams,
  LID_PATTERNS,
  generateBox,
  generateLid,
  generateSleeve,
  generateBoxHingeKnuckles,
  generateLidHingeKnuckles,
} from '../src/utils/boxGenerator'
import { DEFAULTS } from '../src/utils/projectStorage'
import { prepareTrianglesForExport } from '../src/utils/stlExporter'
import { validateTriangles } from '../src/utils/meshValidator'

const { cuboid } = primitives
const { union } = booleans
const { translate } = transforms

const PATTERNS = LID_PATTERNS.map(p => p.value).filter(v => v !== 'none')

// Same output shape as textToJscadGeometry (a union of 0.5 mm row strips,
// centered on X/Y, Z from 0 to textDepth) built without a canvas: an "H".
function syntheticTextGeometry(textDepth: number): any {
  const strips: any[] = []
  const strip = (xCenter: number, w: number, y: number) =>
    translate([xCenter, y, textDepth / 2], cuboid({ size: [w, 0.5, textDepth] }))
  for (let i = 0; i < 20; i++) {
    const y = -5 + 0.25 + i * 0.5
    strips.push(strip(-3.75, 1.5, y))
    strips.push(strip(3.75, 1.5, y))
    if (i === 9 || i === 10) strips.push(strip(0, 6, y))
  }
  let current = strips
  while (current.length > 1) {
    const next: any[] = []
    for (let i = 0; i < current.length; i += 2) {
      next.push(i + 1 < current.length ? union(current[i], current[i + 1]) : current[i])
    }
    current = next
  }
  return current[0]
}

const base: BoxParams = { ...DEFAULTS, width: 60, depth: 45, height: 30 }

interface Check {
  name: string
  build: () => any[] // the geometry list a single exported STL contains
}

const checks: Check[] = [
  { name: 'box · plain', build: () => [generateBox(base)] },
  {
    name: 'box · dividers + chamfer',
    build: () => [generateBox({ ...base, divisionsX: [33, 66], divisionsZ: [50], chamferSize: 1.5 })],
  },
  ...PATTERNS.map(pattern => ({
    name: `box · pattern ${pattern} + chamfer`,
    build: () => [generateBox({ ...base, boxPattern: pattern, chamferSize: 1.5 })],
  })),
  {
    name: 'lid · plain',
    build: () => [generateLid({ ...base, includeLid: true })],
  },
  ...PATTERNS.map(pattern => ({
    name: `lid · pattern ${pattern} + chamfer`,
    build: () => [generateLid({ ...base, includeLid: true, lidPattern: pattern, chamferSize: 1.5 })],
  })),
  {
    name: 'lid · text engraved',
    build: () => {
      const p = { ...base, includeLid: true, lidText: 'H', lidTextStyle: 'engraved' as const }
      return [generateLid(p, syntheticTextGeometry(p.lidTextDepth))]
    },
  },
  {
    name: 'lid · text embossed',
    build: () => {
      const p = { ...base, includeLid: true, lidText: 'H', lidTextStyle: 'embossed' as const }
      return [generateLid(p, syntheticTextGeometry(p.lidTextDepth))]
    },
  },
  {
    name: 'box · hinged (with knuckles)',
    build: () => {
      const p = { ...base, includeLid: true, includeHinge: true }
      return [generateBox(p), generateBoxHingeKnuckles(p)]
    },
  },
  {
    name: 'lid · hinged (with knuckles)',
    build: () => {
      const p = { ...base, includeLid: true, includeHinge: true }
      return [generateLid(p), generateLidHingeKnuckles(p)]
    },
  },
  {
    name: 'lid · hinged ×2 + pattern hexagons',
    build: () => {
      const p = { ...base, includeLid: true, includeHinge: true, hingeCount: 2, lidPattern: 'hexagons' as const }
      return [generateLid(p), generateLidHingeKnuckles(p)]
    },
  },
  {
    name: 'sleeve · plain + cutout',
    build: () => [generateSleeve({ ...base, includeLid: true, lidStyle: 'sleeve' })],
  },
  {
    name: 'sleeve · pattern triangles + text engraved',
    build: () => {
      const p = {
        ...base,
        includeLid: true,
        lidStyle: 'sleeve' as const,
        lidPattern: 'triangles' as const,
        lidText: 'H',
        lidTextStyle: 'engraved' as const,
      }
      return [generateSleeve(p, syntheticTextGeometry(p.lidTextDepth))]
    },
  },
]

let failures = 0
const started = Date.now()
console.log(`Mesh-integrity sweep: ${checks.length} export configurations\n`)

for (const check of checks) {
  const t0 = Date.now()
  try {
    const triangles = prepareTrianglesForExport(check.build())
    const report = validateTriangles(triangles)
    const stats = `${report.triangleCount} tris, ${(report.volumeMm3 / 1000).toFixed(1)} cm³, ${Date.now() - t0} ms`
    if (report.ok) {
      console.log(`  ✓ ${check.name.padEnd(46)} ${stats}`)
    } else {
      failures++
      console.error(`  ✗ ${check.name.padEnd(46)} ${stats}`)
      for (const issue of report.issues) console.error(`      · ${issue}`)
    }
  } catch (err) {
    failures++
    console.error(`  ✗ ${check.name.padEnd(46)} threw: ${err instanceof Error ? err.message : err}`)
  }
}

console.log(`\n${checks.length - failures}/${checks.length} passed in ${((Date.now() - started) / 1000).toFixed(1)} s`)
if (failures > 0) {
  console.error(`\n${failures} configuration${failures === 1 ? '' : 's'} would export a broken STL.`)
  process.exit(1)
}
