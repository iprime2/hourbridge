import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
  // Plain-Node test files (e.g. the service worker's) have no localStorage.
  if (typeof localStorage !== 'undefined') localStorage.removeItem('wtb:state')
})
