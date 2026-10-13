import '@ui/shared.css'
import { mergeShared, type SharedLink, type SharedLocation } from '@core/shareLink'
import type { Location } from '@core/timezones'

interface SharedCitiesPromptProps {
  link: SharedLink
  /** Your cities now, to say how many of the shared ones are new to you. */
  current: readonly Location[]
  onReplace: (cities: readonly SharedLocation[]) => void
  onAdd: (cities: readonly SharedLocation[]) => void
  onDismiss: () => void
}

const SHOWN_NAMES = 6

/** "Miami, IST, London" — the first few, then how many more. */
function nameList(cities: readonly SharedLocation[]): string {
  const names = cities.slice(0, SHOWN_NAMES).map((c) => c.label)
  const more = cities.length - names.length
  return more > 0 ? `${names.join(', ')} and ${more} more` : names.join(', ')
}

/**
 * Shown when the page was opened from a link that carries a list of cities. Nothing changes until
 * the person chooses: add the new ones to theirs, replace theirs, or leave it.
 */
export default function SharedCitiesPrompt({ link, current, onReplace, onAdd, onDismiss }: SharedCitiesPromptProps) {
  if (link.status === 'none') return null

  if (link.status === 'invalid') {
    return (
      <aside className="shared-prompt" role="region" aria-label="Shared cities">
        <p className="shared-text">
          <strong>This link’s list of cities could not be read.</strong> It may have been cut off or edited.
        </p>
        <div className="shared-actions">
          <button type="button" className="btn btn-ghost" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </aside>
    )
  }

  const { cities } = link
  const fresh = mergeShared(current, cities).length - current.length
  return (
    <aside className="shared-prompt" role="region" aria-label="Shared cities">
      <p className="shared-text">
        <strong>
          {cities.length} {cities.length === 1 ? 'city was' : 'cities were'} shared with you:
        </strong>{' '}
        {nameList(cities)}.{fresh === 0 ? ' You already have all of them.' : ''}
      </p>
      <div className="shared-actions">
        {fresh > 0 ? (
          <button type="button" className="btn btn-primary" onClick={() => onAdd(cities)}>
            Add {fresh} new {fresh === 1 ? 'city' : 'cities'}
          </button>
        ) : null}
        <button type="button" className="btn" onClick={() => onReplace(cities)}>
          Replace my cities
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </aside>
  )
}
