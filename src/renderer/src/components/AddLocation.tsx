import type { CityOption } from '@renderer/lib/cityOptions'
import { filterCityOptions } from '@renderer/lib/cityOptions'
import { useMemo, useState } from 'react'

interface AddLocationProps {
  excludeIds: ReadonlySet<string>
  onAdd: (city: CityOption) => void
}

export default function AddLocation({ excludeIds, onAdd }: AddLocationProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const results = useMemo(
    () => filterCityOptions(query, excludeIds).slice(0, 12),
    [query, excludeIds]
  )

  function handleAdd(city: CityOption) {
    onAdd(city)
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="add-location">
      {!open ? (
        <button
          type="button"
          className="btn btn-primary"
          aria-label="Add location"
          onClick={() => setOpen(true)}
        >
          + Add location
        </button>
      ) : (
        <div className="add-location-panel" role="dialog" aria-label="Add a location">
          <input
            type="search"
            className="add-location-input"
            placeholder="Search cities…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search cities"
            autoFocus
          />
          <ul className="add-location-results" role="listbox" aria-label="Matching cities">
            {results.length === 0 ? (
              <li className="add-location-empty">No matching cities</li>
            ) : (
              results.map((city) => (
                <li key={city.id}>
                  <button
                    type="button"
                    className="add-location-option"
                    role="option"
                    onClick={() => handleAdd(city)}
                  >
                    <span className="add-location-label">{city.label}</span>
                    <span className="add-location-zone">{city.iana}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
          <button
            type="button"
            className="btn btn-ghost"
            aria-label="Cancel add location"
            onClick={() => {
              setOpen(false)
              setQuery('')
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
