import { useEffect, useRef, useState } from 'react'
import {
  Archive, Check, ChevronDown, Download, FileDown, FileUp, Folder, Link2,
  MoreHorizontal, Plus, Save, Trash2,
} from 'lucide-react'
import { Button } from './ui/button'
import { BoxParams } from '@/utils/boxGenerator'
import { SavedProject, buildShareLink } from '@/utils/projectStorage'

interface TopBarProps {
  params: BoxParams
  projectName: string
  onProjectNameChange: (name: string) => void
  savedProjects: SavedProject[]
  onSaveProject: (name: string) => void
  onLoadProject: (name: string) => void
  onDeleteProject: (name: string) => void
  onNewProject: () => void
  onExportJson: (name: string) => void
  onExportAllJson: () => void
  onImportJson: (file: File) => void
  onExport: () => void
  exportLabel: string
  onOpenProjects: () => void
  projectsOpen: boolean
}

type Menu = 'project' | 'more' | null

const menuItem = 'w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm text-left hover:bg-accent disabled:opacity-40 disabled:pointer-events-none'

export function TopBar({
  params, projectName, onProjectNameChange, savedProjects, onSaveProject, onLoadProject,
  onDeleteProject, onNewProject, onExportJson, onExportAllJson, onImportJson, onExport, exportLabel,
  onOpenProjects, projectsOpen,
}: TopBarProps) {
  const [menu, setMenu] = useState<Menu>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const barRef = useRef<HTMLElement>(null)

  // Close the open menu on outside click or Escape
  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setMenu(null)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(buildShareLink(projectName.trim(), params))
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    } catch {
      alert('Could not copy the link — your browser blocked clipboard access.')
    }
  }

  const toggle = (m: Exclude<Menu, null>) => setMenu(menu === m ? null : m)
  const trimmed = projectName.trim()

  return (
    <header ref={barRef} className="relative z-30 flex items-center gap-2 h-12 px-3 border-b bg-card shrink-0">
      <span className="h-2.5 w-2.5 rounded-full bg-primary shrink-0" aria-hidden />
      <h1 className="font-medium text-sm whitespace-nowrap hidden sm:block">3D Box Generator</h1>

      <div
        className={`ml-1 flex items-stretch max-w-[16rem] rounded-lg border bg-secondary text-sm ${projectsOpen ? 'border-primary/60' : ''}`}
      >
        <button
          onClick={onOpenProjects}
          title="Open project manager"
          className="flex items-center gap-2 min-w-0 pl-2.5 pr-2 py-1.5 rounded-l-lg hover:bg-accent"
        >
          <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{trimmed || 'Untitled'}</span>
        </button>
        <button
          onClick={() => toggle('project')}
          aria-haspopup="menu"
          aria-expanded={menu === 'project'}
          aria-label="Project menu"
          className="px-1.5 border-l rounded-r-lg hover:bg-accent"
        >
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <div className="flex-1" />

      <button
        onClick={() => toggle('more')}
        aria-haspopup="menu"
        aria-expanded={menu === 'more'}
        aria-label="More"
        className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      <Button size="sm" onClick={onExport}>
        <Download className="mr-2 h-4 w-4" />
        {exportLabel}
      </Button>

      {menu === 'project' && (
        <div role="menu" className="absolute left-3 top-[calc(100%+4px)] w-72 rounded-xl border bg-popover p-2 shadow-2xl">
          <div className="flex gap-2 p-1">
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
              Save
            </Button>
          </div>

          {savedProjects.length > 0 && (
            <div className="mt-1 pt-1 border-t max-h-64 overflow-y-auto">
              {savedProjects.map((p) => (
                <div key={p.name} className="group flex items-center rounded-md hover:bg-accent">
                  <button
                    className="flex-1 min-w-0 flex items-center gap-2 px-2.5 py-2 text-left text-sm"
                    onClick={() => { onLoadProject(p.name); setMenu(null) }}
                  >
                    {p.name === trimmed
                      ? <Check className="h-4 w-4 shrink-0 text-primary" />
                      : <span className="w-4 shrink-0" />}
                    <span className="truncate">{p.name}</span>
                    <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
                      {p.params.width}×{p.params.depth}×{p.params.height}
                    </span>
                  </button>
                  <button
                    className="p-2 text-muted-foreground hover:text-red-400"
                    title="Delete project"
                    aria-label={`Delete ${p.name}`}
                    onClick={() => onDeleteProject(p.name)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-1 pt-1 border-t">
            <button className={menuItem} onClick={() => { onNewProject(); setMenu(null) }}>
              <Plus className="h-4 w-4" />
              New project
            </button>
          </div>
        </div>
      )}

      {menu === 'more' && (
        <div role="menu" className="absolute right-3 top-[calc(100%+4px)] w-60 rounded-xl border bg-popover p-1.5 shadow-2xl">
          <button className={menuItem} onClick={handleCopyShareLink}>
            {linkCopied ? <Check className="h-4 w-4 text-primary" /> : <Link2 className="h-4 w-4" />}
            {linkCopied ? 'Link copied' : 'Copy share link'}
          </button>
          <div className="my-1 border-t" />
          <button className={menuItem} onClick={() => { onExportJson(trimmed || 'box-project'); setMenu(null) }}>
            <FileDown className="h-4 w-4" />
            Export project JSON
          </button>
          <button className={menuItem} disabled={savedProjects.length === 0} onClick={() => { onExportAllJson(); setMenu(null) }}>
            <Archive className="h-4 w-4" />
            Export all projects ({savedProjects.length})
          </button>
          <button className={menuItem} onClick={() => importInputRef.current?.click()}>
            <FileUp className="h-4 w-4" />
            Import JSON
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onImportJson(file)
              e.target.value = ''
              setMenu(null)
            }}
          />
        </div>
      )}
    </header>
  )
}
