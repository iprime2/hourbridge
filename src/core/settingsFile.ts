import { DateTime } from 'luxon'
import {
  normalizeWorkHours,
  parsePersistedState,
  PERSIST_VERSION,
  type ResolvedState
} from './persistence'
import { DEFAULT_WORK_HOURS } from './timeEngine'

/** What the file says it is, so picking the wrong JSON file gives a clear message, not a surprise. */
export const SETTINGS_FILE_KIND = 'hourbridge-settings'

/** A settings file is a few kilobytes; anything near this is not one. */
export const MAX_SETTINGS_FILE_CHARS = 200_000
export const MAX_IMPORTED_CITIES = 100

export type SettingsSnapshot = Pick<ResolvedState, 'locations' | 'timeFormat' | 'theme' | 'workHours'>

export function settingsFileName(now: DateTime = DateTime.now()): string {
  return `hourbridge-settings-${now.toFormat('yyyy-LL-dd')}.json`
}

/** The settings as a file: the same shape as the stored state, plus what it is and when it was made. */
export function buildSettingsFile(state: SettingsSnapshot, now: DateTime = DateTime.now()): string {
  return `${JSON.stringify(
    {
      kind: SETTINGS_FILE_KIND,
      exportedAt: now.toUTC().toISO(),
      version: PERSIST_VERSION,
      locations: state.locations,
      timeFormat: state.timeFormat,
      theme: state.theme,
      workHours: normalizeWorkHours(state.workHours)
    },
    null,
    2
  )}\n`
}

export type SettingsFileResult = { ok: true; state: ResolvedState } | { ok: false; error: string }

const fail = (error: string): SettingsFileResult => ({ ok: false, error })

/**
 * Read a settings file. A file is untrusted input, so it goes through the same validation as the
 * stored state (unknown timezones dropped, one home, hours checked) and is size-limited first.
 * Nothing is applied here: the caller shows what is in it and asks.
 */
export function parseSettingsFile(text: string): SettingsFileResult {
  if (text.length > MAX_SETTINGS_FILE_CHARS) return fail('This file is too large to be a Hourbridge settings file.')
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return fail('This file is not valid JSON.')
  }
  if (!data || typeof data !== 'object' || (data as Record<string, unknown>).kind !== SETTINGS_FILE_KIND) {
    return fail('This is not a Hourbridge settings file.')
  }
  const record = data as Record<string, unknown>
  if (typeof record.version === 'number' && record.version > PERSIST_VERSION) {
    return fail('This file was made by a newer version of Hourbridge. Update the app and try again.')
  }
  if (Array.isArray(record.locations) && record.locations.length > MAX_IMPORTED_CITIES) {
    return fail(`This file has ${record.locations.length} cities; the most Hourbridge will import is ${MAX_IMPORTED_CITIES}.`)
  }
  const parsed = parsePersistedState(text)
  if (!parsed) return fail('The cities or time format in this file are missing or invalid.')
  return {
    ok: true,
    state: {
      version: PERSIST_VERSION,
      locations: parsed.locations,
      timeFormat: parsed.timeFormat,
      theme: parsed.theme ?? 'system',
      workHours: parsed.workHours ?? { ...DEFAULT_WORK_HOURS }
    }
  }
}
