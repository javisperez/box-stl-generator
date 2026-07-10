import { BoxParams, clampDivisionThickness } from './boxGenerator'

export const DEFAULTS: BoxParams = {
  width: 80,
  depth: 60,
  height: 40,
  wallThickness: 2,
  includeLid: false,
  lidHeight: 5,
  lidTolerance: 0.3,
  divisionsX: [],
  divisionsZ: [],
  divisionThickness: 2,
  lidText: '',
  lidTextDepth: 0.8,
  lidTextSize: 16,
  lidTextStyle: 'engraved' as const,
  chamferSize: 0,
  includeHinge: false,
  hingeCount: 1,
  hingeDiameter: 8,
  hingePinDiameter: 2.5,
  lidStyle: 'lid' as const,
  sleeveTolerance: 0.3,
  sleeveCutout: true,
}

export interface SavedProject {
  name: string
  savedAt: string // ISO date
  params: BoxParams
}

const CURRENT_KEY = '3d-box-generator-project'
const PROJECTS_KEY = '3d-box-generator-projects'

const PROJECT_FILE_APP = '3d-box-generator'

// Merge unknown/partial data with defaults and enforce cross-field constraints.
// Handles older saves that predate newer params (e.g. divisionThickness).
export function normalizeParams(raw: unknown): BoxParams {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<BoxParams>
  const p: BoxParams = { ...DEFAULTS, ...src }
  // Older projects had dividers at the outer wall thickness
  if (src.divisionThickness == null) p.divisionThickness = p.wallThickness
  p.divisionThickness = clampDivisionThickness(p.divisionThickness, p.wallThickness)
  if (p.lidStyle !== 'sleeve') p.lidStyle = 'lid'
  if (!Array.isArray(p.divisionsX)) p.divisionsX = []
  if (!Array.isArray(p.divisionsZ)) p.divisionsZ = []
  return p
}

// ── Current working state (autosaved) ────────────────────────────────────────

export function loadCurrentParams(): BoxParams {
  try {
    const saved = localStorage.getItem(CURRENT_KEY)
    if (saved) return normalizeParams(JSON.parse(saved))
  } catch {}
  return DEFAULTS
}

export function saveCurrentParams(params: BoxParams) {
  try {
    localStorage.setItem(CURRENT_KEY, JSON.stringify(params))
  } catch {}
}

export function clearCurrentParams() {
  localStorage.removeItem(CURRENT_KEY)
}

// ── Named projects ────────────────────────────────────────────────────────────

export function loadProjects(): SavedProject[] {
  try {
    const saved = localStorage.getItem(PROJECTS_KEY)
    if (saved) {
      const list = JSON.parse(saved)
      if (Array.isArray(list)) {
        return list
          .filter((p): p is SavedProject => p && typeof p.name === 'string' && p.params)
          .map(p => ({ ...p, params: normalizeParams(p.params) }))
      }
    }
  } catch {}
  return []
}

export function persistProjects(projects: SavedProject[]) {
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects))
  } catch {}
}

// Insert or overwrite (case-insensitive name match), keeping the list sorted
export function upsertProject(projects: SavedProject[], name: string, params: BoxParams): SavedProject[] {
  const next = projects.filter(p => p.name.toLowerCase() !== name.toLowerCase())
  next.push({ name, savedAt: new Date().toISOString(), params })
  next.sort((a, b) => a.name.localeCompare(b.name))
  return next
}

// ── Shareable JSON files ──────────────────────────────────────────────────────

export function exportProjectFile(name: string, params: BoxParams) {
  const data = {
    app: PROJECT_FILE_APP,
    version: 1,
    name,
    exportedAt: new Date().toISOString(),
    params,
  }
  const slug = name.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'box-project'
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${slug}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Accepts files exported by exportProjectFile, or a bare params object
export function parseProjectFile(text: string): { name: string; params: BoxParams } {
  const data = JSON.parse(text)
  if (!data || typeof data !== 'object') throw new Error('Not a project file')
  const raw = data.params && typeof data.params === 'object' ? data.params : data
  if (typeof raw.width !== 'number' || typeof raw.depth !== 'number' || typeof raw.height !== 'number') {
    throw new Error('Missing box dimensions')
  }
  const name = typeof data.name === 'string' ? data.name : ''
  return { name, params: normalizeParams(raw) }
}
