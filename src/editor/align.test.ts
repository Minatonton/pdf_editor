import { describe, expect, it } from 'vitest'
import { alignMoves } from './align'

const boxes = [
  { id: 'a', x: 10, y: 0, width: 20, height: 10 },
  { id: 'b', x: 50, y: 30, width: 40, height: 20 },
  { id: 'c', x: 30, y: 100, width: 10, height: 10 },
]
const after = (how: Parameters<typeof alignMoves>[1]) =>
  Object.fromEntries(
    alignMoves(boxes, how).map((move) => {
      const box = boxes.find((b) => b.id === move.id)!
      return [move.id, [box.x + move.dx, box.y + move.dy]]
    }),
  )

describe('alignMoves', () => {
  it('左揃えでは、選んだもの全体の左端に合わせる', () => {
    expect(after('left')).toEqual({ a: [10, 0], b: [10, 30], c: [10, 100] })
  })

  it('左右中央揃えでは、全体の中央にそれぞれの中央を合わせる', () => {
    // 全体は 10〜90 なので中央は 50
    expect(after('centerX')).toEqual({ a: [40, 0], b: [30, 30], c: [45, 100] })
  })

  it('下揃えでは、全体の下端に合わせ、横には動かさない', () => {
    expect(after('bottom')).toEqual({ a: [10, 100], b: [50, 90], c: [30, 100] })
  })

  it('縦に等間隔では、上下の端のものは動かさず、間の隙間をそろえる', () => {
    // 全体の高さ 110 から高さの合計 40 を引いた 70 を、2つの隙間に 35 ずつ
    expect(after('distributeY')).toEqual({ a: [10, 0], b: [50, 45], c: [30, 100] })
  })
})
