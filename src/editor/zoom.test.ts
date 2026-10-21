import { describe, expect, it } from 'vitest'
import { fitWidthZoom, stepZoom } from './zoom'

describe('stepZoom', () => {
  it('段の上にいるときは、隣の段に進む', () => {
    expect(stepZoom(1, 1)).toBe(1.25)
    expect(stepZoom(1, -1)).toBe(0.75)
  })

  it('ピンチで段の途中にいるときは、向かう側の最寄りの段に合わせる', () => {
    expect(stepZoom(1.1, 1)).toBe(1.25)
    expect(stepZoom(1.1, -1)).toBe(1)
  })

  it('端の段より先には進まない', () => {
    expect(stepZoom(3, 1)).toBe(3)
    expect(stepZoom(0.5, -1)).toBe(0.5)
  })
})

describe('fitWidthZoom', () => {
  it('一番幅の広いページが、表示する場所の幅に収まる倍率にする', () => {
    expect(fitWidthZoom(842, [595, 842])).toBe(1)
  })

  it('極端に小さく・大きくはしない', () => {
    expect(fitWidthZoom(10, [595])).toBe(0.25)
    expect(fitWidthZoom(100000, [595])).toBe(4)
  })
})
