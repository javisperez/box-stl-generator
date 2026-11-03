import { useState, useEffect, useMemo } from 'react'
import { BoxViewer } from './components/BoxViewer'
import { ControlPanel } from './components/ControlPanel'
import { ProjectsView } from './components/ProjectsView'
import { arrangeOnPlate } from './utils/plateLayout'
import { Segmented } from './components/ui/segmented'
import {
  generateBox, generateLid, generateSleeve, sleeveOuterDims, jscadToThreeGeometry, BoxParams,
  generateBoxHingeKnuckles, generateLidHingeKnuckles,
} from './utils/boxGenerator'
import { textToJscadGeometry } from './utils/textGenerator'
import { exportJscadToSTL, exportMultipleJscadToSTL, jscadVolumeCm3 } from './utils/stlExporter'
import { TopBar } from './components/TopBar'
import {
  DEFAULTS, SavedProject, loadCurrentParams, saveCurrentParams, clearCurrentParams,
  loadCurrentProjectName, saveCurrentProjectName,
  loadProjects, persistProjects, upsertProject, exportProjectFile, parseProjectImport,
  exportAllProjectsFile, consumeShareLink,
  AppSettings, loadSettings, saveSettings, slugify,
} from './utils/projectStorage'
import { AlertTriangle } from 'lucide-react'
import { formatGrams } from './utils/filament'
import * as THREE from 'three'

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
  const [view, setView] = useState<'workbench' | 'projects'>('workbench')

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

  const handleDuplicateProject = (name: string) => {
    const source = savedProjects.find(p => p.name === name)
    if (!source) return
    const taken = new Set(savedProjects.map(p => p.name.toLowerCase()))
    let copyName = `${name} copy`
    for (let n = 2; taken.has(copyName.toLowerCase()); n++) copyName = `${name} copy ${n}`
    const next = upsertProject(savedProjects, copyName, source.params)
    setSavedProjects(next)
    persistProjects(next)
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

  const inPlace = previewInPlace && params.includeLid

  // Plate arrangement: the box and its lid/sleeve side by side, centred on the plate and
  // turned a quarter turn only when that is what lets them fit. Always computed so the
  // Print tab can say whether the parts fit together; only applied when auto-arrange is on.
  const plateX = Math.max(settings.printerBedX, 1)
  const plateY = Math.max(settings.printerBedY, 1)
  const lidFootprint = isSleeve ? { w: sleeve.w, d: sleeve.d } : { w: params.width, d: params.depth }
  const arrangement = arrangeOnPlate(
    params.includeLid ? [{ w: params.width, d: params.depth }, lidFootprint] : [{ w: params.width, d: params.depth }],
    plateX, plateY,
  )
  const arranged = settings.autoArrange && !inPlace

  const boxPlacement = arranged ? arrangement.placements[0] : { x: 0, y: 0, rotated: false }

  let lidPosition: [number, number, number]
  let lidRotation: [number, number, number] = [0, 0, 0]
  if (inPlace) {
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
  } else if (arranged && params.includeLid) {
    const placed = arrangement.placements[1]
    lidPosition = [placed.x, placed.y, isSleeve ? sleeve.h / 2 : wt]
    lidRotation = [0, 0, placed.rotated ? Math.PI / 2 : 0]
  } else {
    lidPosition = [
      isSleeve ? params.width / 2 + sleeve.w / 2 + 10 : params.width + 10,
      0,
      isSleeve ? sleeve.h / 2 : wt,
    ]
  }
  // Lid shown on its own beside the box (as opposed to assembled onto it)
  const lidBeside = params.includeLid && !inPlace

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

  return (
    <div className="min-h-screen bg-background lg:h-screen lg:flex lg:flex-col lg:overflow-hidden">
      <TopBar
        params={params}
        projectName={projectName}
        onProjectNameChange={setProjectName}
        savedProjects={savedProjects}
        onSaveProject={handleSaveProject}
        onLoadProject={(name) => { handleLoadProject(name); setView('workbench') }}
        onDeleteProject={handleDeleteProject}
        onNewProject={() => { handleReset(); setView('workbench') }}
        onExportJson={handleExportJson}
        onExportAllJson={handleExportAllJson}
        onImportJson={handleImportJson}
        onExport={handleExportAll}
        exportLabel={params.includeLid ? 'Export all' : 'Export STL'}
        onOpenProjects={() => setView('projects')}
        projectsOpen={view === 'projects'}
      />

      {view === 'projects' && (
        <ProjectsView
          params={params}
          projectName={projectName}
          onProjectNameChange={setProjectName}
          savedProjects={savedProjects}
          onSaveProject={handleSaveProject}
          onLoadProject={(name) => { handleLoadProject(name); setView('workbench') }}
          onDuplicateProject={handleDuplicateProject}
          onDeleteProject={handleDeleteProject}
          onNewProject={() => { handleReset(); setView('workbench') }}
          onExportAllJson={handleExportAllJson}
          onImportJson={handleImportJson}
          onBack={() => setView('workbench')}
        />
      )}

      <div className={view === 'projects' ? 'hidden' : 'lg:flex lg:flex-1 lg:min-h-0'}>
        {/* Preview — fills every pixel the sidebar doesn't use */}
        <main className="relative h-[60vh] lg:h-full lg:flex-1 lg:min-w-0">
          <div className="absolute inset-0">
            <BoxViewer
              geometry={geometry}
              lidGeometry={lidGeometry}
              hingeBoxGeometry={hingeBoxGeometry}
              hingeLidGeometry={hingeLidGeometry}
              boxWidth={params.width}
              boxDepth={params.depth}
              boxHeight={params.height}
              lidPosition={lidPosition}
              lidRotation={lidRotation}
              lidBeside={lidBeside}
              boxPlacement={boxPlacement}
              plateWidth={settings.printerBedX}
              plateDepth={settings.printerBedY}
              plateOversized={oversizedParts.length > 0}
              viewMode={settings.viewMode}
            />
          </div>
          <div className="absolute top-4 left-4 flex items-center gap-3">
            <Segmented
              aria-label="View"
              className="w-56 bg-card/90 backdrop-blur"
              value={settings.viewMode}
              onChange={(viewMode) => setSettings({ ...settings, viewMode })}
              options={[
                { value: 'perspective', label: 'Perspective' },
                { value: 'isometric', label: 'Isometric' },
              ]}
            />
            {settings.viewMode === 'perspective' && (
              <span className="bg-black/60 text-white text-xs font-mono px-2.5 py-1.5 rounded-md pointer-events-none">
                {fmt(params.width)} × {fmt(params.depth)} × {fmt(params.height)} mm
              </span>
            )}
          </div>
          <div className="hidden sm:block absolute top-4 right-4 text-white/40 text-xs pointer-events-none">
            {settings.viewMode === 'isometric' ? 'drag to pan · scroll to zoom' : 'drag to rotate · scroll to zoom'}
          </div>
          {oversizedParts.length > 0 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-red-600/90 text-white text-xs px-3 py-1.5 rounded-md pointer-events-none whitespace-nowrap">
              <AlertTriangle className="h-3.5 w-3.5" />
              {oversizedParts.join(' and ')} won't fit the {settings.printerBedX} × {settings.printerBedY} mm plate
            </div>
          )}

          {/* Quiet stats pill — per-part export lives on the Print tab */}
          {totalVolume > 0 && (
            <div
              className="absolute bottom-4 left-4 flex items-center gap-2 bg-card/90 backdrop-blur border rounded-full px-3 py-1.5 font-mono text-xs text-muted-foreground pointer-events-none"
              title="Solid volume — real prints use less with infill"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
              <span className="text-foreground">≈ {formatGrams(totalVolume, settings.filament)} g {settings.filament}</span>
              <span>·</span>
              <span>{compartments} compartment{compartments === 1 ? '' : 's'}</span>
            </div>
          )}
        </main>

        {/* Control sidebar — pinned to the right edge, scrolls independently of the preview */}
        <aside className="lg:w-[22rem] lg:shrink-0 lg:h-full flex flex-col border-t lg:border-t-0 lg:border-l bg-card">
          <div className="flex-1 lg:overflow-y-auto">
            <ControlPanel
              params={params}
              onParamsChange={setParams}
              previewInPlace={previewInPlace}
              onPreviewInPlaceChange={setPreviewInPlace}
              settings={settings}
              onSettingsChange={setSettings}
              boxVolume={boxVolume}
              lidVolume={lidVolume}
              onExportBox={handleExport}
              onExportLid={handleExportLid}
              partsFitTogether={arrangement.fitsTogether}
            />
          </div>

          <footer className="shrink-0 border-t px-4 py-2.5 text-[11px] leading-relaxed text-center text-muted-foreground">
            Made by{' '}
            <a href="https://github.com/javisperez" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground whitespace-nowrap">Javis Perez</a>
            {' '}&amp;{' '}
            <a href="https://claude.ai" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground whitespace-nowrap">Claude</a>
            {' · '}
            <a href="https://github.com/javisperez/box-stl-generator" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground whitespace-nowrap">Source on GitHub</a>
            {' · '}
            <a href="https://github.com/javisperez/box-stl-generator/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground whitespace-nowrap">Apache 2.0</a>
            <div className="mt-2">
              <a href="https://ko-fi.com/G0U727FZNX" target="_blank" rel="noopener noreferrer">
                <img
                  height={36}
                  style={{ border: 0, height: 36 }}
                  src="https://storage.ko-fi.com/cdn/kofi6.png?v=6"
                  alt="Buy Me a Coffee at ko-fi.com"
                  className="inline-block"
                />
              </a>
            </div>
          </footer>
        </aside>
      </div>
    </div>
  )
}

export default App
