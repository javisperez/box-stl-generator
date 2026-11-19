import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { analyticsPresent, CONSENT_EVENT, getConsent, setConsent } from '@/utils/analytics'

// Shown only when analytics is actually deployed and no choice is saved yet.
// The footer's "Analytics settings" link reopens it so the choice can be changed.
export function ConsentBanner() {
  const [open, setOpen] = useState(() => analyticsPresent() && getConsent() === undefined)

  useEffect(() => {
    const reopen = () => setOpen(true)
    window.addEventListener(CONSENT_EVENT, reopen)
    return () => window.removeEventListener(CONSENT_EVENT, reopen)
  }, [])

  if (!open) return null
  const choose = (granted: boolean) => { setConsent(granted); setOpen(false) }

  return (
    <div
      role="dialog"
      aria-label="Analytics consent"
      className="fixed bottom-3 left-3 right-3 sm:left-auto sm:max-w-sm z-50 rounded-lg border bg-card p-4 shadow-lg"
    >
      <p className="text-sm text-muted-foreground">
        Allow anonymous usage analytics (Google Analytics) to help improve this tool?
      </p>
      <div className="mt-3 flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={() => choose(false)}>Decline</Button>
        <Button size="sm" onClick={() => choose(true)}>Accept</Button>
      </div>
    </div>
  )
}
