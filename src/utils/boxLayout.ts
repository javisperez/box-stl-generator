import type { BoxParams } from './boxGenerator'

// Evenly spaced divider positions (in % across the interior)
export function evenPositions(count: number): number[] {
  return Array.from({ length: count }, (_, i) => Math.round((i + 1) * 100 / (count + 1)))
}

// Friction-fit cap lids hang their lip down into the box interior, so that
// depth is lost to contents when the lid is on. Hinged lids are flat slabs
// and sleeves wrap the outside — neither costs interior height.
export function frictionLipDepth(params: BoxParams): number {
  return params.includeLid && params.lidStyle === 'lid' && !params.includeHinge
    ? params.lidHeight
    : 0
}

export type Closure = 'none' | 'lid' | 'sleeve' | 'hinged'

// The lid/sleeve/hinge choice is stored across three params; this folds them into one
export function closureOf(params: BoxParams): Closure {
  if (!params.includeLid) return 'none'
  if (params.lidStyle === 'sleeve') return 'sleeve'
  return params.includeHinge ? 'hinged' : 'lid'
}

export const CLOSURE_LABELS: Record<Closure, string> = {
  none: 'Open top',
  lid: 'Lid',
  sleeve: 'Sleeve',
  hinged: 'Hinged lid',
}

// One colour per axis, shared by the size sliders and the divider editor
export const AXIS_COLORS = { width: '#f5a524', depth: '#3ecf8e', height: '#5b9bff' }

// Clear interior span of each compartment along one axis: divider thickness
// straddles its centreline, so it comes out of the neighbouring compartments
export function compartmentSpans(positions: number[], inner: number, dividerThickness: number): number[] {
  const centers = [...positions].sort((a, b) => a - b).map(p => (p / 100) * inner)
  const spans: number[] = []
  let prev = 0
  for (const c of centers) {
    spans.push(Math.max(0, c - dividerThickness / 2 - prev))
    prev = c + dividerThickness / 2
  }
  spans.push(Math.max(0, inner - prev))
  return spans
}

export type ViewMode = 'perspective' | 'isometric'

const round2 = (n: number) => Math.round(n * 100) / 100

// Box depth and divider positions for a list of exact clear compartment depths
// (front to back). Positions are % across the interior, to the divider's
// centreline, measured from the inside of the front wall — the same reference
// the divider editor and generator use — and kept to two decimals so the
// compartments come out at the sizes that were asked for.
export function layoutFromDepths(sizes: number[], wall: number): { depth: number; positions: number[] } {
  const total = sizes.reduce((sum, s) => sum + s, 0) + (sizes.length + 1) * wall
  const inner = total - 2 * wall
  const positions: number[] = []
  let cumulative = 0
  for (let i = 0; i < sizes.length - 1; i++) {
    cumulative += sizes[i]
    // Earlier compartments, i whole dividers, and half of this divider
    positions.push(round2(((cumulative + (i + 0.5) * wall) / inner) * 100))
  }
  return { depth: round2(total), positions }
}

// Box size and divider positions for a grid of equal compartments that each
// give an item `itemW × itemD` of clear space. Dividers use their own
// thickness, which may be thinner than the outer walls.
export function layoutFromItemGrid(
  itemW: number, itemD: number, cols: number, rows: number, wall: number, dividerThickness: number,
): { width: number; depth: number; divisionsX: number[]; divisionsZ: number[] } {
  const innerW = itemW * cols + (cols - 1) * dividerThickness
  const innerD = itemD * rows + (rows - 1) * dividerThickness
  const positions = (item: number, count: number, inner: number) =>
    Array.from({ length: count - 1 }, (_, i) => round2((((i + 1) * item + (i + 0.5) * dividerThickness) / inner) * 100))
  return {
    width: round2(innerW + 2 * wall),
    depth: round2(innerD + 2 * wall),
    divisionsX: positions(itemW, cols, innerW),
    divisionsZ: positions(itemD, rows, innerD),
  }
}
