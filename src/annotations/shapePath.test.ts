import { describe, expect, it } from 'vitest'
import { normalizePoints, shapePath } from './shapePath'

const base = { width: 100, height: 50, points: [] as [number, number][], strokeWidth: 2 }

describe('shapePath', () => {
  it('四角は箱の4つの角を結んで閉じる', () => {
    expect(shapePath({ ...base, variant: 'rectangle' })).toBe('M 0 0 L 100 0 L 100 50 L 0 50 Z')
  })

  it('楕円は箱の4辺の中点を通る', () => {
    const path = shapePath({ ...base, variant: 'ellipse' })
    expect(path.startsWith('M 0 25')).toBe(true)
    for (const point of ['50 0', '100 25', '50 50']) expect(path).toContain(point)
  })

  it('線は割合で持った点を、今の箱の大きさに引き伸ばして結ぶ', () => {
    const path = shapePath({ ...base, variant: 'line', points: [[0, 1], [1, 0]] })
    expect(path).toBe('M 0 50 L 100 0')
  })

  it('矢印は終点に矢じりを付ける', () => {
    const path = shapePath({ ...base, variant: 'arrow', points: [[0, 0], [1, 0]], width: 100, height: 0 })
    expect(path.startsWith('M 0 0 L 100 0 M')).toBe(true)
    expect(path.endsWith('L 100 0 L ' + path.split(' L 100 0 L ')[1])).toBe(true)
  })
})

describe('normalizePoints', () => {
  it('点を囲む箱と、箱に対する割合の点に分ける', () => {
    expect(normalizePoints([{ x: 10, y: 40 }, { x: 30, y: 20 }])).toEqual({
      x: 10,
      y: 20,
      width: 20,
      height: 20,
      points: [[0, 1], [1, 0]],
    })
  })

  it('水平な線は高さが 0 になり、縦の割合は 0 にそろえる', () => {
    expect(normalizePoints([{ x: 0, y: 5 }, { x: 10, y: 5 }]).points).toEqual([[0, 0], [1, 0]])
  })
})
