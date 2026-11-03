import { BoxParams } from '@/utils/boxGenerator'

// Tiny isometric sketch of the box at its real proportions — a recognisable
// thumbnail for project cards. Not a render: just three faces and the open top.
export function BoxGlyph({ params, className }: { params: Pick<BoxParams, 'width' | 'depth' | 'height'>; className?: string }) {
  const c = Math.cos(Math.PI / 6)
  const s = 0.5
  const { width: w, depth: d, height: h } = params

  // Front-bottom corner at the origin; screen y grows downward
  const F = [0, 0], R = [w * c, -w * s], L = [-d * c, -d * s], B = [R[0] + L[0], R[1] + L[1]]
  const up = (p: number[]) => [p[0], p[1] - h]
  const pts = { F, R, L, B, Ft: up(F), Rt: up(R), Lt: up(L), Bt: up(B) }

  const all = Object.values(pts)
  const minX = Math.min(...all.map(p => p[0])), maxX = Math.max(...all.map(p => p[0]))
  const minY = Math.min(...all.map(p => p[1])), maxY = Math.max(...all.map(p => p[1]))
  const size = 48, pad = 4
  const k = (size - 2 * pad) / Math.max(maxX - minX, maxY - minY)
  const ox = (size - (maxX - minX) * k) / 2 - minX * k
  const oy = (size - (maxY - minY) * k) / 2 - minY * k
  const t = (p: number[]) => `${(p[0] * k + ox).toFixed(1)},${(p[1] * k + oy).toFixed(1)}`
  const poly = (...p: number[][]) => p.map(t).join(' ')

  // Open cavity: the top face pulled in toward its centre
  const cx = (pts.Ft[0] + pts.Bt[0]) / 2, cy = (pts.Ft[1] + pts.Bt[1]) / 2
  const inset = (p: number[]) => [cx + (p[0] - cx) * 0.82, cy + (p[1] - cy) * 0.82]

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={className} aria-hidden>
      <polygon points={poly(pts.F, pts.L, pts.Lt, pts.Ft)} fill="hsl(222 14% 24%)" />
      <polygon points={poly(pts.F, pts.R, pts.Rt, pts.Ft)} fill="hsl(222 14% 31%)" />
      <polygon points={poly(pts.Ft, pts.Rt, pts.Bt, pts.Lt)} fill="hsl(222 14% 38%)" />
      <polygon points={poly(inset(pts.Ft), inset(pts.Rt), inset(pts.Bt), inset(pts.Lt))} fill="hsl(225 18% 9%)" />
    </svg>
  )
}
