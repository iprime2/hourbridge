/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { encodeShare } from '@core/shareLink'
import { useSharedLink } from '@core/useSharedLink'
import { DEFAULT_LOCATIONS } from '@core/timezones'

const go = (hash: string) => window.history.replaceState(null, '', `/app/?x=1${hash}`)

describe('useSharedLink', () => {
  beforeEach(() => go(''))
  afterEach(() => go(''))

  it('says there is no link when the address has none', () => {
    const { result } = renderHook(() => useSharedLink())
    expect(result.current.link).toEqual({ status: 'none' })
  })

  it('reads a link that is there when the page opens', () => {
    go(`#share=${encodeShare(DEFAULT_LOCATIONS)}`)
    const { result } = renderHook(() => useSharedLink())
    expect(result.current.link.status).toBe('ready')
    expect(result.current.link.status === 'ready' && result.current.link.cities).toHaveLength(5)
  })

  it('says invalid for a link it cannot read', () => {
    go('#share=zzz')
    const { result } = renderHook(() => useSharedLink())
    expect(result.current.link).toEqual({ status: 'invalid' })
  })

  it('notices a link pasted into the address bar of an open page', () => {
    const { result } = renderHook(() => useSharedLink())
    act(() => {
      go(`#share=${encodeShare(DEFAULT_LOCATIONS)}`)
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(result.current.link.status).toBe('ready')
  })

  it('takes the link out of the address on dismiss, and keeps the path and query', () => {
    go(`#share=${encodeShare(DEFAULT_LOCATIONS)}`)
    const { result } = renderHook(() => useSharedLink())
    act(() => result.current.dismiss())
    expect(result.current.link).toEqual({ status: 'none' })
    expect(window.location.hash).toBe('')
    expect(window.location.pathname + window.location.search).toBe('/app/?x=1')
  })

  it('stops listening when the page goes away', () => {
    const { unmount } = renderHook(() => useSharedLink())
    unmount()
    expect(() => window.dispatchEvent(new HashChangeEvent('hashchange'))).not.toThrow()
  })
})
