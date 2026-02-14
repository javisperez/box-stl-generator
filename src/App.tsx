import { useState, useEffect } from 'react'
import { BoxViewer } from './components/BoxViewer'
import { ControlPanel } from './components/ControlPanel'
import { generateBox, generateLid, jscadToThreeGeometry, BoxParams } from './utils/boxGenerator'
import { textToJscadGeometry } from './utils/textGenerator'
import { exportJscadToSTL } from './utils/stlExporter'
import * as THREE from 'three'

const STORAGE_KEY = '3d-box-generator-project'

const DEFAULTS: BoxParams = {
  width: 80,
  depth: 60,
  height: 40,
  wallThickness: 2,
  includeLid: false,
  lidHeight: 5,
  lidTolerance: 0.3,
  divisionsX: [],
  divisionsZ: [],
  lidText: '',
  lidTextDepth: 0.8,
  lidTextSize: 16,
  lidTextStyle: 'engraved' as const,
}

function loadSavedParams(): BoxParams {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      return { ...DEFAULTS, ...parsed }
    }
  } catch {}
  return DEFAULTS
}

function App() {
  const [params, setParams] = useState<BoxParams>(loadSavedParams)

  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null)
  const [lidGeometry, setLidGeometry] = useState<THREE.BufferGeometry | null>(null)
  const [boxJscad, setBoxJscad] = useState<any>(null)
  const [lidJscad, setLidJscad] = useState<any>(null)

  useEffect(() => {
    try {
      const jscadGeom = generateBox(params)
      setBoxJscad(jscadGeom)
      setGeometry(jscadToThreeGeometry(jscadGeom))

      if (params.includeLid) {
        const textGeom = params.lidText.trim()
          ? textToJscadGeometry(params.lidText, params.width, params.depth, params.lidTextSize, params.lidTextDepth)
          : undefined
        const lidJscadGeom = generateLid(params, textGeom ?? undefined)
        setLidJscad(lidJscadGeom)
        setLidGeometry(jscadToThreeGeometry(lidJscadGeom))
      } else {
        setLidJscad(null)
        setLidGeometry(null)
      }
    } catch (error) {
      console.error('Error generating box:', error)
    }
  }, [params])

  const handleExport = () => {
    if (boxJscad) {
      const filename = `box_${params.width}x${params.depth}x${params.height}.stl`
      exportJscadToSTL(boxJscad, filename)
    }
  }

  const handleExportLid = () => {
    if (lidJscad) {
      const filename = `lid_${params.width}x${params.depth}x${params.height}.stl`
      exportJscadToSTL(lidJscad, filename)
    }
  }

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(params))
  }

  const handleReset = () => {
    localStorage.removeItem(STORAGE_KEY)
    setParams(DEFAULTS)
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        <header className="mb-6">
          <h1 className="text-4xl font-bold mb-2">3D Box Generator</h1>
          <p className="text-muted-foreground">
            Create custom parametric boxes for 3D printing
          </p>
        </header>

        <div className="grid lg:grid-cols-[1fr_400px] gap-6">
          <div className="h-150">
            <BoxViewer
              geometry={geometry}
              lidGeometry={lidGeometry}
              boxHeight={params.height}
              boxWidth={params.width}
              wallThickness={params.wallThickness}
            />
          </div>

          <div>
            <ControlPanel
              params={params}
              onParamsChange={setParams}
              onExport={handleExport}
              onExportLid={handleExportLid}
              onSave={handleSave}
              onReset={handleReset}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
