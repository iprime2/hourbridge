import { act } from '@testing-library/react'

type Listener = (event: MediaQueryListEvent) => void

/**
 * A controllable window.matchMedia for tests: set what each query currently matches, and fire the
 * "change" listeners that React (or our code) subscribed with.
 */
export function mockMatchMedia(initial: Record<string, boolean> = {}) {
  const state = new Map(Object.entries(initial))
  const listeners = new Map<string, Set<Listener>>()

  const matchMedia = (query: string): MediaQueryList => {
    const set = listeners.get(query) ?? new Set<Listener>()
    listeners.set(query, set)
    return {
      get matches() {
        return state.get(query) ?? false
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, fn: Listener) => void set.add(fn),
      removeEventListener: (_type: string, fn: Listener) => void set.delete(fn),
      addListener: (fn: Listener) => void set.add(fn),
      removeListener: (fn: Listener) => void set.delete(fn),
      dispatchEvent: () => true
    } as unknown as MediaQueryList
  }

  window.matchMedia = matchMedia

  return {
    /** Change what a query matches and notify its listeners (inside act, so React re-renders). */
    set(query: string, matches: boolean): void {
      state.set(query, matches)
      act(() => {
        for (const fn of listeners.get(query) ?? []) fn({ matches, media: query } as MediaQueryListEvent)
      })
    },
    listenerCount(query: string): number {
      return listeners.get(query)?.size ?? 0
    }
  }
}
