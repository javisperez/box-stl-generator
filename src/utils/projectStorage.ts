import { BoxParams, clampDivisionThickness, LID_PATTERNS } from './boxGenerator'

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
  lidTextRotation: 0,
  lidPattern: 'none' as const,
  lidPatternSize: 8,
  lidPatternSpacing: 4,
  boxPattern: 'none' as const,
  boxPatternSize: 8,
  boxPatternSpacing: 4,
  chamferSize: 0,
  includeHinge: false,
  hingeCount: 1,
  hingeDiameter: 8,
  hingePinDiameter: 3, // snap-axle diameter; Ø3 is sturdy and still snaps easily
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
const CURRENT_NAME_KEY = '3d-box-generator-project-name'
const PROJECTS_KEY = '3d-box-generator-projects'
const SETTINGS_KEY = '3d-box-generator-settings'

const PROJECT_FILE_APP = '3d-box-generator'

// Filesystem-safe version of a project name, used in exported filenames
export function slugify(name: string): string {
  return name.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '')
}

// ── App settings (not part of any project) ────────────────────────────────────

export interface AppSettings {
  printerBedX: number
  printerBedY: number
  exportExpanded: boolean // floating export control expanded vs collapsed
}

export const DEFAULT_SETTINGS: AppSettings = {
  printerBedX: 220,
  printerBedY: 220,
  exportExpanded: true,
}

export function loadSettings(): AppSettings {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY)
    if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) }
  } catch {}
  return DEFAULT_SETTINGS
}

export function saveSettings(settings: AppSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {}
}

// Merge unknown/partial data with defaults and enforce cross-field constraints.
// Handles older saves that predate newer params (e.g. divisionThickness).
export function normalizeParams(raw: unknown): BoxParams {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<BoxParams>
  const p: BoxParams = { ...DEFAULTS, ...src }
  // Older projects had dividers at the outer wall thickness
  if (src.divisionThickness == null) p.divisionThickness = p.wallThickness
  p.divisionThickness = clampDivisionThickness(p.divisionThickness, p.wallThickness)
  if (p.lidStyle !== 'sleeve') p.lidStyle = 'lid'
  if (![0, 90, 180, 270].includes(p.lidTextRotation)) p.lidTextRotation = 0
  if (!LID_PATTERNS.some(o => o.value === p.lidPattern)) p.lidPattern = 'none'
  p.lidPatternSize = Math.min(Math.max(Number(p.lidPatternSize) || 8, 2), 30)
  p.lidPatternSpacing = Math.min(Math.max(Number(p.lidPatternSpacing) || 4, 1.5), 20)
  if (!LID_PATTERNS.some(o => o.value === p.boxPattern)) p.boxPattern = 'none'
  p.boxPatternSize = Math.min(Math.max(Number(p.boxPatternSize) || 8, 2), 30)
  p.boxPatternSpacing = Math.min(Math.max(Number(p.boxPatternSpacing) || 4, 1.5), 20)
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
  localStorage.removeItem(CURRENT_NAME_KEY)
}

export function loadCurrentProjectName(): string {
  try {
    return localStorage.getItem(CURRENT_NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveCurrentProjectName(name: string) {
  try {
    localStorage.setItem(CURRENT_NAME_KEY, name)
  } catch {}
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
  const slug = slugify(name) || 'box-project'
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
