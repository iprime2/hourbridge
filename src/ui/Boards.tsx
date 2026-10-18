import '@ui/people.css'
import { useState } from 'react'
import { MAX_BOARD_NAME_LENGTH, MAX_BOARDS } from '@core/persistence'

export interface BoardSummary {
  id: string
  name: string
  cities: number
}

/** Everything the board controls need; one prop so it can pass through the toolbar and settings. */
export interface BoardControls {
  boards: readonly BoardSummary[]
  activeBoard: string
  onSwitch: (id: string) => void
  onCreate: (name: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}

/** A select for the board on screen. Nothing at all while there is only one board. */
export function BoardSwitcher({ boards, activeBoard, onSwitch, className }: BoardControls & { className?: string }) {
  if (boards.length < 2) return null
  return (
    <select
      className={['settings-select', 'board-switcher', className].filter(Boolean).join(' ')}
      aria-label="Board"
      value={activeBoard}
      onChange={(e) => onSwitch(e.target.value)}
    >
      {boards.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  )
}

const cityCount = (n: number): string => `${n} ${n === 1 ? 'city' : 'cities'}`

/** The Settings section: make, rename, switch and delete boards. */
export function BoardsSettings({ boards, activeBoard, onSwitch, onCreate, onRename, onDelete }: BoardControls) {
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const full = boards.length >= MAX_BOARDS

  return (
    <div className="settings-field">
      <span className="settings-label">Boards</span>
      <ul className="board-list" aria-label="Boards">
        {boards.map((b) => {
          const isActive = b.id === activeBoard
          return (
            <li key={b.id} className={['board-item', isActive ? 'is-active' : ''].filter(Boolean).join(' ')}>
              {renaming === b.id ? (
                <form
                  className="board-rename"
                  onSubmit={(e) => {
                    e.preventDefault()
                    onRename(b.id, draft)
                    setRenaming(null)
                  }}
                >
                  <input
                    className="city-picker-input"
                    aria-label={`New name for ${b.name}`}
                    value={draft}
                    maxLength={MAX_BOARD_NAME_LENGTH}
                    autoFocus
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.stopPropagation()
                        setRenaming(null)
                      }
                    }}
                  />
                  <button type="submit" className="btn btn-primary" disabled={!draft.trim()}>
                    Save
                  </button>
                </form>
              ) : (
                <>
                  <span className="board-name">
                    {b.name}
                    <span className="board-count"> · {cityCount(b.cities)}</span>
                    {isActive ? <span className="badge board-badge">Showing</span> : null}
                  </span>
                  <span className="board-actions">
                    {!isActive ? (
                      <button type="button" className="btn btn-ghost" aria-label={`Show ${b.name}`} onClick={() => onSwitch(b.id)}>
                        Show
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      aria-label={`Rename ${b.name}`}
                      onClick={() => {
                        setDraft(b.name)
                        setRenaming(b.id)
                        setConfirmDelete(null)
                      }}
                    >
                      Rename
                    </button>
                    {boards.length > 1 ? (
                      confirmDelete === b.id ? (
                        <button
                          type="button"
                          className="btn btn-danger"
                          aria-label={`Delete ${b.name} and its ${cityCount(b.cities)}`}
                          onClick={() => {
                            onDelete(b.id)
                            setConfirmDelete(null)
                          }}
                        >
                          Confirm delete
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          aria-label={`Delete ${b.name}`}
                          onClick={() => setConfirmDelete(b.id)}
                        >
                          Delete
                        </button>
                      )
                    ) : null}
                  </span>
                </>
              )}
            </li>
          )
        })}
      </ul>
      <form
        className="board-new"
        onSubmit={(e) => {
          e.preventDefault()
          if (full) return
          onCreate(newName)
          setNewName('')
        }}
      >
        <input
          className="city-picker-input"
          aria-label="New board name"
          placeholder="New board, e.g. Team or Family"
          value={newName}
          maxLength={MAX_BOARD_NAME_LENGTH}
          disabled={full}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" className="btn" disabled={full}>
          New board
        </button>
      </form>
      <span className="settings-hint">
        {full
          ? `That is the most boards Hourbridge keeps (${MAX_BOARDS}). Delete one to make another.`
          : 'Each board is its own list of cities, for a team, a client or family. A new board starts with just your home city.'}
      </span>
    </div>
  )
}
