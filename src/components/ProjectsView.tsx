import { useMemo, useRef, useState } from 'react'
import { ArrowLeft, Archive, Copy, FileUp, Plus, Save, Search, Trash2 } from 'lucide-react'
import { Button } from './ui/button'
import { Segmented } from './ui/segmented'
import { BoxGlyph } from './BoxGlyph'
import { BoxParams } from '@/utils/boxGenerator'
import { SavedProject } from '@/utils/projectStorage'
import { CLOSURE_LABELS, closureOf } from '@/utils/boxLayout'

interface ProjectsViewProps {
  params: BoxParams
  projectName: string
  onProjectNameChange: (name: string) => void
  savedProjects: SavedProject[]
  onSaveProject: (name: string) => void
  onLoadProject: (name: string) => void
  onDuplicateProject: (name: string) => void
  onDeleteProject: (name: string) => void
  onNewProject: () => void
  onExportAllJson: () => void
  onImportJson: (file: File) => void
  onBack: () => void
}

type Sort = 'recent' | 'name'

const fmt = (n: number) => String(Math.round(n * 10) / 10)

function describe(p: BoxParams): string {
  const compartments = (p.divisionsX.length + 1) * (p.divisionsZ.length + 1)
  return `${compartments} compartment${compartments === 1 ? '' : 's'} · ${CLOSURE_LABELS[closureOf(p)]}`
}

function timeAgo(iso: string): string {
  const diffSec = (new Date(iso).getTime() - Date.now()) / 1000
  if (Number.isNaN(diffSec)) return ''
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60],
  ]
  for (const [unit, secs] of units) {
    if (Math.abs(diffSec) >= secs) return rtf.format(Math.round(diffSec / secs), unit)
  }
  return 'just now'
}

export function ProjectsView({
  params, projectName, onProjectNameChange, savedProjects, onSaveProject, onLoadProject,
  onDuplicateProject, onDeleteProject, onNewProject, onExportAllJson, onImportJson, onBack,
}: ProjectsViewProps) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('recent')
  const importInputRef = useRef<HTMLInputElement>(null)

  const trimmed = projectName.trim()
  const active = savedProjects.find(p => p.name.toLowerCase() === trimmed.toLowerCase())
  // The editor has changes the saved copy doesn't (or was never saved at all)
  const dirty = !active || JSON.stringify(active.params) !== JSON.stringify(params)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = savedProjects.filter(p =>
      !q || p.name.toLowerCase().includes(q) || `${p.params.width}x${p.params.depth}x${p.params.height}`.includes(q.replace(/[×\s]/g, 'x'))
    )
    return [...list].sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) : b.savedAt.localeCompare(a.savedAt)
    )
  }, [savedProjects, query, sort])

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Workbench
          </Button>
          <h2 className="text-lg font-semibold">Projects</h2>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => importInputRef.current?.click()}>
            <FileUp className="mr-2 h-4 w-4" />
            Import JSON
          </Button>
          <Button variant="ghost" size="sm" disabled={savedProjects.length === 0} onClick={onExportAllJson}>
            <Archive className="mr-2 h-4 w-4" />
            Export all
          </Button>
          <Button variant="secondary" size="sm" onClick={onNewProject}>
            <Plus className="mr-2 h-4 w-4" />
            New project
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

        <div className="flex flex-wrap items-center gap-3">
          <label className="relative flex-1 min-w-[12rem] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or size, e.g. 120"
              aria-label="Search projects"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border bg-card focus:outline-none focus:border-ring"
            />
          </label>
          <Segmented
            aria-label="Sort projects"
            className="w-44"
            value={sort}
            onChange={setSort}
            options={[{ value: 'recent', label: 'Recent' }, { value: 'name', label: 'Name' }]}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {/* Current editor state, when it isn't saved (or differs from the saved copy) */}
          {dirty && (
            <div className="rounded-xl border border-dashed p-4 space-y-3 bg-card/50">
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 shrink-0 rounded-lg bg-secondary p-1.5">
                  <BoxGlyph params={params} className="h-full w-full" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{active ? 'Unsaved changes' : 'Current box'}</p>
                  <p className="font-mono text-xs text-muted-foreground">{fmt(params.width)}×{fmt(params.depth)}×{fmt(params.height)} mm</p>
                  <p className="text-xs text-muted-foreground truncate">{describe(params)}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => onProjectNameChange(e.target.value)}
                  placeholder="Name this project"
                  aria-label="Project name"
                  className="flex-1 min-w-0 px-2.5 py-1.5 text-sm rounded-md border bg-background focus:outline-none focus:border-ring"
                />
                <Button size="sm" variant="secondary" disabled={!trimmed} onClick={() => onSaveProject(trimmed)}>
                  <Save className="mr-1.5 h-4 w-4" />
                  {active ? 'Update' : 'Save'}
                </Button>
              </div>
            </div>
          )}

          {visible.map((p) => {
            const isActive = p === active
            return (
              <div
                key={p.name}
                className={`rounded-xl border p-4 space-y-3 bg-card ${isActive ? 'border-primary/60' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <div className="h-14 w-14 shrink-0 rounded-lg bg-secondary p-1.5">
                    <BoxGlyph params={p.params} className="h-full w-full" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate" title={p.name}>{p.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{fmt(p.params.width)}×{fmt(p.params.depth)}×{fmt(p.params.height)} mm</p>
                    <p className="text-xs text-muted-foreground truncate">{describe(p.params)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {isActive ? <span className="text-primary">In the editor</span> : `Saved ${timeAgo(p.savedAt)}`}
                  </span>
                  <div className="flex-1" />
                  <button
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
                    title="Duplicate"
                    aria-label={`Duplicate ${p.name}`}
                    onClick={() => onDuplicateProject(p.name)}
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-accent"
                    title="Delete"
                    aria-label={`Delete ${p.name}`}
                    onClick={() => onDeleteProject(p.name)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <Button size="sm" variant="secondary" onClick={() => onLoadProject(p.name)}>
                    {isActive ? 'Back to editor' : 'Open'}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>

        {savedProjects.length === 0 && (
          <div className="rounded-xl border border-dashed p-10 text-center">
            <p className="font-medium">Save your first project</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Name the current box above to keep it here. Projects live in this browser; export them to back up or move devices.
            </p>
          </div>
        )}
        {savedProjects.length > 0 && visible.length === 0 && (
          <p className="text-sm text-muted-foreground">No projects match “{query}”.</p>
        )}
      </div>
    </div>
  )
}
