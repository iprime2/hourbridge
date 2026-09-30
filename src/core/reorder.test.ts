import { describe, expect, it } from 'vitest'
import {
  insertionForPointer,
  insertionToFinalIndex,
  isNoopInsertion,
  moveItem
} from '@core/reorder'

const abcde = ['a', 'b', 'c', 'd', 'e']

describe('moveItem', () => {
  it('moves an item forward and backward', () => {
    expect(moveItem(abcde, 1, 3)).toEqual(['a', 'c', 'd', 'b', 'e'])
    expect(moveItem(abcde, 3, 0)).toEqual(['d', 'a', 'b', 'c', 'e'])
  })

  it('clamps the target to the list', () => {
    expect(moveItem(abcde, 2, 99)).toEqual(['a', 'b', 'd', 'e', 'c'])
    expect(moveItem(abcde, 2, -5)).toEqual(['c', 'a', 'b', 'd', 'e'])
  })

  it('returns an unchanged copy for a no-op or an invalid source', () => {
    expect(moveItem(abcde, 2, 2)).toEqual(abcde)
    expect(moveItem(abcde, -1, 2)).toEqual(abcde)
    expect(moveItem(abcde, 9, 2)).toEqual(abcde)
    expect(moveItem(abcde, 2, 2)).not.toBe(abcde)
  })

  it('never mutates its input and keeps every item exactly once', () => {
    const input = Object.freeze([...abcde])
    for (let from = 0; from < 5; from++) {
      for (let to = 0; to < 5; to++) {
        const out = moveItem(input, from, to)
        expect([...out].sort()).toEqual(abcde)
        expect(out[to]).toBe(abcde[from])
      }
    }
  })
})

describe('pointer → insertion gap', () => {
  it('uses the top half for "before" and the bottom half for "after"', () => {
    // A 60px row starting at y=100 sits at index 2: midpoint is y=130.
    expect(insertionForPointer(2, 101, 100, 60)).toBe(2)
    expect(insertionForPointer(2, 129, 100, 60)).toBe(2)
    expect(insertionForPointer(2, 130, 100, 60)).toBe(3)
    expect(insertionForPointer(2, 159, 100, 60)).toBe(3)
  })
})

describe('insertion gap → final index', () => {
  it('accounts for the removed item shifting later gaps', () => {
    // Drag row 1 ("b") …
    expect(insertionToFinalIndex(1, 0)).toBe(0) // above everything
    expect(insertionToFinalIndex(1, 1)).toBe(1) // back where it was
    expect(insertionToFinalIndex(1, 2)).toBe(1) // gap just below itself: still 1
    expect(insertionToFinalIndex(1, 4)).toBe(3) // above the last row
    expect(insertionToFinalIndex(1, 5)).toBe(4) // below the last row
  })

  it('round-trips through moveItem to put the item in the dropped gap', () => {
    for (let from = 0; from < 5; from++) {
      for (let gap = 0; gap <= 5; gap++) {
        const out = moveItem(abcde, from, insertionToFinalIndex(from, gap))
        // The dragged item must sit directly before whatever was at `gap` (or at the end).
        const beforeGap = abcde[gap] // undefined when dropping below the last row
        const dragged = abcde[from]
        const idx = out.indexOf(dragged)
        if (gap === from || gap === from + 1) {
          expect(out).toEqual(abcde)
        } else if (beforeGap === undefined) {
          expect(idx).toBe(4)
        } else {
          expect(out[idx + 1]).toBe(beforeGap)
        }
      }
    }
  })

  it('recognizes the two gaps that change nothing', () => {
    expect(isNoopInsertion(2, 2)).toBe(true)
    expect(isNoopInsertion(2, 3)).toBe(true)
    expect(isNoopInsertion(2, 1)).toBe(false)
    expect(isNoopInsertion(2, 4)).toBe(false)
    expect(isNoopInsertion(0, 0)).toBe(true)
  })
})
