import { jsPDF } from 'jspdf'
import {
  BoxParams, CustomHole, LidPattern, CustomHoleFace,
  CUSTOM_HOLE_FACES, LID_PATTERNS, clampDivisionThickness,
} from './boxGenerator'

// Matches the estimate shown in the app's export control (App.tsx)
const PLA_DENSITY = 1.24 // g/cm³, solid

function grams(volumeCm3: number): string {
  const g = volumeCm3 * PLA_DENSITY
  return `${g < 10 ? g.toFixed(1) : String(Math.round(g))} g`
}

function mm(n: number): string {
  return `${+n.toFixed(2)} mm`
}

function pct(n: number): string {
  return `${+n.toFixed(1)}%`
}

function faceLabel(f: CustomHoleFace): string {
  return CUSTOM_HOLE_FACES.find((x) => x.value === f)?.label ?? f
}

function shapeLabel(s: LidPattern): string {
  return LID_PATTERNS.find((x) => x.value === s)?.label ?? s
}

// Both CustomHole and LidCustomHole share this shape; only CustomHole adds `face`.
type HoleLike = Pick<
  CustomHole,
  'shape' | 'size' | 'useCustomSlotSize' | 'slotWidth' | 'slotLength' |
  'cornerHoles' | 'cornerInsetX' | 'cornerInsetY' | 'posU' | 'posV'
>

function holeSize(h: HoleLike): string {
  if (h.shape === 'slots' && h.useCustomSlotSize) return `${mm(h.slotWidth)} × ${mm(h.slotLength)}`
  return mm(h.size)
}

function holePosition(h: HoleLike): string {
  if (h.cornerHoles) return `4 corners · inset ${mm(h.cornerInsetX)} × ${mm(h.cornerInsetY)}`
  return `${pct(h.posU)} across · ${pct(h.posV)} down`
}

// Mirrors the breakpoint construction in generateBox: divider centres (in mm,
// from a 0..innerSpan origin) expand to [centre-half, centre+half] cutouts;
// what's left between them are the actual printable compartment widths.
function computeCells(divisionsPercent: number[], innerSpan: number, dividerThickness: number): number[] {
  const centres = [...divisionsPercent].sort((a, b) => a - b).map((p) => (p / 100) * innerSpan)
  const half = dividerThickness / 2
  const bounds: number[] = [0]
  for (const c of centres) bounds.push(c - half, c + half)
  bounds.push(innerSpan)
  const cells: number[] = []
  for (let i = 0; i < bounds.length; i += 2) cells.push(Math.max(0, bounds[i + 1] - bounds[i]))
  return cells
}

// Minimal paginated PDF writer — section headers, label/value rows, wrapped
// paragraphs, and simple ruled tables. Kept dependency-free beyond jsPDF
// itself (no autotable plugin).
class SpecSheetWriter {
  doc = new jsPDF({ unit: 'mm', format: 'a4' })
  y = 20
  readonly marginX = 15
  readonly pageWidth: number
  readonly maxY: number

  constructor() {
    this.pageWidth = this.doc.internal.pageSize.getWidth()
    this.maxY = this.doc.internal.pageSize.getHeight() - 18
  }

  private ensureSpace(h: number) {
    if (this.y + h > this.maxY) {
      this.doc.addPage()
      this.y = 20
    }
  }

  title(text: string) {
    this.doc.setFont('helvetica', 'bold')
    this.doc.setFontSize(18)
    this.doc.setTextColor(0)
    this.doc.text(text, this.marginX, this.y)
    this.y += 7
  }

  subtitle(text: string) {
    this.doc.setFont('helvetica', 'normal')
    this.doc.setFontSize(10)
    this.doc.setTextColor(110)
    this.doc.text(text, this.marginX, this.y)
    this.doc.setTextColor(0)
    this.y += 8
  }

  sectionHeader(text: string) {
    this.ensureSpace(13)
    this.y += 3
    this.doc.setFont('helvetica', 'bold')
    this.doc.setFontSize(11.5)
    this.doc.setTextColor(30)
    this.doc.text(text.toUpperCase(), this.marginX, this.y)
    this.doc.setDrawColor(190)
    this.doc.line(this.marginX, this.y + 1.5, this.pageWidth - this.marginX, this.y + 1.5)
    this.doc.setTextColor(0)
    this.y += 7
  }

  kv(label: string, value: string) {
    this.ensureSpace(6)
    this.doc.setFont('helvetica', 'normal')
    this.doc.setFontSize(9.5)
    this.doc.setTextColor(95)
    this.doc.text(label, this.marginX, this.y)
    this.doc.setTextColor(0)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text(value, this.marginX + 62, this.y)
    this.y += 5.5
  }

  paragraph(text: string) {
    this.doc.setFont('helvetica', 'normal')
    this.doc.setFontSize(9)
    this.doc.setTextColor(70)
    const lines = this.doc.splitTextToSize(text, this.pageWidth - this.marginX * 2) as string[]
    this.ensureSpace(lines.length * 4.2 + 2)
    this.doc.text(lines, this.marginX, this.y)
    this.doc.setTextColor(0)
    this.y += lines.length * 4.2 + 2
  }

  spacer(h = 4) {
    this.y += h
  }

  table(headers: string[], rows: string[][], colWidths: number[]) {
    const usableWidth = this.pageWidth - this.marginX * 2
    const rowH = 6
    this.ensureSpace(rowH + 2)
    this.doc.setFillColor(240, 240, 240)
    this.doc.rect(this.marginX, this.y - 4, usableWidth, rowH, 'F')
    this.doc.setFont('helvetica', 'bold')
    this.doc.setFontSize(8.5)
    this.doc.setTextColor(60)
    let x = this.marginX + 2
    headers.forEach((h, i) => { this.doc.text(h, x, this.y); x += colWidths[i] })
    this.y += rowH
    this.doc.setFont('helvetica', 'normal')
    this.doc.setFontSize(8.5)
    this.doc.setTextColor(20)
    for (const row of rows) {
      this.ensureSpace(rowH)
      x = this.marginX + 2
      row.forEach((cell, i) => { this.doc.text(cell, x, this.y); x += colWidths[i] })
      this.doc.setDrawColor(230)
      this.doc.line(this.marginX, this.y + 1.5, this.marginX + usableWidth, this.y + 1.5)
      this.y += rowH
    }
    this.doc.setTextColor(0)
    this.y += 2
  }

  save(filename: string) {
    this.doc.save(filename)
  }
}

export interface SpecSheetInput {
  params: BoxParams
  projectName: string
  boxVolumeCm3: number
  lidVolumeCm3: number
  sleeve: { w: number; d: number; h: number }
  compartments: number
  printerBedX: number
  printerBedY: number
  oversizedParts: string[]
  stlFilenames: { box: string; lid?: string }
  filename: string
}

export function exportSpecSheetPDF(input: SpecSheetInput) {
  const { params: p, boxVolumeCm3, lidVolumeCm3, sleeve, printerBedX, printerBedY, oversizedParts, stlFilenames } = input
  const isSleeve = p.includeLid && p.lidStyle === 'sleeve'
  const wt = p.wallThickness
  const iw = p.width - 2 * wt
  const id = p.depth - 2 * wt
  const dt = clampDivisionThickness(p.divisionThickness, wt)

  const w = new SpecSheetWriter()

  w.title(input.projectName.trim() || 'Untitled Box')
  w.subtitle(`3D-print specification sheet · generated ${new Date().toLocaleString()}`)
  w.spacer(1)

  // ── Overview ──────────────────────────────────────────────────────────
  w.sectionHeader('Overview')
  w.kv('Outer dimensions (W × D × H)', `${mm(p.width)} × ${mm(p.depth)} × ${mm(p.height)}`)
  w.kv('Wall thickness', mm(wt))
  w.kv('Chamfer (outer vertical edges)', p.chamferSize > 0 ? mm(p.chamferSize) : 'None')
  w.kv('Compartments', String(input.compartments))
  w.kv(
    'Lid / cover style',
    p.includeLid
      ? isSleeve ? 'Sliding sleeve' : p.includeHinge ? 'Hinged lid' : 'Friction-fit lid'
      : 'None'
  )
  const totalVolume = boxVolumeCm3 + lidVolumeCm3
  w.kv('Estimated PLA weight (all parts, solid)', grams(totalVolume))
  w.kv('Target print bed', `${printerBedX} × ${printerBedY} mm`)
  w.kv(
    'Fits print bed',
    oversizedParts.length === 0 ? 'Yes — all parts fit' : `No — ${oversizedParts.join(', ')} exceed(s) the bed`
  )

  // ── Box body ──────────────────────────────────────────────────────────
  w.sectionHeader('Box Body')
  w.kv('Outer footprint', `${mm(p.width)} × ${mm(p.depth)}`)
  w.kv('Inner footprint (usable)', `${mm(iw)} × ${mm(id)}`)
  w.kv('Inner height (usable)', mm(p.height - wt))
  w.kv('Estimated volume / weight', `${boxVolumeCm3.toFixed(1)} cm³ · ${grams(boxVolumeCm3)}`)

  if (p.divisionsX.length > 0 || p.divisionsZ.length > 0) {
    w.spacer(2)
    w.paragraph(
      `Dividers (${mm(dt)} thick) split the interior into ${input.compartments} ` +
      `compartment${input.compartments === 1 ? '' : 's'}. Interior size of each cell:`
    )
    const cellsX = computeCells(p.divisionsX, iw, dt)
    const cellsZ = computeCells(p.divisionsZ, id, dt)
    const rows: string[][] = []
    cellsZ.forEach((cz, zi) => {
      cellsX.forEach((cx, xi) => {
        rows.push([`Row ${zi + 1}, Col ${xi + 1}`, `${mm(cx)} × ${mm(cz)}`])
      })
    })
    w.table(['Compartment', 'Interior size (W × D)'], rows, [60, 60])
  }

  if (p.boxPattern !== 'none') {
    w.spacer(1)
    w.kv('Side-wall cutout pattern', shapeLabel(p.boxPattern))
    w.kv('Pattern feature size / spacing', `${mm(p.boxPatternSize)} / ${mm(p.boxPatternSpacing)}`)
    w.kv('Divider walls', p.boxPatternDividers ? 'Pattern cut through' : 'Solid')
    w.kv('Floor', p.boxPatternSkipFloor ? 'Solid (excluded)' : 'Pattern cut through')
  }

  if (p.customHoles.length > 0) {
    w.spacer(2)
    w.sectionHeader('Box Custom Holes')
    w.table(
      ['Face', 'Shape', 'Size', 'Position'],
      p.customHoles.map((h) => [faceLabel(h.face), shapeLabel(h.shape), holeSize(h), holePosition(h)]),
      [28, 28, 42, 72]
    )
  }

  if (p.fingerSlotAxes !== 'none') {
    w.sectionHeader('Finger Access Slots')
    w.kv('Axes', p.fingerSlotAxes === 'both' ? 'X and Z walls' : `${p.fingerSlotAxes.toUpperCase()} walls`)
    w.kv('Notch width', mm(p.fingerSlotWidth))
    w.kv('Notch depth (down from rim)', mm(p.fingerSlotDepth))
    w.kv('Position along span', pct(p.fingerSlotPosition))
    w.kv('Notch outer walls', p.fingerSlotOuterWalls ? 'Yes' : 'No')
    w.kv('Also notch dividers', p.fingerSlotDividers ? 'Yes' : 'No')
  }

  // ── Lid / sleeve ──────────────────────────────────────────────────────
  if (p.includeLid) {
    w.sectionHeader(isSleeve ? 'Drawer Sleeve' : 'Lid')
    if (isSleeve) {
      w.kv('Outer dimensions (W × D × H)', `${mm(sleeve.w)} × ${mm(sleeve.d)} × ${mm(sleeve.h)}`)
      w.kv('Sliding fit tolerance', mm(p.sleeveTolerance))
      w.kv('Finger notch at opening', p.sleeveCutout ? 'Yes' : 'No')
    } else {
      w.kv('Cap dimensions (W × D)', `${mm(p.width)} × ${mm(p.depth)}`)
      w.kv('Lip height (into box)', mm(p.lidHeight))
      w.kv('Lip-to-wall tolerance', mm(p.lidTolerance))
      w.kv(
        'Hinge',
        p.includeHinge
          ? `${p.hingeCount} knuckle-hinge(s) · ⌀${p.hingeDiameter} mm barrel / ⌀${p.hingePinDiameter} mm pin`
          : 'None (lift-off / friction fit)'
      )
    }
    w.kv('Estimated volume / weight', `${lidVolumeCm3.toFixed(1)} cm³ · ${grams(lidVolumeCm3)}`)

    if (p.lidText.trim()) {
      w.spacer(1)
      w.kv('Engraved/embossed text', `"${p.lidText.trim()}"`)
      w.kv('Text style / size / depth', `${p.lidTextStyle} · ${mm(p.lidTextSize)} tall · ${mm(p.lidTextDepth)} deep`)
      w.kv('Text rotation', `${p.lidTextRotation}°`)
    }

    if (p.lidPattern !== 'none') {
      w.spacer(1)
      w.kv('Cap cutout pattern', shapeLabel(p.lidPattern))
      w.kv('Pattern feature size / spacing', `${mm(p.lidPatternSize)} / ${mm(p.lidPatternSpacing)}`)
      if (p.lidPatternCoverageX < 100 || p.lidPatternCoverageY < 100) {
        w.kv('Pattern coverage (W × D)', `${p.lidPatternCoverageX}% × ${p.lidPatternCoverageY}%`)
        w.kv('Pattern position (X, Y)', `${p.lidPatternOffsetX}%, ${p.lidPatternOffsetY}%`)
      }
    }

    if (p.lidCustomHoles.length > 0) {
      w.spacer(2)
      w.paragraph('Custom holes on the lid cap:')
      w.table(
        ['Shape', 'Size', 'Position'],
        p.lidCustomHoles.map((h) => [shapeLabel(h.shape), holeSize(h), holePosition(h)]),
        [40, 55, 75]
      )
    }
  }

  // ── Files & notes ─────────────────────────────────────────────────────
  w.sectionHeader('3D Print Files')
  w.kv('Box STL', stlFilenames.box)
  if (stlFilenames.lid) w.kv(isSleeve ? 'Sleeve STL' : 'Lid STL', stlFilenames.lid)

  w.spacer(3)
  w.paragraph(
    'Weight estimates assume 100% solid PLA at 1.24 g/cm³ and will run higher than an actual ' +
    'print, which normally uses partial infill. Double-check the lid/sleeve tolerance and hole ' +
    'sizes against your printer\'s calibration before printing a final part.'
  )

  w.save(input.filename)
}
