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
import { compartmentSpans, layoutFromDepths, layoutFromItemGrid } from '../src/utils/boxLayout'
import { arrangeOnPlate } from '../src/utils/plateLayout'

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
    name: 'box · finger slots on dividers only (outer walls solid)',
    build: () => [generateBox({
      ...base, divisionsX: [33, 66], divisionsZ: [50],
      fingerSlotAxes: 'both', fingerSlotWalls: false,
    })],
  },
  {
    name: 'box · finger slots dividers only + pattern hexagons',
    build: () => [generateBox({
      ...base, divisionsX: [50], boxPattern: 'hexagons',
      fingerSlotAxes: 'both', fingerSlotWalls: false,
    })],
  },
  {
    name: 'box · finger slots with outer walls and dividers both off',
    build: () => [generateBox({
      ...base, divisionsX: [50], fingerSlotAxes: 'both',
      fingerSlotWalls: false, fingerSlotDividers: false,
    })],
  },
  {
    name: 'box · dividers lowered (X + Z)',
    build: () => [generateBox({ ...base, divisionsX: [33, 66], divisionsZ: [50], dividerHeight: 12 })],
  },
  {
    name: 'box · dividers lowered + chamfer',
    build: () => [generateBox({ ...base, divisionsX: [50], divisionsZ: [40, 70], dividerHeight: 8, chamferSize: 2 })],
  },
  {
    name: 'box · dividers lowered + pattern hexagons',
    build: () => [generateBox({ ...base, divisionsX: [50], divisionsZ: [50], dividerHeight: 10, boxPattern: 'hexagons' })],
  },
  {
    name: 'box · dividers lowered + finger slots (slot cuts through divider top)',
    build: () => [generateBox({
      ...base, divisionsX: [50], divisionsZ: [50], dividerHeight: 18,
      fingerSlotAxes: 'both', fingerSlotDepth: 15,
    })],
  },
  {
    name: 'box · dividers lowered below finger slot floor (dividers not notched)',
    build: () => [generateBox({
      ...base, divisionsX: [50], divisionsZ: [50], dividerHeight: 6,
      fingerSlotAxes: 'both', fingerSlotDepth: 15,
    })],
  },
  {
    name: 'lid · friction lid over lowered dividers (no lip notches)',
    build: () => [generateLid({
      ...base, includeLid: true, divisionsX: [50], divisionsZ: [50], dividerHeight: 10, lidHeight: 5,
    })],
  },
  {
    name: 'lid · friction lid over dividers that reach the lip (notched)',
    build: () => [generateLid({
      ...base, includeLid: true, divisionsX: [50], divisionsZ: [50], dividerHeight: 26, lidHeight: 5,
    })],
  },
  {
    name: 'box · pattern hexagons, floor kept solid',
    build: () => [generateBox({ ...base, boxPattern: 'hexagons', boxPatternFloor: false })],
  },
  {
    name: 'box · pattern circles + chamfer + dividers, floor kept solid',
    build: () => [generateBox({
      ...base, boxPattern: 'circles', boxPatternFloor: false, chamferSize: 2, divisionsX: [50], divisionsZ: [50],
    })],
  },
  ...PATTERNS.map((pattern): Check => ({
    name: `box · divider cutouts ${pattern} (X + Z crossing)`,
    build: () => [generateBox({
      ...base, width: 90, depth: 70, height: 40, divisionsX: [33, 66], divisionsZ: [50],
      boxPattern: pattern, boxPatternDividers: true,
    })],
  })),
  {
    name: 'box · divider cutouts + chamfer + floor kept solid',
    build: () => [generateBox({
      ...base, width: 90, depth: 70, height: 40, divisionsX: [50], divisionsZ: [40, 70],
      boxPattern: 'circles', boxPatternDividers: true, boxPatternFloor: false, chamferSize: 2,
    })],
  },
  {
    name: 'box · divider cutouts on lowered dividers',
    build: () => [generateBox({
      ...base, width: 90, depth: 70, height: 40, divisionsX: [50], divisionsZ: [50],
      boxPattern: 'hexagons', boxPatternDividers: true, dividerHeight: 24,
    })],
  },
  {
    name: 'box · divider cutouts + finger slots on dividers',
    build: () => [generateBox({
      ...base, width: 90, depth: 70, height: 40, divisionsX: [50], divisionsZ: [50],
      boxPattern: 'squares', boxPatternDividers: true, fingerSlotAxes: 'both', fingerSlotDepth: 12,
    })],
  },
  {
    name: 'box · divider cutouts on thin dividers (0.6 mm)',
    build: () => [generateBox({
      ...base, width: 90, depth: 70, height: 40, divisionsX: [50], divisionsZ: [50],
      boxPattern: 'diamonds', boxPatternDividers: true, divisionThickness: 0.6,
    })],
  },
  {
    name: 'box · divider cutouts, dividers too short for a hole (skipped)',
    build: () => [generateBox({
      ...base, divisionsX: [50], boxPattern: 'circles', boxPatternDividers: true, dividerHeight: 4,
    })],
  },
  {
    name: 'box · rounded finger slots, both axes + dividers',
    build: () => [generateBox({
      ...base, divisionsX: [33, 66], divisionsZ: [50],
      fingerSlotAxes: 'both', fingerSlotRound: true, fingerSlotWidth: 12, fingerSlotDepth: 14,
    })],
  },
  {
    name: 'box · rounded finger slots, full semicircle (width 2 × depth)',
    build: () => [generateBox({
      ...base, fingerSlotAxes: 'both', fingerSlotRound: true, fingerSlotWidth: 20, fingerSlotDepth: 10,
    })],
  },
  {
    name: 'box · rounded finger slots, shallow (only corners rounded)',
    build: () => [generateBox({
      ...base, fingerSlotAxes: 'both', fingerSlotRound: true, fingerSlotWidth: 20, fingerSlotDepth: 4,
    })],
  },
  {
    name: 'box · rounded finger slots + chamfer + pattern, dividers only',
    build: () => [generateBox({
      ...base, divisionsX: [50], divisionsZ: [50], chamferSize: 2, boxPattern: 'circles',
      fingerSlotAxes: 'both', fingerSlotRound: true, fingerSlotWalls: false,
    })],
  },
  {
    name: 'box · rounded finger slots + hinge (back wall solid)',
    build: () => {
      const p = { ...base, includeLid: true, includeHinge: true, fingerSlotAxes: 'z' as const, fingerSlotRound: true }
      return [generateBox(p), generateBoxHingeKnuckles(p)]
    },
  },
  {
    name: 'box · rounded finger slots on lowered dividers',
    build: () => [generateBox({
      ...base, divisionsX: [50], divisionsZ: [50], dividerHeight: 20,
      fingerSlotAxes: 'both', fingerSlotRound: true, fingerSlotDepth: 12,
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

// ── Layout maths ──────────────────────────────────────────────────────────────
// The "Start from…" calculators promise exact clear compartment sizes. Feed their
// output through the same span maths the divider editor uses and compare.
interface LayoutCheck { name: string; run: () => string | null } // null = pass, else what went wrong
const near = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 0.02)
const layoutChecks: LayoutCheck[] = [
  {
    name: 'divisions 26·26·26·22 mm, 1 mm walls → exactly those depths',
    run: () => {
      const { depth, positions } = layoutFromDepths([26, 26, 26, 22], 1)
      const spans = compartmentSpans(positions, depth - 2, 1)
      return depth === 105 && near(spans, [26, 26, 26, 22]) ? null : `depth ${depth}, spans ${spans.map(n => n.toFixed(2)).join(' · ')}`
    },
  },
  {
    name: 'divisions 51·48·30 mm, 2 mm walls → exactly those depths',
    run: () => {
      const { depth, positions } = layoutFromDepths([51, 48, 30], 2)
      const spans = compartmentSpans(positions, depth - 4, 2)
      return near(spans, [51, 48, 30]) ? null : `spans ${spans.map(n => n.toFixed(2)).join(' · ')}`
    },
  },
  {
    name: 'divisions with a fractional size (25.5·30.25 mm, 1.2 mm walls)',
    run: () => {
      const { depth, positions } = layoutFromDepths([25.5, 30.25], 1.2)
      const spans = compartmentSpans(positions, depth - 2.4, 1.2)
      return near(spans, [25.5, 30.25]) ? null : `spans ${spans.map(n => n.toFixed(2)).join(' · ')}`
    },
  },
  {
    name: 'item grid 3×2 of 50×30 mm, 2 mm walls, 1.2 mm dividers → exact clear sizes',
    run: () => {
      const g = layoutFromItemGrid(50, 30, 3, 2, 2, 1.2)
      const x = compartmentSpans(g.divisionsX, g.width - 4, 1.2)
      const z = compartmentSpans(g.divisionsZ, g.depth - 4, 1.2)
      return near(x, [50, 50, 50]) && near(z, [30, 30]) ? null : `x ${x.map(n => n.toFixed(2)).join(' · ')}, z ${z.map(n => n.toFixed(2)).join(' · ')}`
    },
  },
  {
    name: 'a leftover hinge flag with no lid does not keep the back wall solid (finger slots)',
    run: () => {
      const p = { ...base, divisionsX: [50], fingerSlotAxes: 'both' as const }
      const a = JSON.stringify(generateBox({ ...p, includeLid: false, includeHinge: true }))
      const b = JSON.stringify(generateBox({ ...p, includeLid: false, includeHinge: false }))
      return a === b ? null : 'box with includeHinge on but no lid differs from the same box with it off'
    },
  },
  {
    name: 'a leftover hinge flag with no lid does not keep the back wall solid (cutout pattern)',
    run: () => {
      const p = { ...base, boxPattern: 'hexagons' as const }
      const a = JSON.stringify(generateBox({ ...p, includeLid: false, includeHinge: true }))
      const b = JSON.stringify(generateBox({ ...p, includeLid: false, includeHinge: false }))
      return a === b ? null : 'box with includeHinge on but no lid differs from the same box with it off'
    },
  },
  {
    name: 'a sleeve with a leftover hinge flag does not keep the back wall solid',
    run: () => {
      const p = { ...base, divisionsX: [50], fingerSlotAxes: 'both' as const, includeLid: true, lidStyle: 'sleeve' as const }
      const a = JSON.stringify(generateBox({ ...p, includeHinge: true }))
      const b = JSON.stringify(generateBox({ ...p, includeHinge: false }))
      return a === b ? null : 'sleeve box with includeHinge on differs from the same box with it off'
    },
  },
  {
    name: 'a real hinged lid still keeps the back wall solid',
    run: () => {
      const p = { ...base, includeLid: true, lidStyle: 'lid' as const, fingerSlotAxes: 'z' as const }
      const hinged = JSON.stringify(generateBox({ ...p, includeHinge: true }))
      const plain = JSON.stringify(generateBox({ ...p, includeHinge: false }))
      return hinged !== plain ? null : 'hinged box has the same back wall as an unhinged one'
    },
  },
  {
    name: 'rounded finger slots remove the exact notch area (right place, right way up)',
    run: () => {
      const p: BoxParams = { ...base, width: 80, depth: 60, height: 40, wallThickness: 2, fingerSlotAxes: 'both', fingerSlotWidth: 15, fingerSlotDepth: 15 }
      const volume = (q: BoxParams) => validateTriangles(prepareTrianglesForExport([generateBox(q)])).volumeMm3
      const solid = volume({ ...p, fingerSlotAxes: 'none' })
      const removedSquare = solid - volume(p)
      const removedRound = solid - volume({ ...p, fingerSlotRound: true })
      // Four 15 × 15 notches through 2 mm walls; rounding trims 2·(1 − π/4)·r² of each
      const r = 7.5
      const expectedSquare = 4 * 15 * 15 * 2
      const expectedRound = 4 * (15 * 15 - 2 * (1 - Math.PI / 4) * r * r) * 2
      const ok = Math.abs(removedSquare - expectedSquare) < 1 && Math.abs(removedRound - expectedRound) < 0.01 * expectedRound
      return ok ? null : `square removed ${removedSquare.toFixed(1)} (expected ${expectedSquare}), round removed ${removedRound.toFixed(1)} (expected ${expectedRound.toFixed(1)})`
    },
  },
  {
    name: 'plate arrangement: box and lid side by side, centred, nothing turned',
    run: () => {
      const l = arrangeOnPlate([{ w: 80, d: 60 }, { w: 80, d: 60 }], 256, 256)
      const [a, b] = l.placements
      return l.fitsTogether && !a.rotated && !b.rotated && a.x === -45 && b.x === 45 && a.y === 0 && b.y === 0
        ? null : JSON.stringify(l)
    },
  },
  {
    name: 'plate arrangement: stacks front to back when side by side is too wide',
    run: () => {
      const l = arrangeOnPlate([{ w: 100, d: 60 }, { w: 100, d: 60 }], 130, 256)
      const [a, b] = l.placements
      return l.fitsTogether && !a.rotated && !b.rotated && a.x === 0 && b.x === 0 && a.y === -35 && b.y === 35
        ? null : JSON.stringify(l)
    },
  },
  {
    name: 'plate arrangement: turns a part a quarter turn only when needed to fit',
    run: () => {
      // 100 × 40 on a 60 × 120 plate fits only turned
      const l = arrangeOnPlate([{ w: 100, d: 40 }], 60, 120)
      const free = arrangeOnPlate([{ w: 100, d: 40 }], 200, 120)
      return l.fitsTogether && l.placements[0].rotated && free.fitsTogether && !free.placements[0].rotated
        ? null : JSON.stringify({ l, free })
    },
  },
  {
    name: 'plate arrangement: reports parts that fit alone but not together',
    run: () => {
      const l = arrangeOnPlate([{ w: 150, d: 150 }, { w: 150, d: 150 }], 200, 200)
      const alone = arrangeOnPlate([{ w: 150, d: 150 }], 200, 200)
      return !l.fitsTogether && alone.fitsTogether ? null : JSON.stringify({ l, alone })
    },
  },
  {
    name: 'plate arrangement: no overlap between the two parts',
    run: () => {
      for (const [pw, pd] of [[256, 256], [180, 180], [130, 256], [100, 300]]) {
        const parts = [{ w: 80, d: 60 }, { w: 90, d: 50 }]
        const l = arrangeOnPlate(parts, pw, pd)
        const box = (i: number) => {
          const p = l.placements[i], f = parts[i]
          const w = p.rotated ? f.d : f.w, d = p.rotated ? f.w : f.d
          return { x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y - d / 2, y1: p.y + d / 2 }
        }
        const A = box(0), B = box(1)
        const overlap = A.x0 < B.x1 && B.x0 < A.x1 && A.y0 < B.y1 && B.y0 < A.y1
        if (overlap) return `parts overlap on a ${pw} × ${pd} plate: ${JSON.stringify(l)}`
      }
      return null
    },
  },
]
for (const check of layoutChecks) {
  const problem = check.run()
  if (problem === null) {
    console.log(`  ✓ ${check.name}`)
  } else {
    failures++
    console.error(`  ✗ ${check.name}\n      · ${problem}`)
  }
}
console.log('')
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

const total = checks.length + layoutChecks.length
console.log(`\n${total - failures}/${total} passed in ${((Date.now() - started) / 1000).toFixed(1)} s`)
if (failures > 0) {
  console.error(`\n${failures} check${failures === 1 ? '' : 's'} failed.`)
  process.exit(1)
}
