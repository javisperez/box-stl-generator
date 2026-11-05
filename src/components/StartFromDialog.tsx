import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from './ui/button'
import { Segmented } from './ui/segmented'
import { SliderField } from './ui/slider-field'
import { BoxParams, clampDivisionThickness } from '@/utils/boxGenerator'
import { frictionLipDepth, layoutFromDepths, layoutFromItemGrid } from '@/utils/boxLayout'

interface StartFromDialogProps {
  params: BoxParams
  onParamsChange: (params: BoxParams) => void
  onClose: () => void
}

type Mode = 'volume' | 'items' | 'divisions'

const fieldCls = 'w-full px-3 py-2 text-sm rounded-md border bg-background focus:outline-none focus:border-ring'

/** One-shot calculators that overwrite the box size/dividers: volume, items, or exact division depths. */
export function StartFromDialog({ params, onParamsChange, onClose }: StartFromDialogProps) {
  const [mode, setMode] = useState<Mode>('volume')

  const [volume, setVolume] = useState(1000) // cubic mm
  const [compartmentCount, setCompartmentCount] = useState(4)
  const [itemWidth, setItemWidth] = useState(50) // mm
  const [itemDepth, setItemDepth] = useState(30) // mm
  const [itemHeight, setItemHeight] = useState(10) // mm
  const [divisionSizes, setDivisionSizes] = useState('51, 45, 29') // mm
  const [divisionWallThickness, setDivisionWallThickness] = useState(2) // mm

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const lipDepth = frictionLipDepth(params)

  const apply = (next: BoxParams) => {
    onParamsChange(next)
    onClose()
  }

  const generateFromVolume = () => {
    // Cube root for roughly cubic proportions, then adjust
    const side = Math.cbrt(volume)
    apply({
      ...params,
      width: Math.round(side * 1.2), // slightly wider
      depth: Math.round(side),
      height: Math.round(side * 0.8), // slightly shorter
    })
  }

  const generateFromCompartments = () => {
    const cols = Math.ceil(Math.sqrt(compartmentCount))
    const rows = Math.ceil(compartmentCount / cols)
    const wall = params.wallThickness
    const grid = layoutFromItemGrid(itemWidth, itemDepth, cols, rows, wall, clampDivisionThickness(params.divisionThickness, wall))

    apply({
      ...params,
      width: grid.width,
      depth: grid.depth,
      height: Math.round((itemHeight + wall + lipDepth) * 100) / 100,
      divisionsX: grid.divisionsX,
      divisionsZ: grid.divisionsZ,
    })
  }

  const divisions = divisionSizes
    .split(',')
    .map(s => parseFloat(s.trim()))
    .filter(n => !isNaN(n) && n > 0)
  const divisionsLayout = layoutFromDepths(divisions, divisionWallThickness)

  const generateFromDivisions = () => {
    if (divisions.length === 0) return
    apply({
      ...params,
      depth: divisionsLayout.depth,
      wallThickness: divisionWallThickness,
      divisionThickness: divisionWallThickness,
      divisionsX: [],
      divisionsZ: divisionsLayout.positions,
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div role="dialog" aria-modal="true" aria-label="Start from" className="w-full max-w-sm rounded-xl border bg-popover p-5 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Start from…</h2>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <Segmented
          aria-label="Start from"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'volume', label: 'Volume' },
            { value: 'items', label: 'Items' },
            { value: 'divisions', label: 'Divisions' },
          ]}
        />

        {mode === 'volume' && (
          <div className="space-y-4">
            <SliderField
              label="Volume"
              unit="cm³"
              min={100}
              max={10000}
              step={50}
              value={volume}
              onChange={setVolume}
              format={(v) => (v / 1000).toFixed(1)}
              parse={(s) => Number(s) * 1000}
            />
            <p className="text-xs text-muted-foreground">
              Sets the outer width, depth and height to roughly match this volume. The usable
              interior ends up a bit smaller once walls are subtracted.
            </p>
            <Button className="w-full" onClick={generateFromVolume}>Apply</Button>
          </div>
        )}

        {mode === 'items' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5 text-xs text-muted-foreground">
                Item width (mm)
                <input type="number" value={itemWidth} onChange={(e) => setItemWidth(Number(e.target.value))} className={fieldCls} />
              </label>
              <label className="space-y-1.5 text-xs text-muted-foreground">
                Item depth (mm)
                <input type="number" value={itemDepth} onChange={(e) => setItemDepth(Number(e.target.value))} className={fieldCls} />
              </label>
            </div>
            <SliderField label="Item height" unit="mm" min={5} max={50} value={itemHeight} onChange={setItemHeight} />
            <SliderField label="Compartments" min={1} max={16} value={compartmentCount} onChange={setCompartmentCount} />
            <p className="text-xs text-muted-foreground">
              Sizes are the clear space each item needs. Walls and dividers are added on top
              {lipDepth > 0 && `, plus the ${params.lidHeight} mm lid lip so items still fit with the lid on`}.
            </p>
            <Button className="w-full" onClick={generateFromCompartments}>Apply</Button>
          </div>
        )}

        {mode === 'divisions' && (
          <div className="space-y-4">
            <label className="block space-y-1.5 text-xs text-muted-foreground">
              Compartment depths (mm), front to back
              <input
                type="text"
                value={divisionSizes}
                onChange={(e) => setDivisionSizes(e.target.value)}
                placeholder="51, 48, 30"
                className={fieldCls}
              />
            </label>
            <SliderField
              label="Wall thickness"
              unit="mm"
              min={1}
              max={5}
              step={0.5}
              value={divisionWallThickness}
              onChange={setDivisionWallThickness}
              hint="Used for both the outer walls and the dividers."
            />
            {divisions.length > 0 && (
              <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                Total outer depth <span className="font-mono text-foreground">{divisionsLayout.depth} mm</span>
                {' '}({divisions.length} compartment{divisions.length === 1 ? '' : 's'} + {divisions.length + 1} walls)
              </div>
            )}
            <Button className="w-full" onClick={generateFromDivisions} disabled={divisions.length === 0}>Apply</Button>
          </div>
        )}
      </div>
    </div>
  )
}
