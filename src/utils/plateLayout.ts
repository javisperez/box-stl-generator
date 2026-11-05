export interface Footprint { w: number; d: number }

/** Where a part sits on the plate: its centre (plate centre = 0, 0) and whether it is turned 90° about Z. */
export interface Placement { x: number; y: number; rotated: boolean }

export interface PlateLayout {
  placements: Placement[]
  /** True when every part fits on the plate at the same time. */
  fitsTogether: boolean
}

/**
 * Arrange one or two parts on a plate. Parts sit next to each other with `gap`
 * between them, the whole group is centred on the plate, and a part is turned
 * a quarter turn only when that is what it takes to fit. Preference order:
 * no turns side by side, no turns stacked front to back, then turned variants.
 * When nothing fits, the tightest layout is returned with fitsTogether false.
 */
export function arrangeOnPlate(parts: Footprint[], plateX: number, plateY: number, gap = 10): PlateLayout {
  if (parts.length === 0) return { placements: [], fitsTogether: true }

  const size = (p: Footprint, rotated: boolean) => rotated ? { w: p.d, d: p.w } : { w: p.w, d: p.d }

  if (parts.length === 1) {
    const upright = size(parts[0], false)
    const fitsUpright = upright.w <= plateX && upright.d <= plateY
    const turned = size(parts[0], true)
    const fitsTurned = turned.w <= plateX && turned.d <= plateY
    return {
      placements: [{ x: 0, y: 0, rotated: !fitsUpright && fitsTurned }],
      fitsTogether: fitsUpright || fitsTurned,
    }
  }

  // Two parts. Try every combination of turns and both ways of putting them next to each other.
  const [a, b] = parts
  const candidates: { rotA: boolean; rotB: boolean; along: 'x' | 'y' }[] = []
  for (const along of ['x', 'y'] as const) {
    for (const [rotA, rotB] of [[false, false], [true, true], [false, true], [true, false]] as const) {
      candidates.push({ rotA, rotB, along })
    }
  }
  // Turning neither part reads best, so it is tried first (stable sort keeps the rest in order)
  const turns = (c: { rotA: boolean; rotB: boolean }) => Number(c.rotA) + Number(c.rotB)

  const layouts = candidates.map((c) => {
    const sa = size(a, c.rotA), sb = size(b, c.rotB)
    const total = c.along === 'x'
      ? { w: sa.w + gap + sb.w, d: Math.max(sa.d, sb.d) }
      : { w: Math.max(sa.w, sb.w), d: sa.d + gap + sb.d }
    const placements: Placement[] = c.along === 'x'
      ? [
          { x: -total.w / 2 + sa.w / 2, y: 0, rotated: c.rotA },
          { x: total.w / 2 - sb.w / 2, y: 0, rotated: c.rotB },
        ]
      : [
          { x: 0, y: -total.d / 2 + sa.d / 2, rotated: c.rotA },
          { x: 0, y: total.d / 2 - sb.d / 2, rotated: c.rotB },
        ]
    // How far past the plate the group reaches, as a fraction (0 = fits)
    const overflow = Math.max(total.w / plateX, total.d / plateY)
    return { c, placements, fits: total.w <= plateX && total.d <= plateY, overflow }
  })

  const fitting = layouts.filter(l => l.fits).sort((p, q) => turns(p.c) - turns(q.c))
  if (fitting.length > 0) return { placements: fitting[0].placements, fitsTogether: true }

  const tightest = [...layouts].sort((p, q) => p.overflow - q.overflow || turns(p.c) - turns(q.c))[0]
  return { placements: tightest.placements, fitsTogether: false }
}
