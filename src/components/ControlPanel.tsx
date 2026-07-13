import { useRef, useState } from 'react'
import { Label } from './ui/label'
import { Slider } from './ui/slider'
import { Button } from './ui/button'
import { Save, RotateCcw, ChevronDown, Trash2, FileDown, FileUp, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { BoxParams, sleeveOuterDims, LID_PATTERNS } from '@/utils/boxGenerator'
import { SavedProject, AppSettings } from '@/utils/projectStorage'

interface ControlPanelProps {
  params: BoxParams
  onParamsChange: (params: BoxParams) => void
  previewInPlace: boolean
  onPreviewInPlaceChange: (value: boolean) => void
  settings: AppSettings
  onSettingsChange: (settings: AppSettings) => void
  projectName: string
  onProjectNameChange: (name: string) => void
  onReset: () => void
  savedProjects: SavedProject[]
  onSaveProject: (name: string) => void
  onLoadProject: (name: string) => void
  onDeleteProject: (name: string) => void
  onExportJson: (name: string) => void
  onImportJson: (file: File) => void
}

type TabType = 'generator' | 'box' | 'lid' | 'settings'

const PRINTER_PRESETS: { label: string; bedX: number; bedY: number }[] = [
  { label: 'Custom', bedX: 0, bedY: 0 },
  { label: 'Bambu Lab X1 / P1S', bedX: 256, bedY: 256 },
  { label: 'Bambu Lab A1', bedX: 256, bedY: 256 },
  { label: 'Bambu Lab A1 Mini', bedX: 180, bedY: 180 },
  { label: 'Prusa MK4 / MK3S+', bedX: 250, bedY: 210 },
  { label: 'Prusa Mini+', bedX: 180, bedY: 180 },
  { label: 'Creality Ender 3', bedX: 220, bedY: 220 },
  { label: 'Creality K1 / K1 Max', bedX: 300, bedY: 300 },
  { label: 'Voron 2.4 (350)', bedX: 350, bedY: 350 },
  { label: 'Voron 0.2', bedX: 120, bedY: 120 },
  { label: 'Elegoo Neptune 4', bedX: 225, bedY: 225 },
]

function evenPositions(count: number): number[] {
  return Array.from({ length: count }, (_, i) => Math.round((i + 1) * 100 / (count + 1)))
}

export function ControlPanel({
  params, onParamsChange, previewInPlace, onPreviewInPlaceChange,
  settings, onSettingsChange, projectName, onProjectNameChange, onReset,
  savedProjects, onSaveProject, onLoadProject, onDeleteProject, onExportJson, onImportJson,
}: ControlPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('generator')
  const importInputRef = useRef<HTMLInputElement>(null)
  const [volume, setVolume] = useState(1000) // cubic mm
  const [compartmentCount, setCompartmentCount] = useState(4)
  const [itemWidth, setItemWidth] = useState(50) // mm
  const [itemDepth, setItemDepth] = useState(30) // mm
  const [itemHeight, setItemHeight] = useState(10) // mm

  // Collapsible section state - generator sections collapsed by default
  const [volumeExpanded, setVolumeExpanded] = useState(false)
  const [compartmentExpanded, setCompartmentExpanded] = useState(false)
  const [divisionExpanded, setDivisionExpanded] = useState(false)

  // Settings sections — the ones you use most start open
  const [plateExpanded, setPlateExpanded] = useState(true)
  const [projectsExpanded, setProjectsExpanded] = useState(true)
  const [shareExpanded, setShareExpanded] = useState(false)

  // Division Designer state
  const [divisionSizes, setDivisionSizes] = useState('51, 45, 29') // mm
  const [divisionWallThickness, setDivisionWallThickness] = useState(2) // mm

  const updateParam = (key: keyof BoxParams, value: number | boolean | string) => {
    const next = { ...params, [key]: value }
    // Divider walls can never be thicker than the outer walls
    if (key === 'wallThickness') {
      next.divisionThickness = Math.min(next.divisionThickness, value as number)
    }
    onParamsChange(next)
  }

  const setDivisionCount = (axis: 'divisionsX' | 'divisionsZ', count: number) => {
    onParamsChange({ ...params, [axis]: evenPositions(count) })
  }

  const setDivisionPosition = (axis: 'divisionsX' | 'divisionsZ', index: number, value: number) => {
    const arr = [...params[axis]]
    arr[index] = value
    onParamsChange({ ...params, [axis]: arr })
  }

  const generateFromVolume = () => {
    // Calculate cube root for roughly cubic proportions, then adjust
    const side = Math.cbrt(volume)
    const newParams = {
      ...params,
      width: Math.round(side * 1.2), // slightly wider
      depth: Math.round(side),
      height: Math.round(side * 0.8), // slightly shorter
    }
    onParamsChange(newParams)
    setActiveTab('box')
  }

  const generateFromCompartments = () => {
    const totalWidth = itemWidth * Math.ceil(Math.sqrt(compartmentCount)) + params.wallThickness * (Math.ceil(Math.sqrt(compartmentCount)) + 1)
    const totalDepth = itemDepth * Math.ceil(compartmentCount / Math.ceil(Math.sqrt(compartmentCount))) + params.wallThickness * (Math.ceil(compartmentCount / Math.ceil(Math.sqrt(compartmentCount))) + 1)
    const totalHeight = itemHeight + params.wallThickness

    const newParams = {
      ...params,
      width: Math.round(totalWidth),
      depth: Math.round(totalDepth),
      height: Math.round(totalHeight),
      divisionsX: compartmentCount > 1 ? evenPositions(Math.ceil(Math.sqrt(compartmentCount)) - 1) : [],
      divisionsZ: compartmentCount > Math.ceil(Math.sqrt(compartmentCount)) ? evenPositions(Math.ceil(compartmentCount / Math.ceil(Math.sqrt(compartmentCount))) - 1) : []
    }
    onParamsChange(newParams)
    setActiveTab('box')
  }

  const resizeBoxToPlate = () => {
    // Use 80% of the plate to leave margin for brim/supports
    const maxWidth = Math.round(settings.printerBedX * 0.8)
    const maxDepth = Math.round(settings.printerBedY * 0.8)
    const height = Math.round(Math.min(maxWidth, maxDepth) * 0.5)
    onParamsChange({ ...params, width: maxWidth, depth: maxDepth, height })
    setActiveTab('box')
  }

  const generateFromDivisions = () => {
    try {
      // Parse division sizes from comma-separated string
      const divisions = divisionSizes
        .split(',')
        .map(s => parseFloat(s.trim()))
        .filter(n => !isNaN(n) && n > 0)

      if (divisions.length === 0) {
        alert('Please enter valid division sizes')
        return
      }

      // Calculate total depth: sum of divisions + walls
      const totalDepth = divisions.reduce((sum, div) => sum + div, 0) +
                        (divisions.length + 1) * divisionWallThickness

      // Calculate division positions as percentages along depth
      let currentPos = divisionWallThickness
      const divisionPositions: number[] = []

      for (let i = 0; i < divisions.length - 1; i++) {
        currentPos += divisions[i] + divisionWallThickness
        const percentage = Math.round((currentPos / totalDepth) * 100)
        divisionPositions.push(percentage)
      }

      const newParams = {
        ...params,
        depth: Math.round(totalDepth),
        wallThickness: divisionWallThickness,
        divisionThickness: divisionWallThickness,
        divisionsX: [], // Clear X divisions
        divisionsZ: divisionPositions,
      }
      onParamsChange(newParams)
      setActiveTab('box')
    } catch (error) {
      alert('Error parsing division sizes. Please use format: 51, 48, 30')
    }
  }

  // ── Plate fit (Settings tab) ────────────────────────────────────────────────
  const bedX = settings.printerBedX
  const bedY = settings.printerBedY
  const fitsPlate = (w: number, d: number) =>
    (w <= bedX && d <= bedY) || (w <= bedY && d <= bedX)

  const sleeve = sleeveOuterDims(params)
  const footprints: { name: string; w: number; d: number }[] = [
    { name: 'Box', w: params.width, d: params.depth },
  ]
  if (params.includeLid) {
    footprints.push(params.lidStyle === 'sleeve'
      ? { name: 'Sleeve', w: +sleeve.w.toFixed(1), d: +sleeve.d.toFixed(1) }
      : { name: 'Lid', w: params.width, d: params.depth })
  }
  const oversized = footprints.filter(f => !fitsPlate(f.w, f.d))

  // Which tolerance the unified slider edits (hinged lids are flat — no lip, no tolerance)
  const isSleeveStyle = params.lidStyle === 'sleeve'
  const showTolerance = isSleeveStyle || !params.includeHinge
  const toleranceValue = isSleeveStyle ? params.sleeveTolerance : params.lidTolerance

  return (
    <div className="px-5 pb-5 space-y-5">
      {/* Tabs — sticky within the sidebar's scroll container */}
      <div className="sticky top-0 z-10 bg-card pt-4 -mx-5 px-5">
        <div className="flex border-b">
          {([
            ['generator', 'Generator'],
            ['box', 'Box'],
            ['lid', 'Lid'],
            ['settings', 'Settings'],
          ] as [TabType, string][]).map(([tab, label]) => (
            <button
              key={tab}
              className={`px-3 py-2 font-medium transition-colors ${
                activeTab === tab
                  ? 'border-b-2 border-primary text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="space-y-4">
        {activeTab === 'generator' && (
          <div className="space-y-6">
            {/* Volume-based Calculator */}
            <div className="border rounded-lg overflow-hidden">
              <button
                className="w-full p-4 text-left flex justify-between items-center hover:bg-muted/50 transition-colors"
                onClick={() => setVolumeExpanded(!volumeExpanded)}
              >
                <div>
                  <h3 className="text-lg font-semibold">Volume Calculator</h3>
                  <p className="text-sm text-muted-foreground">Enter desired volume and generate box dimensions</p>
                </div>
                <ChevronDown
                  className={`h-5 w-5 transition-transform ${
                    volumeExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {volumeExpanded && (
                <div className="p-4 border-t space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label>Volume (cm³)</Label>
                      <span className="text-sm text-muted-foreground">{(volume / 1000).toFixed(1)}</span>
                    </div>
                    <Slider
                      min={100}
                      max={10000}
                      step={50}
                      value={volume}
                      onValueChange={setVolume}
                    />
                  </div>

                  <Button onClick={generateFromVolume} className="w-full">
                    Generate from Volume
                  </Button>
                </div>
              )}
            </div>

            {/* Compartment Calculator */}
            <div className="border rounded-lg overflow-hidden">
              <button
                className="w-full p-4 text-left flex justify-between items-center hover:bg-muted/50 transition-colors"
                onClick={() => setCompartmentExpanded(!compartmentExpanded)}
              >
                <div>
                  <h3 className="text-lg font-semibold">Compartment Calculator</h3>
                  <p className="text-sm text-muted-foreground">Define what items you want to store</p>
                </div>
                <ChevronDown
                  className={`h-5 w-5 transition-transform ${
                    compartmentExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {compartmentExpanded && (
                <div className="p-4 border-t space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Item Width (mm)</Label>
                      <input
                        type="number"
                        value={itemWidth}
                        onChange={(e) => setItemWidth(Number(e.target.value))}
                        className="w-full px-3 py-2 text-sm rounded-md border bg-background"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Item Depth (mm)</Label>
                      <input
                        type="number"
                        value={itemDepth}
                        onChange={(e) => setItemDepth(Number(e.target.value))}
                        className="w-full px-3 py-2 text-sm rounded-md border bg-background"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label>Item Height (mm)</Label>
                      <span className="text-sm text-muted-foreground">{itemHeight}</span>
                    </div>
                    <Slider
                      min={5}
                      max={50}
                      step={1}
                      value={itemHeight}
                      onValueChange={setItemHeight}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label>Number of Compartments</Label>
                      <span className="text-sm text-muted-foreground">{compartmentCount}</span>
                    </div>
                    <Slider
                      min={1}
                      max={16}
                      step={1}
                      value={compartmentCount}
                      onValueChange={setCompartmentCount}
                    />
                  </div>

                  <Button onClick={generateFromCompartments} className="w-full">
                    Generate with Compartments
                  </Button>
                </div>
              )}
            </div>

            {/* Division Designer */}
            <div className="border rounded-lg overflow-hidden">
              <button
                className="w-full p-4 text-left flex justify-between items-center hover:bg-muted/50 transition-colors"
                onClick={() => setDivisionExpanded(!divisionExpanded)}
              >
                <div>
                  <h3 className="text-lg font-semibold">Division Designer</h3>
                  <p className="text-sm text-muted-foreground">Specify exact division depths and wall thickness</p>
                </div>
                <ChevronDown
                  className={`h-5 w-5 transition-transform ${
                    divisionExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {divisionExpanded && (
                <div className="p-4 border-t space-y-4">
                  <div className="space-y-2">
                    <Label>Division Depths (mm)</Label>
                    <input
                      type="text"
                      value={divisionSizes}
                      onChange={(e) => setDivisionSizes(e.target.value)}
                      placeholder="51, 48, 30"
                      className="w-full px-3 py-2 text-sm rounded-md border bg-background"
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter comma-separated depths (e.g., 51, 48, 30)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label>Wall Thickness (mm)</Label>
                      <span className="text-sm text-muted-foreground">{divisionWallThickness}</span>
                    </div>
                    <Slider
                      min={1}
                      max={5}
                      step={0.5}
                      value={divisionWallThickness}
                      onValueChange={setDivisionWallThickness}
                    />
                  </div>

                  {/* Preview calculation */}
                  {(() => {
                    try {
                      const divisions = divisionSizes
                        .split(',')
                        .map(s => parseFloat(s.trim()))
                        .filter(n => !isNaN(n) && n > 0)

                      if (divisions.length > 0) {
                        const totalDepth = divisions.reduce((sum, div) => sum + div, 0) +
                                          (divisions.length + 1) * divisionWallThickness
                        return (
                          <div className="p-3 bg-muted rounded text-sm">
                            <p><strong>Preview:</strong></p>
                            <p>Divisions: {divisions.join('mm, ')}mm</p>
                            <p>Total depth: {Math.round(totalDepth)}mm</p>
                            <p>({divisions.length} compartments)</p>
                          </div>
                        )
                      }
                    } catch {}
                    return null
                  })()}

                  <Button onClick={generateFromDivisions} className="w-full">
                    Generate with Divisions
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'box' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label>Width (mm)</Label>
                <span className="text-sm text-muted-foreground">{params.width}</span>
              </div>
              <Slider
                min={10}
                max={200}
                step={0.5}
                value={params.width}
                onValueChange={(value) => updateParam('width', value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label>Depth (mm)</Label>
                <span className="text-sm text-muted-foreground">{params.depth}</span>
              </div>
              <Slider
                min={10}
                max={200}
                step={0.5}
                value={params.depth}
                onValueChange={(value) => updateParam('depth', value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label>Height (mm)</Label>
                <span className="text-sm text-muted-foreground">{params.height}</span>
              </div>
              <Slider
                min={10}
                max={200}
                step={0.5}
                value={params.height}
                onValueChange={(value) => updateParam('height', value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label>Wall Thickness (mm)</Label>
                <span className="text-sm text-muted-foreground">{params.wallThickness}</span>
              </div>
              <Slider
                min={1}
                max={10}
                step={0.5}
                value={params.wallThickness}
                onValueChange={(value) => updateParam('wallThickness', value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label>Divider Thickness (mm)</Label>
                <span className="text-sm text-muted-foreground">{params.divisionThickness}</span>
              </div>
              <Slider
                min={0.4}
                max={params.wallThickness}
                step={0.2}
                value={params.divisionThickness}
                onValueChange={(value) => updateParam('divisionThickness', value)}
              />
              <p className="text-xs text-muted-foreground">
                Thickness of the internal divider walls. Capped at the outer wall thickness ({params.wallThickness} mm) so dividers are never thicker than the box itself.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label>Chamfer (mm)</Label>
                <span className="text-sm text-muted-foreground">{params.chamferSize}</span>
              </div>
              <Slider
                min={0}
                max={Math.min(params.wallThickness, params.width / 4, params.depth / 4)}
                step={0.5}
                value={params.chamferSize}
                onValueChange={(value) => updateParam('chamferSize', value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label>X Divisions</Label>
                <span className="text-sm text-muted-foreground">{params.divisionsX.length}</span>
              </div>
              <Slider
                min={0}
                max={10}
                step={1}
                value={params.divisionsX.length}
                onValueChange={(value) => setDivisionCount('divisionsX', value)}
              />
              {params.divisionsX.map((pos, i) => (
                <div key={i} className="space-y-1 pl-4">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs">X Divider {i + 1} (%)</Label>
                    <span className="text-xs text-muted-foreground">{pos}%</span>
                  </div>
                  <Slider
                    min={1}
                    max={99}
                    step={1}
                    value={pos}
                    onValueChange={(value) => setDivisionPosition('divisionsX', i, value)}
                  />
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label>Z Divisions</Label>
                <span className="text-sm text-muted-foreground">{params.divisionsZ.length}</span>
              </div>
              <Slider
                min={0}
                max={10}
                step={1}
                value={params.divisionsZ.length}
                onValueChange={(value) => setDivisionCount('divisionsZ', value)}
              />
              {params.divisionsZ.map((pos, i) => (
                <div key={i} className="space-y-1 pl-4">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs">Z Divider {i + 1} (%)</Label>
                    <span className="text-xs text-muted-foreground">{pos}%</span>
                  </div>
                  <Slider
                    min={1}
                    max={99}
                    step={1}
                    value={pos}
                    onValueChange={(value) => setDivisionPosition('divisionsZ', i, value)}
                  />
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label>Cutout Pattern</Label>
              <div className="grid grid-cols-4 gap-2">
                {LID_PATTERNS.map(({ value, label }) => (
                  <button
                    key={value}
                    className={`px-2 py-1.5 text-sm rounded-md border ${params.boxPattern === value ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                    onClick={() => updateParam('boxPattern', value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Holes cut through the box's side walls and floor to save filament.
                {params.includeHinge && ' The back wall stays solid to support the hinge.'}
              </p>

              {params.boxPattern !== 'none' && (
                <div className="space-y-4 pt-1">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label>Cutout Size (mm)</Label>
                      <span className="text-sm text-muted-foreground">{params.boxPatternSize}</span>
                    </div>
                    <Slider
                      min={3}
                      max={25}
                      step={0.5}
                      value={params.boxPatternSize}
                      onValueChange={(value) => updateParam('boxPatternSize', value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label>Cutout Spacing (mm)</Label>
                      <span className="text-sm text-muted-foreground">{params.boxPatternSpacing}</span>
                    </div>
                    <Slider
                      min={2}
                      max={15}
                      step={0.5}
                      value={params.boxPatternSpacing}
                      onValueChange={(value) => updateParam('boxPatternSpacing', value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Wider spacing means a stronger part; larger cutouts save more filament.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'lid' && (
          <div className="space-y-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={params.includeLid}
                onChange={(e) => updateParam('includeLid', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm">Generate lid / sleeve</span>
            </label>

            {params.includeLid && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Style</Label>
                  <div className="flex gap-2">
                    <button
                      className={`flex-1 px-3 py-1.5 text-sm rounded-md border ${params.lidStyle === 'lid' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                      onClick={() => updateParam('lidStyle', 'lid')}
                    >
                      Lid
                    </button>
                    <button
                      className={`flex-1 px-3 py-1.5 text-sm rounded-md border ${params.lidStyle === 'sleeve' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                      onClick={() => updateParam('lidStyle', 'sleeve')}
                    >
                      Drawer Sleeve
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isSleeveStyle
                      ? 'An open-front cover the box slides in and out of, like a matchbox drawer.'
                      : 'A cap that sits on top of the box.'}
                  </p>
                </div>

                {/* Common options for both styles */}
                <div className="space-y-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={previewInPlace}
                      onChange={(e) => onPreviewInPlaceChange(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span className="text-sm">
                      {isSleeveStyle ? 'Preview box inside sleeve' : 'Preview lid in place'}
                    </span>
                  </label>
                  <p className="text-xs text-muted-foreground pl-6">
                    {isSleeveStyle
                      ? 'Shows the box slid into the sleeve.'
                      : params.includeHinge
                        ? 'Shows the lid closed on the box with the hinge assembled.'
                        : 'Shows the lid flipped and closed on the box.'}
                    {' '}Preview only — exported STLs are not affected.
                  </p>
                </div>

                {showTolerance && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label>Fit Tolerance (mm)</Label>
                      <span className="text-sm text-muted-foreground">{toleranceValue}</span>
                    </div>
                    <Slider
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={toleranceValue}
                      onValueChange={(value) => updateParam(isSleeveStyle ? 'sleeveTolerance' : 'lidTolerance', value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      {isSleeveStyle
                        ? 'Gap between the box and the sleeve interior — lower means a tighter fit. Increase it if the box is hard to slide.'
                        : "Gap between the lid's lip and the box walls — lower means a tighter fit. Increase it if the lid is hard to put on or take off."}
                    </p>
                  </div>
                )}

                {/* Cutout pattern — common to both styles */}
                <div className="space-y-2">
                  <Label>Cutout Pattern</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {LID_PATTERNS.map(({ value, label }) => (
                      <button
                        key={value}
                        className={`px-2 py-1.5 text-sm rounded-md border ${params.lidPattern === value ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                        onClick={() => updateParam('lidPattern', value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isSleeveStyle
                      ? 'Holes cut through the sleeve\'s top, bottom, side, and back walls to save filament.'
                      : 'Holes cut through the lid to save filament.'}
                    {' '}Text always keeps a solid patch around it.
                  </p>

                  {params.lidPattern !== 'none' && (
                    <div className="space-y-4 pt-1">
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <Label>Cutout Size (mm)</Label>
                          <span className="text-sm text-muted-foreground">{params.lidPatternSize}</span>
                        </div>
                        <Slider
                          min={3}
                          max={25}
                          step={0.5}
                          value={params.lidPatternSize}
                          onValueChange={(value) => updateParam('lidPatternSize', value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <Label>Cutout Spacing (mm)</Label>
                          <span className="text-sm text-muted-foreground">{params.lidPatternSpacing}</span>
                        </div>
                        <Slider
                          min={2}
                          max={15}
                          step={0.5}
                          value={params.lidPatternSpacing}
                          onValueChange={(value) => updateParam('lidPatternSpacing', value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Wider spacing means a stronger part; larger cutouts save more filament.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Lid-only options */}
                {params.lidStyle === 'lid' && !params.includeHinge && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label>Lip Height (mm)</Label>
                      <span className="text-sm text-muted-foreground">{params.lidHeight}</span>
                    </div>
                    <Slider
                      min={2}
                      max={20}
                      step={0.5}
                      value={params.lidHeight}
                      onValueChange={(value) => updateParam('lidHeight', value)}
                    />
                  </div>
                )}

                {params.lidStyle === 'lid' && (
                  <div className="pt-3 border-t space-y-4">
                    <h4 className="text-sm font-semibold">Hinge</h4>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={params.includeHinge}
                        onChange={(e) => updateParam('includeHinge', e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <span className="text-sm">Add snap hinges</span>
                    </label>

                    {params.includeHinge && (
                      <div className="space-y-4 pl-2">
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <Label>Number of hinges</Label>
                            <span className="text-sm text-muted-foreground">{params.hingeCount}</span>
                          </div>
                          <Slider
                            min={1}
                            max={3}
                            step={1}
                            value={params.hingeCount}
                            onValueChange={(value) => updateParam('hingeCount', value)}
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <Label>Barrel diameter (mm)</Label>
                            <span className="text-sm text-muted-foreground">{params.hingeDiameter}</span>
                          </div>
                          <Slider
                            min={6}
                            max={14}
                            step={0.5}
                            value={params.hingeDiameter}
                            onValueChange={(value) => updateParam('hingeDiameter', value)}
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <Label>Axle diameter (mm)</Label>
                            <span className="text-sm text-muted-foreground">{params.hingePinDiameter}</span>
                          </div>
                          <Slider
                            min={2}
                            max={5}
                            step={0.5}
                            value={params.hingePinDiameter}
                            onValueChange={(value) => updateParam('hingePinDiameter', value)}
                          />
                          <p className="text-xs text-muted-foreground">
                            Diameter of the snap axles on the lid knuckle. Thicker is stronger but needs more force to click in.
                          </p>
                        </div>

                        <p className="text-xs text-muted-foreground">
                          Pin-less snap hinge on the back edge: press the lid's axle stubs straight down into the box knuckles until they click — nothing extra to print. Pull the lid straight up (open flat) to remove it. Hinged lids are flat, with no inner lip.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Sleeve-only options */}
                {isSleeveStyle && (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={params.sleeveCutout}
                        onChange={(e) => updateParam('sleeveCutout', e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <span className="text-sm">Finger cutout at the opening</span>
                    </label>
                    <p className="text-xs text-muted-foreground pl-6">
                      Adds semicircular notches to the top and bottom walls at the opening so you can pinch the box to slide it out — helpful for heavy contents. Print the sleeve standing on its closed back for a clean opening.
                    </p>
                  </div>
                )}

                {/* Text — common to both styles */}
                <div className="pt-3 border-t space-y-4">
                  <h4 className="text-sm font-semibold">Text / Emoji</h4>
                  <p className="text-xs text-muted-foreground -mt-2">
                    {isSleeveStyle
                      ? 'Engraved or embossed on the top wall of the sleeve.'
                      : params.includeHinge
                        ? 'Engraved or embossed on the top of the lid.'
                        : 'Engraved or embossed on the top of the lid (pre-mirrored for the flip).'}
                  </p>

                  <div className="space-y-2">
                    <Label>Text</Label>
                    <input
                      type="text"
                      value={params.lidText}
                      onChange={(e) => updateParam('lidText', e.target.value)}
                      placeholder="Enter text or emoji..."
                      className="w-full px-3 py-2 text-sm rounded-md border bg-background"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label>Text Size (mm)</Label>
                      <span className="text-sm text-muted-foreground">{params.lidTextSize}</span>
                    </div>
                    <Slider
                      min={8}
                      max={40}
                      step={1}
                      value={params.lidTextSize}
                      onValueChange={(value) => updateParam('lidTextSize', value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label>Text Depth (mm)</Label>
                      <span className="text-sm text-muted-foreground">{params.lidTextDepth}</span>
                    </div>
                    <Slider
                      min={0.3}
                      max={2}
                      step={0.1}
                      value={params.lidTextDepth}
                      onValueChange={(value) => updateParam('lidTextDepth', value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Style</Label>
                    <div className="flex gap-2">
                      <button
                        className={`flex-1 px-3 py-1.5 text-sm rounded-md border ${params.lidTextStyle === 'engraved' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                        onClick={() => updateParam('lidTextStyle', 'engraved')}
                      >
                        Engraved
                      </button>
                      <button
                        className={`flex-1 px-3 py-1.5 text-sm rounded-md border ${params.lidTextStyle === 'embossed' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                        onClick={() => updateParam('lidTextStyle', 'embossed')}
                      >
                        Embossed
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Rotation</Label>
                    <div className="flex gap-2">
                      {[0, 90, 180, 270].map((deg) => (
                        <button
                          key={deg}
                          className={`flex-1 px-3 py-1.5 text-sm rounded-md border ${params.lidTextRotation === deg ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                          onClick={() => updateParam('lidTextRotation', deg)}
                        >
                          {deg}°
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Rotates the text on the surface — at 90° or 270° it runs along the depth instead of the width.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-4">
            {/* Printer plate size */}
            <div className="border rounded-lg overflow-hidden">
              <button
                className="w-full p-4 text-left flex justify-between items-center hover:bg-muted/50 transition-colors"
                onClick={() => setPlateExpanded(!plateExpanded)}
              >
                <div>
                  <h3 className="text-lg font-semibold">Printer Plate Size</h3>
                  <p className="text-sm text-muted-foreground">Outlined in the preview; warns when a part won't fit</p>
                </div>
                <ChevronDown
                  className={`h-5 w-5 transition-transform ${
                    plateExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {plateExpanded && (
                <div className="p-4 border-t space-y-4">
                  <div className="space-y-2">
                    <Label>Printer Preset</Label>
                    <select
                      className="w-full px-3 py-2 text-sm rounded-md border bg-background"
                      value={PRINTER_PRESETS.findIndex(p => p.bedX === bedX && p.bedY === bedY)}
                      onChange={(e) => {
                        const preset = PRINTER_PRESETS[Number(e.target.value)]
                        if (preset && preset.bedX > 0) {
                          onSettingsChange({ ...settings, printerBedX: preset.bedX, printerBedY: preset.bedY })
                        }
                      }}
                    >
                      {PRINTER_PRESETS.map((preset, i) => (
                        <option key={i} value={i}>
                          {preset.label}{preset.bedX > 0 ? ` (${preset.bedX} x ${preset.bedY}mm)` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Plate Width (mm)</Label>
                      <input
                        type="number"
                        value={bedX}
                        onChange={(e) => onSettingsChange({ ...settings, printerBedX: Number(e.target.value) })}
                        className="w-full px-3 py-2 text-sm rounded-md border bg-background"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Plate Depth (mm)</Label>
                      <input
                        type="number"
                        value={bedY}
                        onChange={(e) => onSettingsChange({ ...settings, printerBedY: Number(e.target.value) })}
                        className="w-full px-3 py-2 text-sm rounded-md border bg-background"
                      />
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    The plate is outlined on the ground of the 3D preview — it turns red when something doesn't fit.
                    {footprints.map(f => ` · ${f.name} ${f.w} × ${f.d} mm`).join('')}
                  </p>

                  {oversized.length > 0 ? (
                    <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 border border-red-500/40 bg-red-500/10 rounded-md p-3">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <p>
                        {oversized.map(f => f.name).join(' and ')} ({oversized.map(f => `${f.w} × ${f.d} mm`).join(', ')}) won't
                        fit the {bedX} × {bedY} mm plate, even rotated.
                      </p>
                    </div>
                  ) : (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      All parts fit the plate.
                    </p>
                  )}

                  <Button variant="outline" className="w-full" onClick={resizeBoxToPlate}>
                    Resize box to fill plate (80%)
                  </Button>
                </div>
              )}
            </div>

            {/* Projects */}
            <div className="border rounded-lg overflow-hidden">
              <button
                className="w-full p-4 text-left flex justify-between items-center hover:bg-muted/50 transition-colors"
                onClick={() => setProjectsExpanded(!projectsExpanded)}
              >
                <div>
                  <h3 className="text-lg font-semibold">Projects</h3>
                  <p className="text-sm text-muted-foreground">Name, save and load your projects</p>
                </div>
                <ChevronDown
                  className={`h-5 w-5 transition-transform ${
                    projectsExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {projectsExpanded && (
                <div className="p-4 border-t space-y-4">
                  <div className="space-y-2">
                    <Label>Project Name</Label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={projectName}
                        onChange={(e) => onProjectNameChange(e.target.value)}
                        placeholder="My parts organizer"
                        className="flex-1 min-w-0 px-3 py-2 text-sm rounded-md border bg-background"
                      />
                      <Button
                        onClick={() => onSaveProject(projectName.trim())}
                        disabled={!projectName.trim()}
                      >
                        <Save className="mr-2 h-4 w-4" />
                        Save
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Saves the current settings under this name and prefixes exported STL filenames. Saving with an existing name overwrites that project.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Saved Projects</Label>
                    {savedProjects.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No saved projects yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {savedProjects.map((p) => (
                          <div key={p.name} className="flex items-center gap-2 border rounded-md p-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{p.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {p.params.width} x {p.params.depth} x {p.params.height} mm
                                {' · '}{new Date(p.savedAt).toLocaleDateString()}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => onLoadProject(p.name)}
                            >
                              Load
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Delete project"
                              onClick={() => onDeleteProject(p.name)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Share */}
            <div className="border rounded-lg overflow-hidden">
              <button
                className="w-full p-4 text-left flex justify-between items-center hover:bg-muted/50 transition-colors"
                onClick={() => setShareExpanded(!shareExpanded)}
              >
                <div>
                  <h3 className="text-lg font-semibold">Share</h3>
                  <p className="text-sm text-muted-foreground">Export or import projects as JSON files</p>
                </div>
                <ChevronDown
                  className={`h-5 w-5 transition-transform ${
                    shareExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {shareExpanded && (
                <div className="p-4 border-t space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Export the current settings as a JSON file that anyone can import to recreate this exact project.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      variant="outline"
                      onClick={() => onExportJson(projectName.trim() || 'box-project')}
                    >
                      <FileDown className="mr-2 h-4 w-4" />
                      Export JSON
                    </Button>
                    <Button
                      className="flex-1"
                      variant="outline"
                      onClick={() => importInputRef.current?.click()}
                    >
                      <FileUp className="mr-2 h-4 w-4" />
                      Import JSON
                    </Button>
                    <input
                      ref={importInputRef}
                      type="file"
                      accept=".json,application/json"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) onImportJson(file)
                        e.target.value = ''
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Reset */}
      <div className="flex gap-2 pt-4 border-t">
        <Button className="flex-1" variant="ghost" onClick={onReset}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset to Defaults
        </Button>
      </div>
    </div>
  )
}
