import { useState, useEffect } from 'react'
import { BoxViewer } from './components/BoxViewer'
import { ControlPanel } from './components/ControlPanel'
import {
  generateBox, generateLid, generateSleeve, sleeveOuterDims, jscadToThreeGeometry, BoxParams,
  generateBoxHingeKnuckles, generateLidHingeKnuckles, generateHingePins,
} from './utils/boxGenerator'
import { textToJscadGeometry } from './utils/textGenerator'
import { exportJscadToSTL, exportMultipleJscadToSTL } from './utils/stlExporter'
import {
  DEFAULTS, SavedProject, loadCurrentParams, saveCurrentParams, clearCurrentParams,
  loadProjects, persistProjects, upsertProject, exportProjectFile, parseProjectFile,
} from './utils/projectStorage'
import { Github } from 'lucide-react'
import * as THREE from 'three'

function App() {
  const [params, setParams] = useState<BoxParams>(loadCurrentParams)
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>(loadProjects)

  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null)
  const [lidGeometry, setLidGeometry] = useState<THREE.BufferGeometry | null>(null)
  const [hingeBoxGeometry, setHingeBoxGeometry] = useState<THREE.BufferGeometry | null>(null)
  const [hingeLidGeometry, setHingeLidGeometry] = useState<THREE.BufferGeometry | null>(null)
  const [boxJscad, setBoxJscad] = useState<any>(null)
  const [lidJscad, setLidJscad] = useState<any>(null)
  const [hingeBoxJscad, setHingeBoxJscad] = useState<any>(null)
  const [hingeLidJscad, setHingeLidJscad] = useState<any>(null)
  const [hingePinJscad, setHingePinJscad] = useState<any>(null)

  // Autosave the working state so it survives reloads
  useEffect(() => {
    saveCurrentParams(params)
  }, [params])

  useEffect(() => {
    try {
      const jscadGeom = generateBox(params)
      setBoxJscad(jscadGeom)
      setGeometry(jscadToThreeGeometry(jscadGeom))

      if (params.includeLid && params.lidStyle === 'sleeve') {
        const sleeveJscad = generateSleeve(params)
        setLidJscad(sleeveJscad)
        setLidGeometry(jscadToThreeGeometry(sleeveJscad))
        setHingeBoxJscad(null)
        setHingeLidJscad(null)
        setHingePinJscad(null)
        setHingeBoxGeometry(null)
        setHingeLidGeometry(null)
      } else if (params.includeLid) {
        const textGeom = params.lidText.trim()
          ? textToJscadGeometry(params.lidText, params.width, params.depth, params.lidTextSize, params.lidTextDepth)
          : undefined
        const lidJscadGeom = generateLid(params, textGeom ?? undefined)
        setLidJscad(lidJscadGeom)
        setLidGeometry(jscadToThreeGeometry(lidJscadGeom))

        if (params.includeHinge) {
          const hBox = generateBoxHingeKnuckles(params)
          const hLid = generateLidHingeKnuckles(params)
          const hPin = generateHingePins(params)
          setHingeBoxJscad(hBox)
          setHingeLidJscad(hLid)
          setHingePinJscad(hPin)
          setHingeBoxGeometry(jscadToThreeGeometry(hBox))
          setHingeLidGeometry(jscadToThreeGeometry(hLid))
        } else {
          setHingeBoxJscad(null)
          setHingeLidJscad(null)
          setHingePinJscad(null)
          setHingeBoxGeometry(null)
          setHingeLidGeometry(null)
        }
      } else {
        setLidJscad(null)
        setLidGeometry(null)
        setHingeBoxJscad(null)
        setHingeLidJscad(null)
        setHingePinJscad(null)
        setHingeBoxGeometry(null)
        setHingeLidGeometry(null)
      }
    } catch (error) {
      console.error('Error generating box:', error)
    }
  }, [params])

  const handleExport = () => {
    if (!boxJscad) return
    const filename = `box_${params.width}x${params.depth}x${params.height}.stl`
    if (hingeBoxJscad) {
      exportMultipleJscadToSTL([boxJscad, hingeBoxJscad], filename)
    } else {
      exportJscadToSTL(boxJscad, filename)
    }
  }

  const handleExportLid = () => {
    if (!lidJscad) return
    const prefix = params.lidStyle === 'sleeve' ? 'sleeve' : 'lid'
    const filename = `${prefix}_${params.width}x${params.depth}x${params.height}.stl`
    if (hingeLidJscad) {
      exportMultipleJscadToSTL([lidJscad, hingeLidJscad], filename)
    } else {
      exportJscadToSTL(lidJscad, filename)
    }
  }

  const handleExportPin = () => {
    if (hingePinJscad) {
      const filename = `hinge_pin_${params.width}x${params.depth}x${params.height}.stl`
      exportJscadToSTL(hingePinJscad, filename)
    }
  }

  const handleReset = () => {
    clearCurrentParams()
    setParams(DEFAULTS)
  }

  const handleSaveProject = (name: string) => {
    const next = upsertProject(savedProjects, name, params)
    setSavedProjects(next)
    persistProjects(next)
  }

  const handleLoadProject = (name: string) => {
    const project = savedProjects.find(p => p.name === name)
    if (project) setParams({ ...project.params })
  }

  const handleDeleteProject = (name: string) => {
    if (!confirm(`Delete project "${name}"?`)) return
    const next = savedProjects.filter(p => p.name !== name)
    setSavedProjects(next)
    persistProjects(next)
  }

  const handleExportJson = (name: string) => {
    exportProjectFile(name, params)
  }

  const handleImportJson = async (file: File) => {
    try {
      const { params: imported } = parseProjectFile(await file.text())
      setParams(imported)
    } catch {
      alert('Could not import this file — it does not look like a valid project JSON.')
    }
  }

  // Where to place the lid/sleeve mesh in the viewer (next to the box, resting on the grid)
  const sleeve = sleeveOuterDims(params)
  const isSleeve = params.includeLid && params.lidStyle === 'sleeve'
  const lidOffsetX = isSleeve ? params.width / 2 + sleeve.w / 2 + 10 : params.width + 10
  const lidOffsetZ = isSleeve ? sleeve.h / 2 : params.wallThickness

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        <header className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">3D Box Generator</h1>
            <p className="text-muted-foreground">
              Create custom parametric boxes for 3D printing
            </p>
          </div>
          <a
            href="https://github.com/javisperez/box-stl-generator"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors mt-2"
            title="View on GitHub"
          >
            <Github size={24} />
          </a>
        </header>

        <div className="grid lg:grid-cols-[1fr_400px] gap-6">
          <div className="h-150">
            <BoxViewer
              geometry={geometry}
              lidGeometry={lidGeometry}
              hingeBoxGeometry={hingeBoxGeometry}
              hingeLidGeometry={hingeLidGeometry}
              boxHeight={params.height}
              lidOffsetX={lidOffsetX}
              lidOffsetZ={lidOffsetZ}
            />
          </div>

          <div>
            <ControlPanel
              params={params}
              onParamsChange={setParams}
              onExport={handleExport}
              onExportLid={handleExportLid}
              onExportPin={handleExportPin}
              onReset={handleReset}
              savedProjects={savedProjects}
              onSaveProject={handleSaveProject}
              onLoadProject={handleLoadProject}
              onDeleteProject={handleDeleteProject}
              onExportJson={handleExportJson}
              onImportJson={handleImportJson}
            />
          </div>
        </div>

        <footer className="mt-8 py-4 border-t border-border text-center text-sm text-muted-foreground">
          Made by{' '}
          <a
            href="https://github.com/javisperez"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground transition-colors"
          >
            Javis Perez
          </a>
          {' '}&amp;{' '}
          <a
            href="https://claude.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground transition-colors"
          >
            Claude
          </a>
          {' '}&middot;{' '}
          <a
            href="https://github.com/javisperez/box-stl-generator"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground transition-colors"
          >
            Source on GitHub
          </a>
        </footer>
      </div>
    </div>
  )
}

export default App
