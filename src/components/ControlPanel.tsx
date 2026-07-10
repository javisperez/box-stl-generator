import { useRef, useState } from 'react'
import { Label } from './ui/label'
import { Slider } from './ui/slider'
import { Button } from './ui/button'
import { Download, Save, RotateCcw, ChevronDown, Trash2, FileDown, FileUp } from 'lucide-react'
import { BoxParams, sleeveOuterDims } from '@/utils/boxGenerator'
import { SavedProject } from '@/utils/projectStorage'

interface ControlPanelProps {
  params: BoxParams
  onParamsChange: (params: BoxParams) => void
  onExport: () => void
  onExportLid: () => void
  onExportPin: () => void
  onReset: () => void
  savedProjects: SavedProject[]
  onSaveProject: (name: string) => void
  onLoadProject: (name: string) => void
  onDeleteProject: (name: string) => void
  onExportJson: (name: string) => void
  onImportJson: (file: File) => void
}

type TabType = 'generator' | 'box' | 'lid' | 'export' | 'projects'

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
  params, onParamsChange, onExport, onExportLid, onExportPin, onReset,
  savedProjects, onSaveProject, onLoadProject, onDeleteProject, onExportJson, onImportJson,
}: ControlPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('generator')
  const [projectName, setProjectName] = useState('')
  const importInputRef = useRef<HTMLInputElement>(null)
  const [volume, setVolume] = useState(1000) // cubic mm
  const [printerBedX, setPrinterBedX] = useState(220) // mm
  const [printerBedY, setPrinterBedY] = useState(220) // mm
  const [compartmentCount, setCompartmentCount] = useState(4)
  const [itemWidth, setItemWidth] = useState(50) // mm
  const [itemDepth, setItemDepth] = useState(30) // mm
  const [itemHeight, setItemHeight] = useState(10) // mm

  // Collapsible section state - all collapsed by default
  const [volumeExpanded, setVolumeExpanded] = useState(false)
  const [compartmentExpanded, setCompartmentExpanded] = useState(false)
  const [printerExpanded, setPrinterExpanded] = useState(false)
  const [divisionExpanded, setDivisionExpanded] = useState(false)

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

  const generateFromPrinterBed = () => {
    // Use 80% of printer bed to leave margin for supports/brim
    const maxWidth = Math.round(printerBedX * 0.8)
    const maxDepth = Math.round(printerBedY * 0.8)
    const height = Math.round(Math.min(maxWidth, maxDepth) * 0.5) // reasonable height based on footprint

    const newParams = {
      ...params,
      width: maxWidth,
      depth: maxDepth,
      height,
    }
    onParamsChange(newParams)
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

  return (
    <div className="bg-card p-6 rounded-lg space-y-6 border">
      <h2 className="text-2xl font-bold">Box Parameters</h2>

      {/* Tabs */}
      <div className="flex border-b">
        {([
          ['generator', 'Generator'],
          ['box', 'Box'],
          ['lid', 'Lid'],
          ['export', 'Export'],
          ['projects', 'Projects'],
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

            {/* Printer Bed Optimizer */}
            <div className="border rounded-lg overflow-hidden">
              <button
                className="w-full p-4 text-left flex justify-between items-center hover:bg-muted/50 transition-colors"
                onClick={() => setPrinterExpanded(!printerExpanded)}
              >
                <div>
                  <h3 className="text-lg font-semibold">Printer Bed Optimizer</h3>
                  <p className="text-sm text-muted-foreground">Maximize dimensions for your printer</p>
                </div>
                <ChevronDown
                  className={`h-5 w-5 transition-transform ${
                    printerExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {printerExpanded && (
                <div className="p-4 border-t space-y-4">
                  <div className="space-y-2">
                    <Label>Printer Preset</Label>
                    <select
                      className="w-full px-3 py-2 text-sm rounded-md border bg-background"
                      value={PRINTER_PRESETS.findIndex(p => p.bedX === printerBedX && p.bedY === printerBedY)}
                      onChange={(e) => {
                        const preset = PRINTER_PRESETS[Number(e.target.value)]
                        if (preset && preset.bedX > 0) {
                          setPrinterBedX(preset.bedX)
                          setPrinterBedY(preset.bedY)
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
                      <Label>Bed Width (mm)</Label>
                      <input
                        type="number"
                        value={printerBedX}
                        onChange={(e) => setPrinterBedX(Number(e.target.value))}
                        className="w-full px-3 py-2 text-sm rounded-md border bg-background"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Bed Depth (mm)</Label>
                      <input
                        type="number"
                        value={printerBedY}
                        onChange={(e) => setPrinterBedY(Number(e.target.value))}
                        className="w-full px-3 py-2 text-sm rounded-md border bg-background"
                      />
                    </div>
                  </div>

                  <Button onClick={generateFromPrinterBed} className="w-full">
                    Optimize for Printer
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
                step={1}
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
                step={1}
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
                step={1}
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
                    {params.lidStyle === 'sleeve'
                      ? 'An open-front cover the box slides in and out of, like a matchbox drawer.'
                      : 'A cap with an inner lip that sits on top of the box.'}
                  </p>
                </div>

                {params.lidStyle === 'sleeve' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label>Fit Tolerance (mm)</Label>
                        <span className="text-sm text-muted-foreground">{params.sleeveTolerance}</span>
                      </div>
                      <Slider
                        min={0.1}
                        max={1}
                        step={0.05}
                        value={params.sleeveTolerance}
                        onValueChange={(value) => updateParam('sleeveTolerance', value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Gap between the box and the sleeve interior — lower means a tighter fit. Increase it if the box is hard to slide.
                      </p>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={params.sleeveCutout}
                        onChange={(e) => updateParam('sleeveCutout', e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <span className="text-sm">Finger cutout at the opening</span>
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Adds semicircular notches to the top and bottom walls at the opening so you can pinch the box to slide it out — helpful for heavy contents. Print the sleeve standing on its closed back for a clean opening.
                    </p>
                  </div>
                )}

                {params.lidStyle === 'lid' && (<>
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

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label>Tolerance (mm)</Label>
                    <span className="text-sm text-muted-foreground">{params.lidTolerance}</span>
                  </div>
                  <Slider
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={params.lidTolerance}
                    onValueChange={(value) => updateParam('lidTolerance', value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Gap between the lid's lip and the box walls — lower means a tighter fit. Increase it if the lid is hard to put on or take off.
                  </p>
                </div>

                <div className="pt-3 border-t space-y-4">
                  <h4 className="text-sm font-semibold">Hinge</h4>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={params.includeHinge}
                      onChange={(e) => updateParam('includeHinge', e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span className="text-sm">Add barrel hinges</span>
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
                          <Label>Pin hole diameter (mm)</Label>
                          <span className="text-sm text-muted-foreground">{params.hingePinDiameter}</span>
                        </div>
                        <Slider
                          min={1.5}
                          max={5}
                          step={0.5}
                          value={params.hingePinDiameter}
                          onValueChange={(value) => updateParam('hingePinDiameter', value)}
                        />
                      </div>

                      <p className="text-xs text-muted-foreground">
                        Hinges are on the back edge (Y+). Print the lid with the hinge side up for best results. Export the pin separately and print one copy per hinge.
                      </p>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t space-y-4">
                  <h4 className="text-sm font-semibold">Lid Text</h4>

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
                        onClick={() => updateParam('lidTextStyle', 'engraved' as any)}
                      >
                        Engraved
                      </button>
                      <button
                        className={`flex-1 px-3 py-1.5 text-sm rounded-md border ${params.lidTextStyle === 'embossed' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                        onClick={() => updateParam('lidTextStyle', 'embossed' as any)}
                      >
                        Embossed
                      </button>
                    </div>
                  </div>
                </div>
                </>)}
              </div>
            )}
          </div>
        )}

        {activeTab === 'export' && (
          <div className="space-y-4">
            {/* Box Summary */}
            <div className="border rounded-lg p-4 space-y-2">
              <h3 className="text-lg font-semibold">Box</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <span className="text-muted-foreground">Outer</span>
                <span>{params.width} x {params.depth} x {params.height} mm</span>
                <span className="text-muted-foreground">Inner</span>
                <span>{params.width - params.wallThickness * 2} x {params.depth - params.wallThickness * 2} x {params.height - params.wallThickness} mm</span>
                <span className="text-muted-foreground">Wall</span>
                <span>{params.wallThickness} mm</span>
                <span className="text-muted-foreground">Dividers</span>
                <span>{params.divisionsX.length} x {params.divisionsZ.length} z</span>
                {(params.divisionsX.length > 0 || params.divisionsZ.length > 0) && (
                  <>
                    <span className="text-muted-foreground">Divider wall</span>
                    <span>{params.divisionThickness} mm</span>
                  </>
                )}
              </div>
              <Button className="w-full mt-3" size="lg" onClick={onExport}>
                <Download className="mr-2 h-4 w-4" />
                Export Box STL
              </Button>
            </div>

            {/* Lid / Sleeve Summary */}
            <div className={`border rounded-lg p-4 space-y-2 ${!params.includeLid ? 'opacity-50' : ''}`}>
              <h3 className="text-lg font-semibold">{params.lidStyle === 'sleeve' ? 'Drawer Sleeve' : 'Lid'}</h3>
              {params.includeLid ? (
                params.lidStyle === 'sleeve' ? (() => {
                  const s = sleeveOuterDims(params)
                  return (
                    <>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        <span className="text-muted-foreground">Outer</span>
                        <span>{+s.w.toFixed(1)} x {+s.d.toFixed(1)} x {+s.h.toFixed(1)} mm</span>
                        <span className="text-muted-foreground">Fit tolerance</span>
                        <span>{params.sleeveTolerance} mm</span>
                        <span className="text-muted-foreground">Finger cutout</span>
                        <span>{params.sleeveCutout ? 'Yes' : 'No'}</span>
                      </div>
                      <Button className="w-full mt-3" size="lg" variant="outline" onClick={onExportLid}>
                        <Download className="mr-2 h-4 w-4" />
                        Export Sleeve STL
                      </Button>
                    </>
                  )
                })() : (
                <>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <span className="text-muted-foreground">Cap</span>
                    <span>{params.width} x {params.depth} x {params.wallThickness} mm</span>
                    <span className="text-muted-foreground">Lip height</span>
                    <span>{params.lidHeight} mm</span>
                    <span className="text-muted-foreground">Tolerance</span>
                    <span>{params.lidTolerance} mm</span>
                    {params.lidText.trim() && (
                      <>
                        <span className="text-muted-foreground">Text</span>
                        <span>"{params.lidText}" ({params.lidTextStyle})</span>
                      </>
                    )}
                  </div>
                  <Button className="w-full mt-3" size="lg" variant="outline" onClick={onExportLid}>
                    <Download className="mr-2 h-4 w-4" />
                    Export Lid STL
                  </Button>
                  {params.includeHinge && (
                    <Button className="w-full mt-2" size="lg" variant="outline" onClick={onExportPin}>
                      <Download className="mr-2 h-4 w-4" />
                      Export Hinge Pin STL
                    </Button>
                  )}
                </>
                )
              ) : (
                <p className="text-sm text-muted-foreground">Lid not enabled. Enable it in the Lid tab.</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'projects' && (
          <div className="space-y-6">
            {/* Save named project */}
            <div className="space-y-2">
              <Label>Project Name</Label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
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
                Saves the current settings under this name. Saving with an existing name overwrites that project.
              </p>
            </div>

            {/* Saved projects list */}
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
                        onClick={() => { onLoadProject(p.name); setProjectName(p.name) }}
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

            {/* Share via JSON file */}
            <div className="pt-3 border-t space-y-2">
              <Label>Share</Label>
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

      <div className="text-xs text-muted-foreground pt-4 border-t">
        <p>Tips:</p>
        <ul className="list-disc list-inside space-y-1 mt-2">
          <li>Adjust parameters to see live preview</li>
          <li>Wall thickness controls strength</li>
          <li>Tolerance controls the gap between lid and box for printer fit</li>
        </ul>
      </div>
    </div>
  )
}
