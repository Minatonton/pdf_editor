import { describe, expect, it } from 'vitest'
import { transparentAlpha } from './imageFile'

describe('transparentAlpha', () => {
  it('白に近い紙の色は完全に透明にする', () => {
    expect(transparentAlpha(250, 248, 245)).toBe(0)
  })

  it('朱色の印影は、明るい赤でもそのまま残す', () => {
    expect(transparentAlpha(200, 40, 30)).toBe(255)
  })

  it('紙と印影の境目の色は、明るいほど透かしてギザギザにしない', () => {
    const pale = transparentAlpha(225, 225, 225)
    const darker = transparentAlpha(180, 180, 180)
    expect(pale).toBeGreaterThan(0)
    expect(pale).toBeLessThan(darker)
    expect(darker).toBeLessThan(255)
  })
})
