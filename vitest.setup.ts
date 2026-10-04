import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { setHolidayLoader } from '@core/holidays'

// No public holidays anywhere unless a test asks for them: otherwise a test that uses the real
// "today" would pass on most days and fail on, say, 25 December or 26 January.
beforeEach(() => setHolidayLoader(null))

afterEach(() => {
  cleanup()
  // Plain-Node test files (e.g. the service worker's) have no localStorage.
  if (typeof localStorage !== 'undefined') localStorage.removeItem('wtb:state')
})
