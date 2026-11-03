import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, AlignHorizontalSpaceAround, Eraser } from 'lucide-react'
import { Button } from './ui/button'
import { Segmented } from './ui/segmented'
import { BoxParams } from '@/utils/boxGenerator'
import { AXIS_COLORS, compartmentSpans, evenPositions } from '@/utils/boxLayout'

interface DividerEditorProps {
  params: BoxParams
  onChange: (patch: Pick<Partial<BoxParams>, 'divisionsX' | 'divisionsZ'>) => void
}

type Axis = 'x' | 'z'
type Mode = 'visual' | 'numbers'

const MAX_DIVIDERS = 10
const PAD = 26
const MAX_HEIGHT = 250
const fmt = (n: number) => String(Math.round(n * 10) / 10)
const fmt2 = (n: number) => String(Math.round(n * 100) / 100)

// Number field that commits on blur/Enter and snaps back when the text isn't a number
function MmInput({ value, onCommit, label }: { value: number; onCommit: (v: number) => void; label: string }) {
  const [text, setText] = useState(fmt2(value))
  useEffect(() => setText(fmt2(value)), [value])
  const commit = () => {
    const v = Number(text)
    if (text.trim() === '' || Number.isNaN(v)) setText(fmt2(value))
    else onCommit(v)
  }
  return (
    <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
      <input
        type="number"
        inputMode="decimal"
        step={0.5}
        aria-label={label}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { commit(); e.currentTarget.blur() } }}
        className="w-20 px-2 py-1 text-right text-foreground bg-background rounded-md border focus:outline-none focus:border-ring [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      mm
    </span>
  )
}

/**
 * Top-down plan of the box: drag any divider to move it, add or remove them
 * below. X dividers split the interior along the width, Z dividers along the
 * depth; positions are stored as % across the interior (Z measured from the
 * front wall, which is the bottom of this view).
 */
export function DividerEditor({ params, onChange }: DividerEditorProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(300)
  const [selected, setSelected] = useState<{ axis: Axis; index: number } | null>(null)
  const [mode, setMode] = useState<Mode>('visual')

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(200, Math.floor(entry.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const wall = params.wallThickness
  const divT = Math.min(params.divisionThickness, wall)
  const innerW = Math.max(1, params.width - 2 * wall)
  const innerD = Math.max(1, params.depth - 2 * wall)
  const xs = [...params.divisionsX].sort((a, b) => a - b)
  const zs = [...params.divisionsZ].sort((a, b) => a - b)
  const list = (axis: Axis) => (axis === 'x' ? xs : zs)
  const inner = (axis: Axis) => (axis === 'x' ? innerW : innerD)
  // Closest two dividers may get: they can touch but not overlap
  const minGap = (axis: Axis) => Math.max(1, Math.ceil((divT / inner(axis)) * 100))

  const commit = (axis: Axis, arr: number[]) =>
    onChange(axis === 'x' ? { divisionsX: arr } : { divisionsZ: arr })

  // Dragging snaps to whole percents; typed millimetres keep two decimals
  const setPosition = (axis: Axis, index: number, value: number, precise = false) => {
    const arr = [...list(axis)]
    const gap = minGap(axis)
    const lo = index > 0 ? arr[index - 1] + gap : 1
    const hi = index < arr.length - 1 ? arr[index + 1] - gap : 99
    if (lo > hi) return
    const next = Math.min(hi, Math.max(lo, precise ? Math.round(value * 100) / 100 : Math.round(value)))
    if (next === arr[index]) return
    arr[index] = next
    commit(axis, arr)
  }

  const addDivider = (axis: Axis) => {
    const arr = list(axis)
    if (arr.length >= MAX_DIVIDERS) return
    // Split the widest gap in half
    const pts = [0, ...arr, 100]
    let best = 0
    for (let i = 1; i < pts.length - 1; i++) if (pts[i + 1] - pts[i] >= pts[best + 1] - pts[best]) best = i
    const value = Math.round((pts[best] + pts[best + 1]) / 2)
    if (value <= pts[best] || value >= pts[best + 1]) return
    const next = [...arr, value].sort((a, b) => a - b)
    commit(axis, next)
    setSelected({ axis, index: next.indexOf(value) })
  }

  const clearAll = () => {
    const total = xs.length + zs.length
    if (total > 2 && !confirm(`Remove all ${total} dividers?`)) return
    onChange({ divisionsX: [], divisionsZ: [] })
    setSelected(null)
  }

  const removeDivider = (axis: Axis, index: number) => {
    const arr = [...list(axis)]
    arr.splice(index, 1)
    commit(axis, arr)
    setSelected(null)
  }

  // ── Geometry (pixel space) ────────────────────────────────────────────────
  const scale = Math.min((width - 2 * PAD) / params.width, (MAX_HEIGHT - 2 * PAD) / params.depth)
  const boxW = params.width * scale
  const boxH = params.depth * scale
  const ox = (width - boxW) / 2
  const oy = PAD
  const t = wall * scale
  const ix = ox + t, iy = oy + t
  const iw = innerW * scale, ih = innerD * scale
  const dt = Math.max(2, divT * scale)

  const xPx = xs.map(p => ix + (p / 100) * iw)
  const yPx = zs.map(p => iy + ih - (p / 100) * ih) // front wall is the bottom edge

  const spansX = compartmentSpans(xs, innerW, divT)
  const spansZTopDown = compartmentSpans(zs, innerD, divT).reverse()
  const colLeft = [ix, ...xPx.map(x => x + dt / 2)]
  const colRight = [...xPx.map(x => x - dt / 2), ix + iw]
  const yTopDown = [...yPx].reverse()
  const rowTop = [iy, ...yTopDown.map(y => y + dt / 2)]
  const rowBottom = [...yTopDown.map(y => y - dt / 2), iy + ih]

  const sel = selected && selected.index < list(selected.axis).length ? selected : null

  const dragTo = (axis: Axis, index: number, e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const pct = axis === 'x'
      ? ((e.clientX - rect.left - ix) / iw) * 100
      : ((iy + ih - (e.clientY - rect.top)) / ih) * 100
    setPosition(axis, index, pct)
  }

  const onKeyDown = (axis: Axis, index: number, e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 5 : 1
    const dir = axis === 'x'
      ? { ArrowLeft: -1, ArrowRight: 1 }[e.key]
      : { ArrowDown: -1, ArrowUp: 1 }[e.key]
    if (dir) {
      e.preventDefault()
      setPosition(axis, index, list(axis)[index] + dir * step)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      removeDivider(axis, index)
    }
  }

  const renderHandle = (axis: Axis, index: number) => {
    const pos = axis === 'x' ? xPx[index] : yPx[index]
    const color = axis === 'x' ? AXIS_COLORS.width : AXIS_COLORS.depth
    const isSel = sel?.axis === axis && sel.index === index
    const name = `${axis === 'x' ? 'Width' : 'Depth'} divider ${index + 1}`
    return (
      <g
        key={`${axis}${index}`}
        role="slider"
        tabIndex={0}
        aria-label={name}
        aria-orientation={axis === 'x' ? 'horizontal' : 'vertical'}
        aria-valuemin={1}
        aria-valuemax={99}
        aria-valuenow={list(axis)[index]}
        aria-valuetext={`${list(axis)[index]}%, ${fmt((list(axis)[index] / 100) * inner(axis))} mm from the ${axis === 'x' ? 'left' : 'front'} wall`}
        style={{ cursor: axis === 'x' ? 'ew-resize' : 'ns-resize', touchAction: 'none', outline: 'none' }}
        onFocus={() => setSelected({ axis, index })}
        onKeyDown={(e) => onKeyDown(axis, index, e)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setSelected({ axis, index })
        }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) dragTo(axis, index, e) }}
        onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
      >
        {axis === 'x' ? (
          <>
            <rect x={pos - 9} y={iy} width={18} height={ih} fill="transparent" />
            <rect x={pos - dt / 2} y={iy} width={dt} height={ih} fill={color} opacity={isSel ? 1 : 0.75} />
            <circle cx={pos} cy={iy + ih / 2} r={isSel ? 6 : 5} fill={isSel ? '#fff' : 'hsl(var(--card))'} stroke={color} strokeWidth={2.5} />
          </>
        ) : (
          <>
            <rect x={ix} y={pos - 9} width={iw} height={18} fill="transparent" />
            <rect x={ix} y={pos - dt / 2} width={iw} height={dt} fill={color} opacity={isSel ? 1 : 0.75} />
            <circle cx={ix + iw / 2} cy={pos} r={isSel ? 6 : 5} fill={isSel ? '#fff' : 'hsl(var(--card))'} stroke={color} strokeWidth={2.5} />
          </>
        )}
      </g>
    )
  }

  const selPct = sel ? list(sel.axis)[sel.index] : 0

  return (
    <div className="space-y-3">
      <Segmented
        aria-label="Divider editing mode"
        value={mode}
        onChange={setMode}
        options={[{ value: 'visual', label: 'Visual' }, { value: 'numbers', label: 'Numbers' }]}
      />

      <div className={mode === 'visual' ? 'space-y-3' : 'hidden'}>
      <div ref={wrapRef} className="rounded-lg border bg-background/40">
        <svg
          ref={svgRef}
          width={width}
          height={boxH + 2 * PAD}
          role="group"
          aria-label="Top view of the box with its dividers"
          onPointerDown={(e) => { if (e.target === e.currentTarget) setSelected(null) }}
        >
          <text x={ox + boxW / 2} y={oy - 9} textAnchor="middle" fontSize={10} className="font-mono" fill={AXIS_COLORS.width}>
            {fmt(params.width)} mm
          </text>
          <text
            transform={`translate(${ox - 9} ${oy + boxH / 2}) rotate(-90)`}
            textAnchor="middle" fontSize={10} className="font-mono" fill={AXIS_COLORS.depth}
          >
            {fmt(params.depth)} mm
          </text>
          <text x={ox + boxW / 2} y={oy + boxH + 17} textAnchor="middle" fontSize={10} fill="hsl(var(--muted-foreground))">
            front
          </text>

          <rect x={ox} y={oy} width={boxW} height={boxH} rx={3} fill="hsl(var(--accent))" />
          <rect x={ix} y={iy} width={iw} height={ih} fill="hsl(var(--background))" />

          {/* Clear compartment sizes, when a cell is big enough to hold the label */}
          {colLeft.map((left, c) => rowTop.map((top, r) => {
            const w = colRight[c] - left, h = rowBottom[r] - top
            if (w < 46 || h < 14) return null
            return (
              <text
                key={`${c}-${r}`}
                x={left + w / 2} y={top + h / 2 + 3.5}
                textAnchor="middle" fontSize={10} className="font-mono pointer-events-none select-none"
                fill="hsl(var(--muted-foreground))"
              >
                {fmt(spansX[c])}×{fmt(spansZTopDown[r])}
              </text>
            )
          }))}

          {xs.map((_, i) => renderHandle('x', i))}
          {zs.map((_, i) => renderHandle('z', i))}
        </svg>
      </div>

      <div className="min-h-[2rem] flex items-center gap-2 text-xs text-muted-foreground">
        {sel ? (
          <>
            <span className="flex-1 min-w-0">
              <span style={{ color: sel.axis === 'x' ? AXIS_COLORS.width : AXIS_COLORS.depth }}>
                {sel.axis === 'x' ? 'Width' : 'Depth'} divider {sel.index + 1}
              </span>
              {' · '}
              <span className="font-mono text-foreground">{selPct}%</span>
              {' · '}
              <span className="font-mono text-foreground">{fmt((selPct / 100) * inner(sel.axis))} mm</span>
              {' from '}{sel.axis === 'x' ? 'left' : 'front'}
            </span>
            <button
              className="p-1.5 rounded-md hover:text-red-400 hover:bg-accent"
              aria-label="Remove divider"
              title="Remove divider"
              onClick={() => removeDivider(sel.axis, sel.index)}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        ) : (
          <span>Drag a divider to move it. Numbers in each cell are clear sizes in mm.</span>
        )}
      </div>

      </div>

      {mode === 'numbers' && (
        <div className="space-y-4">
          {(['x', 'z'] as Axis[]).map((axis) => {
            const arr = list(axis)
            const color = axis === 'x' ? AXIS_COLORS.width : AXIS_COLORS.depth
            return (
              <div key={axis} className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color }}>{axis === 'x' ? 'Along width' : 'Along depth'}</span>
                  <span className="text-muted-foreground">from the {axis === 'x' ? 'left' : 'front'} wall</span>
                </div>
                {arr.length === 0 && <p className="text-xs text-muted-foreground">No dividers.</p>}
                {arr.map((pct, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-4 text-xs text-muted-foreground">{i + 1}</span>
                    <MmInput
                      label={`${axis === 'x' ? 'Width' : 'Depth'} divider ${i + 1} position in millimetres`}
                      value={(pct / 100) * inner(axis)}
                      onCommit={(mm) => setPosition(axis, i, (mm / inner(axis)) * 100, true)}
                    />
                    <span className="flex-1 font-mono text-xs text-muted-foreground">{fmt(pct)}%</span>
                    <button
                      className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-accent"
                      aria-label={`Remove ${axis === 'x' ? 'width' : 'depth'} divider ${i + 1}`}
                      title="Remove divider"
                      onClick={() => removeDivider(axis, i)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {arr.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Clear sizes: <span className="font-mono">{compartmentSpans(arr, inner(axis), divT).map(fmt).join(' · ')}</span> mm
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1" disabled={xs.length >= MAX_DIVIDERS} onClick={() => addDivider('x')}>
          <Plus className="mr-1.5 h-4 w-4" style={{ color: AXIS_COLORS.width }} />
          Along width
        </Button>
        <Button variant="secondary" size="sm" className="flex-1" disabled={zs.length >= MAX_DIVIDERS} onClick={() => addDivider('z')}>
          <Plus className="mr-1.5 h-4 w-4" style={{ color: AXIS_COLORS.depth }} />
          Along depth
        </Button>
      </div>

      <div className="flex justify-end gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={xs.length + zs.length === 0}
          onClick={() => onChange({ divisionsX: evenPositions(xs.length), divisionsZ: evenPositions(zs.length) })}
        >
          <AlignHorizontalSpaceAround className="mr-1.5 h-4 w-4" />
          Space evenly
        </Button>
        <Button variant="ghost" size="sm" disabled={xs.length + zs.length === 0} onClick={clearAll}>
          <Eraser className="mr-1.5 h-4 w-4" />
          Clear all
        </Button>
      </div>
    </div>
  )
}
