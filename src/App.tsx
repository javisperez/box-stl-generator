import { useState, useEffect, useMemo } from 'react'
import { BoxViewer } from './components/BoxViewer'
import { ControlPanel } from './components/ControlPanel'
import {
  generateBox, generateLid, generateSleeve, sleeveOuterDims, jscadToThreeGeometry, BoxParams,
  generateBoxHingeKnuckles, generateLidHingeKnuckles,
} from './utils/boxGenerator'
import { textToJscadGeometry } from './utils/textGenerator'
import { exportJscadToSTL, exportMultipleJscadToSTL, jscadVolumeCm3 } from './utils/stlExporter'
import { Button } from './components/ui/button'
import {
  DEFAULTS, SavedProject, loadCurrentParams, saveCurrentParams, clearCurrentParams,
  loadCurrentProjectName, saveCurrentProjectName,
  loadProjects, persistProjects, upsertProject, exportProjectFile, parseProjectImport,
  exportAllProjectsFile, consumeShareLink,
  AppSettings, loadSettings, saveSettings, slugify,
} from './utils/projectStorage'
import { Github, Download, Plus, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import * as THREE from 'three'

const PLA_DENSITY = 1.24 // g/cm³, solid

function formatGrams(volumeCm3: number): string {
  const grams = volumeCm3 * PLA_DENSITY
  return grams < 10 ? grams.toFixed(1) : String(Math.round(grams))
}

// Quick-export card shown in the floating export control
function PartCard({ title, subtitle, volumeCm3, onExport }: {
  title: string
  subtitle: string
  volumeCm3: number
  onExport: () => void
}) {
  return (
    <div className="bg-card/90 backdrop-blur border rounded-lg p-4 flex flex-col w-64 shrink-0">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        {volumeCm3 > 0 && (
          <span className="text-xs text-muted-foreground whitespace-nowrap" title="Solid volume — estimate for PLA">
            ≈ {formatGrams(volumeCm3)} g PLA
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
      <Button size="sm" variant="outline" className="mt-3" onClick={onExport}>
        <Download className="mr-2 h-4 w-4" />
        Export STL
      </Button>
    </div>
  )
}

// A share link (#p=…) opens the app with that project loaded. Consumed once
// at module load, before React mounts, so StrictMode double-rendering can't
// read an already-cleared hash.
const sharedProject = consumeShareLink()

function App() {
  const [params, setParams] = useState<BoxParams>(() => sharedProject?.params ?? loadCurrentParams())
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>(loadProjects)
  const [projectName, setProjectName] = useState<string>(() =>
    sharedProject ? sharedProject.name : loadCurrentProjectName()
  )
  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  // Viewer-only: show the lid closed on the box (or the box inside the sleeve).
  // Deliberately not part of BoxParams so it never affects exports or saved projects.
  const [previewInPlace, setPreviewInPlace] = useState(false)

  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null)
  const [lidGeometry, setLidGeometry] = useState<THREE.BufferGeometry | null>(null)
  const [hingeBoxGeometry, setHingeBoxGeometry] = useState<THREE.BufferGeometry | null>(null)
  const [hingeLidGeometry, setHingeLidGeometry] = useState<THREE.BufferGeometry | null>(null)
  const [boxJscad, setBoxJscad] = useState<any>(null)
  const [lidJscad, setLidJscad] = useState<any>(null)
  const [hingeBoxJscad, setHingeBoxJscad] = useState<any>(null)
  const [hingeLidJscad, setHingeLidJscad] = useState<any>(null)

  // Autosave working state and settings so they survive reloads
  useEffect(() => { saveCurrentParams(params) }, [params])
  useEffect(() => { saveCurrentProjectName(projectName) }, [projectName])
  useEffect(() => { saveSettings(settings) }, [settings])

  useEffect(() => {
    try {
      const jscadGeom = generateBox(params)
      setBoxJscad(jscadGeom)
      setGeometry(jscadToThreeGeometry(jscadGeom))

      if (params.includeLid && params.lidStyle === 'sleeve') {
        const s = sleeveOuterDims(params)
        const textGeom = params.lidText.trim()
          ? textToJscadGeometry(params.lidText, s.w, s.d, params.lidTextSize, params.lidTextDepth, params.lidTextRotation)
          : undefined
        const sleeveJscad = generateSleeve(params, textGeom ?? undefined)
        setLidJscad(sleeveJscad)
        setLidGeometry(jscadToThreeGeometry(sleeveJscad))
        setHingeBoxJscad(null)
        setHingeLidJscad(null)
        setHingeBoxGeometry(null)
        setHingeLidGeometry(null)
      } else if (params.includeLid) {
        const textGeom = params.lidText.trim()
          ? textToJscadGeometry(params.lidText, params.width, params.depth, params.lidTextSize, params.lidTextDepth, params.lidTextRotation)
          : undefined
        const lidJscadGeom = generateLid(params, textGeom ?? undefined)
        setLidJscad(lidJscadGeom)
        setLidGeometry(jscadToThreeGeometry(lidJscadGeom))

        if (params.includeHinge) {
          const hBox = generateBoxHingeKnuckles(params)
          const hLid = generateLidHingeKnuckles(params)
          setHingeBoxJscad(hBox)
          setHingeLidJscad(hLid)
          setHingeBoxGeometry(jscadToThreeGeometry(hBox))
          setHingeLidGeometry(jscadToThreeGeometry(hLid))
        } else {
          setHingeBoxJscad(null)
          setHingeLidJscad(null)
          setHingeBoxGeometry(null)
          setHingeLidGeometry(null)
        }
      } else {
        setLidJscad(null)
        setLidGeometry(null)
        setHingeBoxJscad(null)
        setHingeLidJscad(null)
        setHingeBoxGeometry(null)
        setHingeLidGeometry(null)
      }
    } catch (error) {
      console.error('Error generating box:', error)
    }
  }, [params])

  // STL filenames: "<project-slug>_box_120x90x55.stl" when a project is named
  const filePrefix = slugify(projectName)
  const stlName = (part: string) =>
    `${filePrefix ? filePrefix + '_' : ''}${part}_${params.width}x${params.depth}x${params.height}.stl`

  const handleExport = () => {
    if (!boxJscad) return
    if (hingeBoxJscad) {
      exportMultipleJscadToSTL([boxJscad, hingeBoxJscad], stlName('box'))
    } else {
      exportJscadToSTL(boxJscad, stlName('box'))
    }
  }

  const handleExportLid = () => {
    if (!lidJscad) return
    const part = params.lidStyle === 'sleeve' ? 'sleeve' : 'lid'
    if (hingeLidJscad) {
      exportMultipleJscadToSTL([lidJscad, hingeLidJscad], stlName(part))
    } else {
      exportJscadToSTL(lidJscad, stlName(part))
    }
  }

  const handleExportAll = () => {
    handleExport()
    if (params.includeLid) handleExportLid()
  }

  const handleReset = () => {
    clearCurrentParams()
    setParams(DEFAULTS)
    setProjectName('')
  }

  const handleSaveProject = (name: string) => {
    const next = upsertProject(savedProjects, name, params)
    setSavedProjects(next)
    persistProjects(next)
    setProjectName(name)
  }

  const handleLoadProject = (name: string) => {
    const project = savedProjects.find(p => p.name === name)
    if (project) {
      setParams({ ...project.params })
      setProjectName(project.name)
    }
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

  const handleExportAllJson = () => {
    exportAllProjectsFile(savedProjects)
  }

  const handleImportJson = async (file: File) => {
    try {
      const imported = parseProjectImport(await file.text())
      if (imported.kind === 'library') {
        // Merge into the saved library; same-named imports overwrite
        let next = savedProjects
        for (const p of imported.projects) next = upsertProject(next, p.name, p.params)
        setSavedProjects(next)
        persistProjects(next)
        alert(`Imported ${imported.projects.length} project${imported.projects.length === 1 ? '' : 's'} into your library.`)
      } else {
        setParams(imported.params)
        if (imported.name) setProjectName(imported.name)
      }
    } catch {
      alert('Could not import this file — it does not look like a valid project JSON.')
    }
  }

  // Where to place the lid/sleeve mesh in the viewer. Default: next to the box,
  // resting on the grid. With "preview in place" on: assembled onto the box.
  // Viewer transform only — exported geometry is never touched.
  const sleeve = sleeveOuterDims(params)
  const isSleeve = params.includeLid && params.lidStyle === 'sleeve'
  const wt = params.wallThickness

  let lidPosition: [number, number, number]
  let lidRotation: [number, number, number] = [0, 0, 0]
  if (previewInPlace && params.includeLid) {
    if (isSleeve) {
      // Box slid fully in: sleeve centered on the box height, shifted back so the
      // box back sits against the sleeve's inner back wall (tolerance gap at rest).
      lidPosition = [0, (wt + params.sleeveTolerance) / 2, params.height / 2]
    } else if (params.includeHinge) {
      // Hinged lid is a flat slab modeled in closed orientation: rest it on the
      // rim and the knuckle axles line up with the box sockets — no flip.
      lidPosition = [0, 0, params.height + wt]
    } else {
      // Friction lid: flip 180° about Y (the flip the text pre-mirroring assumes),
      // cap resting on the rim, lip hanging into the box.
      lidRotation = [0, Math.PI, 0]
      lidPosition = [0, 0, params.height]
    }
  } else {
    lidPosition = [
      isSleeve ? params.width / 2 + sleeve.w / 2 + 10 : params.width + 10,
      0,
      isSleeve ? sleeve.h / 2 : wt,
    ]
  }

  // Material estimates for the export control
  const boxVolume = useMemo(() => jscadVolumeCm3([boxJscad, hingeBoxJscad]), [boxJscad, hingeBoxJscad])
  const lidVolume = useMemo(() => jscadVolumeCm3([lidJscad, hingeLidJscad]), [lidJscad, hingeLidJscad])
  const totalVolume = boxVolume + lidVolume

  // Plate fit: a part fits if its footprint fits the plate in either orientation
  const fitsPlate = (w: number, d: number) =>
    (w <= settings.printerBedX && d <= settings.printerBedY) ||
    (w <= settings.printerBedY && d <= settings.printerBedX)
  const oversizedParts: string[] = []
  if (!fitsPlate(params.width, params.depth)) oversizedParts.push('box')
  if (params.includeLid) {
    if (isSleeve) {
      if (!fitsPlate(sleeve.w, sleeve.d)) oversizedParts.push('sleeve')
    } else if (!fitsPlate(params.width, params.depth)) {
      oversizedParts.push('lid')
    }
  }

  const fmt = (n: number) => +n.toFixed(1)
  const compartments = (params.divisionsX.length + 1) * (params.divisionsZ.length + 1)
  const exportExpanded = settings.exportExpanded
  const setExportExpanded = (expanded: boolean) => setSettings({ ...settings, exportExpanded: expanded })

  return (
    <div className="min-h-screen bg-background lg:h-screen lg:flex lg:overflow-hidden">
      {/* Preview — fills every pixel the sidebar doesn't use */}
      <main className="relative h-[60vh] lg:h-full lg:flex-1 lg:min-w-0">
        <div className="absolute inset-0">
          <BoxViewer
            geometry={geometry}
            lidGeometry={lidGeometry}
            hingeBoxGeometry={hingeBoxGeometry}
            hingeLidGeometry={hingeLidGeometry}
            boxHeight={params.height}
            lidPosition={lidPosition}
            lidRotation={lidRotation}
            plateWidth={settings.printerBedX}
            plateDepth={settings.printerBedY}
            plateOversized={oversizedParts.length > 0}
          />
        </div>
        <div className="absolute top-4 left-4 bg-black/60 text-white text-xs font-mono px-2.5 py-1.5 rounded-md pointer-events-none">
          {params.width} × {params.depth} × {params.height} mm
        </div>
        <div className="hidden sm:block absolute top-4 right-4 text-white/40 text-xs pointer-events-none">
          drag to rotate · scroll to zoom
        </div>
        {oversizedParts.length > 0 && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-red-600/90 text-white text-xs px-3 py-1.5 rounded-md pointer-events-none whitespace-nowrap">
            <AlertTriangle className="h-3.5 w-3.5" />
            {oversizedParts.join(' and ')} won't fit the {settings.printerBedX} × {settings.printerBedY} mm plate
          </div>
        )}

        {/* Floating export control — collapsed pill or expanded per-part cards.
            pointer-events-none on the wrapper so the empty space around the
            cards still rotates/zooms the viewport; children re-enable it. */}
        <div className="absolute inset-x-4 bottom-4 flex flex-col items-start gap-3 pointer-events-none">
          {exportExpanded && (
            <div className="flex gap-3 overflow-x-auto max-w-full pb-1 pointer-events-auto">
              <PartCard
                title="Box"
                subtitle={`${params.width} × ${params.depth} × ${params.height} mm · ${compartments} compartment${compartments === 1 ? '' : 's'}`}
                volumeCm3={boxVolume}
                onExport={handleExport}
              />
              {params.includeLid ? (
                <PartCard
                  title={isSleeve ? 'Drawer Sleeve' : 'Lid'}
                  subtitle={isSleeve
                    ? `${fmt(sleeve.w)} × ${fmt(sleeve.d)} × ${fmt(sleeve.h)} mm · ${params.sleeveTolerance} mm fit`
                    : params.includeHinge
                      ? `${params.width} × ${params.depth} mm flat cap · snap hinge`
                      : `${params.width} × ${params.depth} mm cap · ${params.lidHeight} mm lip`}
                  volumeCm3={lidVolume}
                  onExport={handleExportLid}
                />
              ) : (
                <div className="bg-card/60 backdrop-blur border border-dashed rounded-lg p-4 flex flex-col items-center justify-center gap-2 text-center w-64 shrink-0">
                  <p className="text-sm text-muted-foreground">No lid or sleeve yet</p>
                  <Button size="sm" variant="ghost" onClick={() => setParams({ ...params, includeLid: true })}>
                    <Plus className="mr-1 h-4 w-4" />
                    Add one
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center bg-card/90 backdrop-blur border rounded-lg overflow-hidden pointer-events-auto">
            <Button variant="ghost" className="rounded-none" onClick={handleExportAll}>
              <Download className="mr-2 h-4 w-4" />
              Export {params.includeLid ? 'all' : 'box'}
              {totalVolume > 0 && (
                <span className="ml-2 text-xs text-muted-foreground">≈ {formatGrams(totalVolume)} g PLA</span>
              )}
            </Button>
            <button
              className="px-2.5 self-stretch border-l text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              onClick={() => setExportExpanded(!exportExpanded)}
              title={exportExpanded ? 'Collapse part details' : 'Expand part details'}
            >
              {exportExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </main>

      {/* Control sidebar — pinned to the right edge, scrolls independently of the preview */}
      <aside className="lg:w-105 lg:shrink-0 lg:h-full flex flex-col border-t lg:border-t-0 lg:border-l bg-card">
        <header className="flex items-start justify-between gap-4 px-5 py-4 border-b">
          <div>
            <h1 className="text-xl font-bold">3D Box Generator</h1>
            <p className="text-sm text-muted-foreground">
              Parametric boxes for 3D printing
            </p>
          </div>
          <a
            href="https://github.com/javisperez/box-stl-generator"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors mt-1"
            title="View on GitHub"
          >
            <Github size={20} />
          </a>
        </header>

        <div className="flex-1 lg:overflow-y-auto">
          <ControlPanel
            params={params}
            onParamsChange={setParams}
            previewInPlace={previewInPlace}
            onPreviewInPlaceChange={setPreviewInPlace}
            settings={settings}
            onSettingsChange={setSettings}
            projectName={projectName}
            onProjectNameChange={setProjectName}
            onReset={handleReset}
            savedProjects={savedProjects}
            onSaveProject={handleSaveProject}
            onLoadProject={handleLoadProject}
            onDeleteProject={handleDeleteProject}
            onExportJson={handleExportJson}
            onExportAllJson={handleExportAllJson}
            onImportJson={handleImportJson}
          />
        </div>

        <footer className="px-5 py-3 border-t text-center text-xs text-muted-foreground">
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
      </aside>
    </div>
  )
}

export default App
