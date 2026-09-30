/** Pure helpers for reordering a list by drag-and-drop or keyboard. */

/** A copy of `list` with the item at `from` moved so it ends up at index `to` (clamped). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list]
  if (from < 0 || from >= list.length) return next
  const target = Math.max(0, Math.min(list.length - 1, to))
  if (target === from) return next
  const [item] = next.splice(from, 1)
  next.splice(target, 0, item)
  return next
}

/**
 * Which gap the pointer is over: the top half of a row means "before it" (its own index),
 * the bottom half means "after it". Gaps are numbered 0 (above the first row) … length.
 */
export function insertionForPointer(
  rowIndex: number,
  pointerY: number,
  rowTop: number,
  rowHeight: number
): number {
  return pointerY < rowTop + rowHeight / 2 ? rowIndex : rowIndex + 1
}

/**
 * Convert a gap number (measured in the list *before* the dragged item is removed) into the
 * index the item ends up at afterwards. Removing it shifts every later gap down by one.
 */
export function insertionToFinalIndex(from: number, insertion: number): number {
  return insertion > from ? insertion - 1 : insertion
}

/** Dropping into the gap directly above or below the dragged row changes nothing. */
export function isNoopInsertion(from: number, insertion: number): boolean {
  return insertion === from || insertion === from + 1
}
