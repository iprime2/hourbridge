import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { DateTime } from 'luxon'
import {
  localCityOption,
  searchCities,
  type CityOption
} from '@core/cityOptions'
import { formatLiveClock } from '@core/formatters'
import type { TimeFormat } from '@core/timeEngine'

interface CityPickerProps {
  excludeIds: ReadonlySet<string>
  /** IANA zones already on the grid; hides the "My location" shortcut when it would duplicate one. */
  existingZones?: ReadonlySet<string>
  timeFormat: TimeFormat
  now: DateTime
  onPick: (city: CityOption) => void
  onEscape?: () => void
  autoFocus?: boolean
}

const RESULT_LIMIT = 30

/** Searchable, keyboard-navigable city list (ARIA combobox + listbox). Container-agnostic. */
export default function CityPicker({
  excludeIds,
  existingZones,
  timeFormat,
  now,
  onPick,
  onEscape,
  autoFocus = true
}: CityPickerProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()

  // Offset queries ("+5:30") depend on the current instant; minute precision is plenty.
  const nowMinute = Math.floor(now.toMillis() / 60_000)

  const results = useMemo(() => {
    const found = searchCities(query, excludeIds, { limit: RESULT_LIMIT, now })
    if (query.trim() === '') {
      const local = localCityOption()
      if (local && !existingZones?.has(local.iana) && !excludeIds.has(local.id)) {
        return [local, ...found]
      }
    }
    return found
  }, [query, excludeIds, existingZones, nowMinute])

  // Keep the highlighted row valid and in view as results change / arrows move.
  useEffect(() => {
    setActive((i) => Math.min(i, Math.max(0, results.length - 1)))
  }, [results.length])

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: 'nearest' })
  }, [active])

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(results.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      const pick = results[active]
      if (pick) {
        e.preventDefault()
        onPick(pick)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onEscape?.()
    }
  }

  return (
    <div className="city-picker">
      <input
        type="search"
        role="combobox"
        className="city-picker-input"
        placeholder="Search city, country, or UTC offset…"
        aria-label="Search cities"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={results[active] ? `${listId}-${results[active].id}` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
        }}
        onKeyDown={onKeyDown}
      />
      <ul
        id={listId}
        ref={listRef}
        className="city-picker-list"
        role="listbox"
        aria-label="Matching cities"
      >
        {results.length === 0 ? (
          <li className="city-picker-empty" role="presentation">
            No matching cities
          </li>
        ) : (
          results.map((city, index) => (
            <li
              key={city.id}
              id={`${listId}-${city.id}`}
              role="option"
              aria-selected={index === active}
              className="city-picker-item"
              onMouseMove={() => setActive(index)}
              onClick={() => onPick(city)}
            >
              <span>
                <span className="city-picker-label">{city.label}</span>{' '}
                <span className="city-picker-meta">{city.iana}</span>
              </span>
              <span className="city-picker-meta">{formatLiveClock(now, city.iana, timeFormat)}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
