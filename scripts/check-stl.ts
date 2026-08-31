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
  makeCustomHole,
  makeLidCustomHole,
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
    name: 'box · finger slots x + dividers',
    build: () => [generateBox({ ...base, divisionsX: [33, 66], fingerSlotAxes: 'x' })],
  },
  {
    name: 'box · finger slots both + dividers + chamfer',
    build: () => [generateBox({
      ...base, divisionsX: [25, 50, 75], divisionsZ: [40], chamferSize: 1.5,
      fingerSlotAxes: 'both', fingerSlotWidth: 12, fingerSlotDepth: 20, fingerSlotPosition: 30,
    })],
  },
  {
    name: 'box · finger slots grid X+Z dividers (per-span)',
    build: () => [generateBox({
      ...base, divisionsX: [33, 66], divisionsZ: [50],
      fingerSlotAxes: 'both', fingerSlotWidth: 30, fingerSlotDepth: 15,
    })],
  },
  {
    name: 'box · finger slots outer walls only (no divider notches)',
    build: () => [generateBox({
      ...base, divisionsX: [33, 66], divisionsZ: [50],
      fingerSlotAxes: 'both', fingerSlotDividers: false,
    })],
  },
  {
    name: 'box · finger slots dividers only (no outer notches)',
    build: () => [generateBox({
      ...base, divisionsX: [33, 66], divisionsZ: [50],
      fingerSlotAxes: 'both', fingerSlotOuterWalls: false, fingerSlotDividers: true,
    })],
  },
  {
    name: 'box · finger slots dividers only + hinge (back wall still solid)',
    build: () => [generateBox({
      ...base, divisionsZ: [50], includeHinge: true,
      fingerSlotAxes: 'z', fingerSlotOuterWalls: false, fingerSlotDividers: true,
    })],
  },
  ...PATTERNS.map(pattern => ({
    name: `box · pattern ${pattern} + dividers cut too`,
    build: () => [generateBox({
      ...base, boxPattern: pattern, divisionsX: [33, 66], divisionsZ: [50],
      boxPatternDividers: true,
    })],
  })),
  {
    name: 'box · pattern hexagons + dividers, chamfer, finger slots (combined)',
    build: () => [generateBox({
      ...base, boxPattern: 'hexagons', chamferSize: 1.5,
      divisionsX: [50], divisionsZ: [40], boxPatternDividers: true,
      fingerSlotAxes: 'both',
    })],
  },
  {
    name: 'box · pattern squares + skip floor (base stays flat)',
    build: () => [generateBox({ ...base, boxPattern: 'squares', boxPatternSkipFloor: true })],
  },
  {
    name: 'box · pattern circles + skip floor + dividers cut too',
    build: () => [generateBox({
      ...base, boxPattern: 'circles', divisionsX: [50], divisionsZ: [50],
      boxPatternSkipFloor: true, boxPatternDividers: true,
    })],
  },
  {
    name: 'box · finger slots + pattern hexagons',
    build: () => [generateBox({
      ...base, divisionsX: [50], boxPattern: 'hexagons', fingerSlotAxes: 'both',
    })],
  },
  {
    name: 'box · finger slots max depth + off-centre',
    build: () => [generateBox({
      ...base, divisionsZ: [50], fingerSlotAxes: 'both',
      fingerSlotWidth: 200, fingerSlotDepth: 200, fingerSlotPosition: 100,
    })],
  },
  {
    name: 'box · finger slots z + hinge (back wall solid)',
    build: () => {
      const p = { ...base, includeLid: true, includeHinge: true, fingerSlotAxes: 'z' as const }
      return [generateBox(p), generateBoxHingeKnuckles(p)]
    },
  },
  ...(['front', 'back', 'left', 'right', 'floor'] as const).map(face => ({
    name: `box · custom hole on ${face}`,
    build: () => [generateBox({
      ...base,
      customHoles: [makeCustomHole({ face, shape: 'hexagons', size: 10, posU: 50, posV: 50 })],
    })],
  })),
  ...PATTERNS.map(shape => ({
    name: `box · custom hole shape ${shape}`,
    build: () => [generateBox({
      ...base,
      customHoles: [makeCustomHole({ face: 'front', shape, size: 12, posU: 50, posV: 50 })],
    })],
  })),
  {
    name: 'box · custom holes at extreme positions (0%/100%) + chamfer',
    build: () => [generateBox({
      ...base,
      chamferSize: 1.5,
      customHoles: [
        makeCustomHole({ face: 'front', shape: 'circles', size: 8, posU: 0, posV: 0 }),
        makeCustomHole({ face: 'front', shape: 'circles', size: 8, posU: 100, posV: 100 }),
        makeCustomHole({ face: 'left', shape: 'squares', size: 8, posU: 0, posV: 100 }),
        makeCustomHole({ face: 'right', shape: 'diamonds', size: 8, posU: 100, posV: 0 }),
        makeCustomHole({ face: 'floor', shape: 'triangles', size: 8, posU: 0, posV: 0 }),
      ],
    })],
  },
  {
    name: 'box · custom holes + dividers + finger slots + pattern',
    build: () => [generateBox({
      ...base,
      divisionsX: [50], divisionsZ: [50],
      boxPattern: 'circles', fingerSlotAxes: 'both',
      customHoles: [
        makeCustomHole({ face: 'front', shape: 'hexagons', size: 10, posU: 20, posV: 80 }),
        makeCustomHole({ face: 'back', shape: 'slots', size: 10, posU: 80, posV: 20 }),
      ],
    })],
  },
  {
    name: 'box · custom hole on back wall with hinge',
    build: () => {
      const p = {
        ...base, includeLid: true, includeHinge: true,
        customHoles: [makeCustomHole({ face: 'back', shape: 'circles', size: 10, posU: 50, posV: 10 })],
      }
      return [generateBox(p), generateBoxHingeKnuckles(p)]
    },
  },
  {
    name: 'box · custom hole slot with independent width/length',
    build: () => [generateBox({
      ...base,
      customHoles: [
        makeCustomHole({ face: 'front', shape: 'slots', useCustomSlotSize: true, slotWidth: 30, slotLength: 6, posU: 50, posV: 50 }),
        makeCustomHole({ face: 'floor', shape: 'slots', useCustomSlotSize: true, slotWidth: 5, slotLength: 35, posU: 50, posV: 50 }),
      ],
    })],
  },
  {
    name: 'box · floor corner screw holes',
    build: () => [generateBox({
      ...base,
      customHoles: [makeCustomHole({ face: 'floor', shape: 'circles', size: 4, cornerHoles: true, cornerInsetX: 6, cornerInsetY: 6 })],
    })],
  },
  {
    name: 'box · floor corner screw holes + chamfer + dividers',
    build: () => [generateBox({
      ...base,
      chamferSize: 1.5, divisionsX: [50],
      customHoles: [makeCustomHole({ face: 'floor', shape: 'circles', size: 5, cornerHoles: true, cornerInsetX: 20, cornerInsetY: 5 })],
    })],
  },
  {
    name: 'box · floor corner screw holes shifted off-center (extremes)',
    build: () => [generateBox({
      ...base,
      customHoles: [
        makeCustomHole({ face: 'floor', shape: 'circles', size: 4, cornerHoles: true, cornerInsetX: 20, cornerInsetY: 15, posU: 0, posV: 0 }),
      ],
    })],
  },
  {
    name: 'box · floor corner screw holes shifted off-center (opposite extreme)',
    build: () => [generateBox({
      ...base,
      customHoles: [
        makeCustomHole({ face: 'floor', shape: 'circles', size: 4, cornerHoles: true, cornerInsetX: 20, cornerInsetY: 15, posU: 100, posV: 100 }),
      ],
    })],
  },
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
    name: 'lid · custom holes (mixed shapes incl. slot width/length)',
    build: () => [generateLid({
      ...base, includeLid: true,
      lidCustomHoles: [
        makeLidCustomHole({ shape: 'circles', size: 8, posU: 20, posV: 20 }),
        makeLidCustomHole({ shape: 'slots', useCustomSlotSize: true, slotWidth: 25, slotLength: 5, posU: 70, posV: 70 }),
      ],
    })],
  },
  {
    name: 'lid · corner screw holes (friction lid)',
    build: () => [generateLid({
      ...base, includeLid: true,
      lidCustomHoles: [makeLidCustomHole({ shape: 'circles', size: 4, cornerHoles: true, cornerInsetX: 6, cornerInsetY: 12 })],
    })],
  },
  {
    name: 'lid · corner screw holes (hinged, flat slab)',
    build: () => [generateLid({
      ...base, includeLid: true, includeHinge: true,
      lidCustomHoles: [makeLidCustomHole({ shape: 'circles', size: 5, cornerHoles: true, cornerInsetX: 8, cornerInsetY: 8 })],
    })],
  },
  {
    name: 'lid · corner screw holes shifted off-center',
    build: () => [generateLid({
      ...base, includeLid: true,
      lidCustomHoles: [makeLidCustomHole({ shape: 'circles', size: 4, cornerHoles: true, cornerInsetX: 20, cornerInsetY: 16, posU: 0, posV: 100 })],
    })],
  },
  {
    name: 'lid · corner screw holes + text (exclusion still applies)',
    build: () => {
      const p = {
        ...base, includeLid: true, lidText: 'H', lidTextStyle: 'engraved' as const,
        lidCustomHoles: [makeLidCustomHole({ shape: 'circles', size: 4, cornerHoles: true, cornerInsetX: 6, cornerInsetY: 6 })],
      }
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
