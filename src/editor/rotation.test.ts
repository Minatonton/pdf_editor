import { describe, expect, it } from 'vitest'
import { angleFrom, snapAngle } from './rotation'

describe('angleFrom', () => {
  it('真上を 0 度とし、時計回りに増える', () => {
    const center = { x: 0, y: 0 }
    expect(angleFrom(center, { x: 0, y: -10 })).toBeCloseTo(0)
    expect(angleFrom(center, { x: 10, y: 0 })).toBeCloseTo(90)
    expect(angleFrom(center, { x: 0, y: 10 })).toBeCloseTo(180)
    expect(angleFrom(center, { x: -10, y: 0 })).toBeCloseTo(270)
  })
})

describe('snapAngle', () => {
  it('真っすぐの近くでは吸い寄せる', () => {
    expect(snapAngle(3, false)).toBe(0)
    expect(snapAngle(358, false)).toBe(0)
    expect(snapAngle(92, false)).toBe(90)
  })

  it('真っすぐから離れていれば、1 度単位でそのまま回す', () => {
    expect(snapAngle(33.4, false)).toBe(33)
  })

  it('Shift を押しているときは 15 度刻みにする', () => {
    expect(snapAngle(37, true)).toBe(30)
    expect(snapAngle(38, true)).toBe(45)
  })
})
