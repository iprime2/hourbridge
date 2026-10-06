/** @vitest-environment jsdom */
// The iOS side of the adapter, with the Capacitor plugins replaced: nothing here can run on a real
// iPhone from Linux, so this pins down what the adapter asks the plugins to do.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const plugins = vi.hoisted(() => ({
  native: true,
  writeFile: vi.fn(async (_options: unknown) => ({ uri: 'file:///cache/x' })),
  getUri: vi.fn(async (_options: unknown) => ({ uri: 'file:///cache/settings.json' })),
  share: vi.fn(async (_options: unknown) => ({ activityType: 'save' }))
}))

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => plugins.native } }))
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile: plugins.writeFile, getUri: plugins.getUri },
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' }
}))
vi.mock('@capacitor/share', () => ({ Share: { share: plugins.share } }))
vi.mock('@capacitor/haptics', () => ({ Haptics: { selectionChanged: vi.fn(async () => undefined) } }))
vi.mock('@capacitor/preferences', () => ({ Preferences: { get: vi.fn(), set: vi.fn() } }))
vi.mock('@capacitor/status-bar', () => ({ StatusBar: { setStyle: vi.fn() }, Style: { Dark: 'DARK', Light: 'LIGHT' } }))

import { shareTextFile } from '@mobile/native'

describe('shareTextFile on iOS', () => {
  beforeEach(() => {
    plugins.native = true
    plugins.writeFile.mockClear()
    plugins.getUri.mockClear()
    plugins.share.mockClear()
    plugins.share.mockImplementation(async () => ({ activityType: 'save' }))
  })

  it('writes the text to the cache, then offers that file to the share sheet', async () => {
    await shareTextFile('hourbridge-settings-2026-10-06.json', '{"a":1}\n', 'Hourbridge settings')
    expect(plugins.writeFile).toHaveBeenCalledWith({
      path: 'hourbridge-settings-2026-10-06.json',
      data: '{"a":1}\n',
      directory: 'CACHE',
      encoding: 'utf8'
    })
    expect(plugins.getUri).toHaveBeenCalledWith({ path: 'hourbridge-settings-2026-10-06.json', directory: 'CACHE' })
    expect(plugins.share).toHaveBeenCalledWith({
      title: 'Hourbridge settings',
      url: 'file:///cache/settings.json',
      dialogTitle: 'Hourbridge settings'
    })
    // The file must exist before the sheet is opened.
    expect(plugins.writeFile.mock.invocationCallOrder[0]).toBeLessThan(plugins.share.mock.invocationCallOrder[0])
  })

  it('does not report a dismissed or failed share sheet as an error', async () => {
    plugins.share.mockImplementation(async () => {
      throw new Error('Share canceled')
    })
    await expect(shareTextFile('a.json', '{}', 'x')).resolves.toBeUndefined()
  })

  it('does not report a file that could not be written either, and does not open the sheet', async () => {
    plugins.writeFile.mockRejectedValueOnce(new Error('disk full'))
    await expect(shareTextFile('a.json', '{}', 'x')).resolves.toBeUndefined()
    expect(plugins.share).not.toHaveBeenCalled()
  })

  it('does nothing at all outside the native app (browsers download the file instead)', async () => {
    plugins.native = false
    await shareTextFile('a.json', '{}', 'x')
    expect(plugins.writeFile).not.toHaveBeenCalled()
    expect(plugins.share).not.toHaveBeenCalled()
  })
})
