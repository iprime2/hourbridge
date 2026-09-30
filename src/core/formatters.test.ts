import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'
import {
  describeTilePhase,
  formatOffsetHours,
  formatTileTime,
  formatZoneAbbr,
  tileTimeParts
} from '@core/formatters'

describe('formatters', () => {
  it('formats half-hour offsets', () => {
    expect(formatOffsetHours(-9.5)).toBe('−9:30')
    expect(formatOffsetHours(5.5)).toBe('+5:30')
    expect(formatOffsetHours(0)).toBe('0')
  })

  it('formats tile times with half hours', () => {
    expect(formatTileTime(2, 30, '12h')).toBe('2:30a')
    expect(formatTileTime(14, 30, '24h')).toBe('14:30')
    expect(formatTileTime(12, 0, '12h')).toBe('12p')
  })
})

describe('tileTimeParts', () => {
  it('splits digits from the am/pm suffix', () => {
    expect(tileTimeParts(0, 0, '12h')).toEqual({ digits: '12', suffix: 'a' })
    expect(tileTimeParts(12, 30, '12h')).toEqual({ digits: '12:30', suffix: 'p' })
    expect(tileTimeParts(23, 45, '12h')).toEqual({ digits: '11:45', suffix: 'p' })
    expect(tileTimeParts(9, 0, '24h')).toEqual({ digits: '09', suffix: '' })
    expect(tileTimeParts(21, 30, '24h')).toEqual({ digits: '21:30', suffix: '' })
  })

  it('always recombines to formatTileTime', () => {
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 30, 45]) {
        for (const mode of ['12h', '24h'] as const) {
          const { digits, suffix } = tileTimeParts(h, m, mode)
          expect(`${digits}${suffix}`).toBe(formatTileTime(h, m, mode))
        }
      }
    }
  })
})

describe('formatZoneAbbr', () => {
  const winter = DateTime.fromISO('2024-01-15T12:00:00Z')
  const summer = DateTime.fromISO('2024-07-15T12:00:00Z')

  it('uses a real abbreviation where the platform has one', () => {
    expect(formatZoneAbbr(winter.setZone('America/New_York'))).toBe('EST')
    expect(formatZoneAbbr(summer.setZone('America/New_York'))).toBe('EDT')
    expect(formatZoneAbbr(summer.setZone('America/Los_Angeles'))).toBe('PDT')
  })

  it('falls back to a readable UTC offset instead of "GMT+5:30"', () => {
    expect(formatZoneAbbr(winter.setZone('Asia/Kolkata'))).toBe('UTC+5:30')
    expect(formatZoneAbbr(winter.setZone('Asia/Tokyo'))).toBe('UTC+9')
    expect(formatZoneAbbr(winter.setZone('Asia/Kathmandu'))).toBe('UTC+5:45')
    expect(formatZoneAbbr(winter.setZone('America/St_Johns'))).toBe('UTC−3:30')
  })

  it('shows London as UTC+1 in summer (BST), UTC in winter', () => {
    expect(formatZoneAbbr(summer.setZone('Europe/London'))).toBe('UTC+1')
    expect(formatZoneAbbr(winter.setZone('Europe/London'))).toBe('UTC')
    expect(formatZoneAbbr(winter.setZone('UTC'))).toBe('UTC')
  })
})

describe('describeTilePhase', () => {
  it('words each state without relying on colour', () => {
    expect(describeTilePhase('work', false)).toBe('your working hours')
    expect(describeTilePhase('work', true)).toBe('your working hours, night there')
    expect(describeTilePhase('awake', false)).toBe('awake')
    expect(describeTilePhase('night', true)).toBe('night')
  })
})
