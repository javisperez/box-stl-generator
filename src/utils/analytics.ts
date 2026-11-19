import { createTracker } from 'pages-analytics/track'
import type { BoxParams } from './boxGenerator'

// Typed event map. Params are deliberately coarse (kinds, counts, sizes in
// buckets): never project names, lid text or file contents.
// No-ops when the deploy didn't inject an analytics snippet (dev, forks).
export interface AnalyticsEvents {
  app_opened: { source: 'direct' | 'share_link' }
  stl_exported: {
    part: 'box' | 'lid' | 'sleeve' | 'baseplate' | 'all'
    lid_style: 'none' | 'lid' | 'sleeve'
    hinged: boolean
    gridfinity: boolean
  }
  project_saved: undefined
  project_loaded: undefined
  project_duplicated: undefined
  project_deleted: undefined
  project_created: undefined
  project_json_exported: { scope: 'single' | 'library' }
  project_json_imported: { kind: 'project' | 'library' | 'invalid' }
  share_link_copied: undefined
  tab_viewed: { tab: 'box' | 'lid' | 'print' }
  feature_changed: { feature: string; value: string }
  view_mode_changed: { mode: string }
}

export const track = createTracker<AnalyticsEvents>()

// The settings that define what kind of box someone is making. Sliders are left
// out on purpose (they fire continuously); these are discrete choices.
const FEATURES: (keyof BoxParams)[] = [
  'gridfinity', 'includeLid', 'lidStyle', 'includeHinge', 'sleeveAxis',
  'lidPattern', 'boxPattern', 'lidTextStyle', 'fingerSlotAxes', 'dimensionMode',
]

export function trackFeatureChanges(prev: BoxParams, next: BoxParams) {
  for (const key of FEATURES) {
    if (prev[key] !== next[key]) track('feature_changed', { feature: key, value: String(next[key]) })
  }
}

// ── Consent ───────────────────────────────────────────────────────────────────
// The build injects GA in consent mode (denied until granted, choice saved in
// localStorage and replayed on later visits) — see vite.config.ts. The banner
// reports the visitor's choice through these.
export { getConsent, setConsent } from 'pages-analytics/track'
export const CONSENT_EVENT = 'analytics-consent-reopen'

// True only when the deploy injected a GA4 snippet (never in dev or forks)
export const analyticsPresent = () =>
  !!document.querySelector('script[src*="googletagmanager.com/gtag/js"]')
